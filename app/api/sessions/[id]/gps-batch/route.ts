/**
 * GPS Batch Ingest API
 * POST /api/sessions/[id]/gps-batch
 *
 * Receives a batch of GPS points from the mobile client, validates the session,
 * filters points through the compliance verifier, persists accepted points, and
 * triggers compliance + reward updates.
 *
 * CRITICAL: This is the ONLY path that writes GPS points. The mobile client
 * must NEVER be trusted for compliance — only the output of this endpoint
 * feeds the reward engine.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  buildCorridorSegments,
  COMPLIANCE_ALGORITHM_VERSION,
  GpsPoint,
  LatLon,
  ZoneVisitState,
  verifyGpsBatch,
  ZonePolygon,
} from "@/lib/services/complianceVerifier";
import { triggerRewardUpdate } from "@/lib/services/rewardTrigger";
import { publishRiderPositionUpdate } from "@/lib/services/realtimePublisher";
import { logSessionEvent } from "@/lib/services/sessionLogger";

// ─── Request schema ───────────────────────────────────────────────────────────

const GpsPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  speed_kmh: z.number().min(0).nullable().optional(),
  accuracy_m: z.number().min(0).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  recorded_at: z.string().datetime(),
  batch_id: z.string().uuid().optional(),
});

const GpsBatchBodySchema = z.object({
  points: z.array(GpsPointSchema).min(1).max(100),
  batch_id: z.string().uuid(),
});

type RouteContext = { params: Promise<{ id: string }> };

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id: sessionId } = await params;

  const supabase = createClient(
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── 1. Parse + validate body ────────────────────────────────────────────────
  let body: z.infer<typeof GpsBatchBodySchema>;
  try {
    const raw = await request.json();
    body = GpsBatchBodySchema.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request body", detail: String(err) },
      { status: 400 },
    );
  }

  // ── 2. Load and validate session ────────────────────────────────────────────
  const { data: session, error: sessionError } = await supabase
    .from("ride_session")
    .select(
      "id, rider_id, status, earning_mode, campaign_id, suggested_route_id, algorithm_version",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!["active", "paused"].includes(session.status)) {
    return NextResponse.json(
      { error: "Session is not active", status: session.status },
      { status: 409 },
    );
  }

  // ── 3. Deduplicate: skip batch_id already received ──────────────────────────
  const { count: existingBatchCount } = await supabase
    .from("ride_gps_point")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("batch_id", body.batch_id);

  if ((existingBatchCount ?? 0) > 0) {
    return NextResponse.json(
      { status: "duplicate", message: "Batch already received" },
      { status: 200 },
    );
  }

  // ── 4. Fetch last accepted point for jump detection ──────────────────────────
  const { data: lastPointRow } = await supabase
    .from("ride_gps_point")
    .select("lat, lon, speed_kmh, accuracy_m, heading, recorded_at")
    .eq("session_id", sessionId)
    .eq("filter_status", "accepted")
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastAccepted: GpsPoint | null = lastPointRow
    ? {
        lat: lastPointRow.lat,
        lon: lastPointRow.lon,
        speed_kmh: lastPointRow.speed_kmh ?? null,
        accuracy_m: lastPointRow.accuracy_m ?? null,
        heading: lastPointRow.heading ?? null,
        recorded_at: lastPointRow.recorded_at,
      }
    : null;

  // ── 5. Load zone polygons for boosted rides ─────────────────────────────────
  let zoneStates: ZoneVisitState[] = [];

  if (session.earning_mode === "ad_enhanced_ride" && session.campaign_id) {
    const { data: zoneRows } = await supabase
      .from("campaign_zone_geojson")
      .select("id, geojson")
      .eq("campaign_id", session.campaign_id);

    // Build zone states from active zone polygons
    const existingVisits = await supabase
      .from("zone_visit")
      .select("campaign_zone_id, entered_at")
      .eq("session_id", sessionId)
      .is("exited_at", null);

    const openVisitsByZone = new Map<string, string>(
      (existingVisits.data ?? []).map((v) => [
        v.campaign_zone_id,
        v.entered_at,
      ]),
    );

    zoneStates = (zoneRows ?? []).map((row): ZoneVisitState => {
      let polygon: ZonePolygon = { outer: [] };
      try {
        const gj =
          typeof row.geojson === "string"
            ? JSON.parse(row.geojson)
            : row.geojson;
        if (gj?.type === "Polygon" && Array.isArray(gj.coordinates)) {
          const toLL = (c: number[]): LatLon => ({ lat: c[1], lon: c[0] });
          polygon = {
            outer: (gj.coordinates[0] ?? []).map(toLL),
            holes: gj.coordinates
              .slice(1)
              .map((ring: number[][]) => ring.map(toLL)),
          };
        }
      } catch {
        // malformed geojson — treat as empty polygon
      }

      const enteredAt = openVisitsByZone.get(row.id) ?? null;
      return {
        zoneId: row.id,
        polygon,
        state: enteredAt ? "inside" : "outside",
        enteredAt,
        pointsInZone: 0,
        speedSumInZone: 0,
        hasSpeedViolation: false,
      };
    });
  }

  // ── 6. Load corridor segments for standard-ride bonus routes ─────────────────────
  let corridorSegments: ReturnType<typeof buildCorridorSegments> = [];
  let corridorToleranceM = 30;

  if (session.suggested_route_id) {
    const { data: routeRow } = await supabase
      .from("suggested_routes")
      .select("geometry, tolerance_m")
      .eq("id", session.suggested_route_id)
      .maybeSingle();

    if (routeRow) {
      const geometry: { lat: number; lng: number }[] = Array.isArray(
        routeRow.geometry,
      )
        ? routeRow.geometry
        : [];
      const waypoints: LatLon[] = geometry.map((p) => ({
        lat: p.lat,
        lon: p.lng,
      }));
      corridorSegments = buildCorridorSegments(waypoints);
      corridorToleranceM = routeRow.tolerance_m ?? 30;
    }
  }

  // ── 7. Run compliance verifier ───────────────────────────────────────────────
  const rawPoints: GpsPoint[] = body.points.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    speed_kmh: p.speed_kmh ?? null,
    accuracy_m: p.accuracy_m ?? null,
    heading: p.heading ?? null,
    recorded_at: p.recorded_at,
    batch_id: body.batch_id,
  }));

  const result = verifyGpsBatch({
    rawPoints,
    lastAccepted,
    zoneStates,
    corridorSegments,
    corridorToleranceM,
    suggestedRouteId: session.suggested_route_id ?? null,
  });

  // ── 8. Persist GPS points ────────────────────────────────────────────────────
  const allPointsToInsert = [
    ...result.acceptedPoints.map((p) => ({
      session_id: sessionId,
      lat: p.lat,
      lon: p.lon,
      speed_kmh: p.speed_kmh,
      accuracy_m: p.accuracy_m,
      heading: p.heading,
      recorded_at: p.recorded_at,
      batch_id: body.batch_id,
      filter_status: "accepted" as const,
    })),
    ...result.rejectedPoints.map((p) => ({
      session_id: sessionId,
      lat: p.lat,
      lon: p.lon,
      speed_kmh: p.speed_kmh ?? null,
      accuracy_m: p.accuracy_m ?? null,
      heading: p.heading ?? null,
      recorded_at: p.recorded_at,
      batch_id: body.batch_id,
      filter_status: p.filter_status,
    })),
  ];

  if (allPointsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("ride_gps_point")
      .upsert(allPointsToInsert, {
        onConflict: "session_id,recorded_at",
        ignoreDuplicates: true,
      });

    if (insertError) {
      logger.error("Failed to insert GPS points", insertError as Error, {
        sessionId,
        batchId: body.batch_id,
      });
      return NextResponse.json(
        { error: "Failed to store GPS points" },
        { status: 500 },
      );
    }
  }

  // ── 9. Persist zone visit updates ────────────────────────────────────────────
  for (const update of result.zoneVisitUpdates) {
    if (update.enteredAt) {
      // Zone entered — open a new zone_visit row
      await supabase.from("zone_visit").upsert(
        {
          session_id: sessionId,
          campaign_zone_id: update.zoneId,
          entered_at: update.enteredAt,
        },
        { onConflict: "session_id,campaign_zone_id", ignoreDuplicates: true },
      );
    }

    if (update.completed) {
      const c = update.completed;
      // Close the open zone_visit row
      await supabase
        .from("zone_visit")
        .update({
          exited_at: c.exitedAt,
          dwell_time_s: c.dwellTimeS,
          avg_speed_in_zone_kmh: c.avgSpeedInZoneKmh,
          impression_units: c.impressionUnits,
          point_count_in_zone: c.pointCountInZone,
          speed_violation: c.speedViolation,
        })
        .eq("session_id", sessionId)
        .eq("campaign_zone_id", update.zoneId)
        .is("exited_at", null);

      logSessionEvent(logger, "zone_exited", sessionId, session.rider_id, {
        zone_id: update.zoneId,
        dwell_s: c.dwellTimeS,
        impression_units: c.impressionUnits,
        avg_speed_kmh: c.avgSpeedInZoneKmh,
        speed_violation: c.speedViolation,
      });
    }
  }

  // ── 10. Update corridor compliance ───────────────────────────────────────────
  if (result.corridorUpdate) {
    const cu = result.corridorUpdate;
    const { data: existing } = await supabase
      .from("corridor_compliance")
      .select("compliant_distance_m, total_distance_m")
      .eq("session_id", sessionId)
      .eq("suggested_route_id", cu.suggestedRouteId)
      .maybeSingle();

    const prevCompliant = existing?.compliant_distance_m ?? 0;
    const prevTotal = existing?.total_distance_m ?? 0;
    const newCompliant = prevCompliant + cu.additionalCompliantDistanceM;
    const newTotal = prevTotal + cu.additionalTotalDistanceM;
    const newPct = newTotal > 0 ? (newCompliant / newTotal) * 100 : 0;

    await supabase.from("corridor_compliance").upsert(
      {
        session_id: sessionId,
        suggested_route_id: cu.suggestedRouteId,
        compliant_distance_m: newCompliant,
        total_distance_m: newTotal,
        compliance_pct: newPct,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,suggested_route_id" },
    );
  }

  // ── 11. Write anti-spoof flags ───────────────────────────────────────────────
  if (result.flags.length > 0) {
    const flagRows = result.flags.map((f) => ({
      session_id: sessionId,
      flag_type: f.flag_type,
      severity: f.severity,
      metadata: { ...f.metadata, batch_id: body.batch_id },
    }));
    await supabase.from("session_flag").insert(flagRows);

    const hasCritical = result.flags.some((f) => f.severity === "critical");
    if (hasCritical) {
      await supabase
        .from("ride_session")
        .update({ status: "under_review" })
        .eq("id", sessionId);
    }
  }

  // ── 12. Trigger incremental reward update ────────────────────────────────────
  if (result.acceptedPoints.length > 0) {
    triggerRewardUpdate({ sessionId, supabase }).catch((err) => {
      logger.warn("Reward update failed non-critically", {
        sessionId,
        error: String(err),
      });
    });
  }

  // ── 13. Publish to admin realtime feed ───────────────────────────────────────
  const lastPoint =
    result.acceptedPoints[result.acceptedPoints.length - 1] ?? null;
  if (lastPoint) {
    const openZones = zoneStates
      .filter((z) => z.state === "inside")
      .map((z) => z.zoneId);

    publishRiderPositionUpdate(supabase, {
      sessionId,
      riderId: session.rider_id,
      lat: lastPoint.lat,
      lon: lastPoint.lon,
      speedKmh: lastPoint.speed_kmh ?? 0,
      heading: lastPoint.heading ?? null,
      rideType: session.earning_mode,
      campaignId: session.campaign_id ?? null,
      currentZoneIds: openZones,
      flags: result.flags,
    }).catch(() => {});
  }

  // ── 14. Structured log ───────────────────────────────────────────────────────
  logSessionEvent(logger, "gps_batch_received", sessionId, session.rider_id, {
    batch_id: body.batch_id,
    point_count: body.points.length,
    accepted_count: result.acceptedPoints.length,
    rejected_count: result.rejectedPoints.length,
    zone_updates: result.zoneVisitUpdates.length,
    flags: result.flags.map((f) => f.flag_type),
  });

  return NextResponse.json({
    status: "ok",
    accepted: result.acceptedPoints.length,
    rejected: result.rejectedPoints.length,
    flags: result.flags.length,
  });
}
