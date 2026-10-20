"use server";

import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  BikeType,
  RideSession,
  RideSessionFilters,
  RideSessionStatus,
  rideSessionFiltersSchema,
} from "@/schemas";
import {
  DB_TABLES,
  META_KEYS,
  REWARD_SOURCE,
  VERIFICATION_STATUS,
} from "@/lib/rewardConstants";

/**
 * Platform-wide distance and CO₂ impact aggregation.
 * CO₂ methodology: 0.180 kg/km = average car emission offset by biking.
 */
export async function getDistanceStats(): Promise<{
  success: boolean;
  data?: {
    totalDistanceKm: number;
    co2SavedKg: number;
    sessionCount: number;
  };
  error?: string;
}> {
  try {
    await requireCapability("rides.read");
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase.rpc("get_impact_summary", { p_rider: null });
    if (error || !data?.[0]) return { success: false, error: "Impact summary unavailable" };
    const metric = data[0];
    const totalDistanceKm = Number(metric.total_distance_km);
    const co2SavedKg = Number(metric.co2_saved_kg);
    const rows = { length: Number(metric.total_rides) };

    return {
      success: true,
      data: { totalDistanceKm, co2SavedKg, sessionCount: rows.length },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch distance stats",
    };
  }
}

/** Read the authoritative ride verdict and committed reward ledger. */
export async function getRideSessions(
  filters?: RideSessionFilters,
): Promise<{ success: boolean; data?: RideSession[]; error?: string }> {
  try {
    await requireCapability("rides.read");
    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch ride sessions.
    // Column contract (mobile source of truth):
    //   completed_at   ← mobile's ride_session.completed_at  (not ended_at)
    //   moving_time_ms ← mobile's moving_time in ms          (not moving_time)
    //   rider_route_id ← mobile's FK to rider_route          (not route_assignment_id)
    //   verification_result ← JSONB machine verdict written at ride end
    // points_awarded / verified_minutes are sourced from reward_transactions, NOT ride_session columns.
    const parsedFilters = rideSessionFiltersSchema.parse(filters ?? {});
    const { data: sessionRows, error: sessionError } = await supabaseAdmin.rpc("ops_ride_session_page", { p_filters: parsedFilters });

    if (sessionError) {
      return { success: false, error: sessionError.message };
    }

    const rows = (sessionRows ?? []) as Array<Record<string, any>>;
    const riderIds = [...new Set(rows.map((r) => r.rider_id).filter(Boolean))];
    const campaignIds = [
      ...new Set(rows.map((r) => r.campaign_id).filter(Boolean)),
    ];

    // ── Machine verification verdicts ─────────────────────────────────────────
    // Primary source: ride_session.verification_result JSONB written by mobile at
    // ride completion. This is the canonical machine verdict — always present for
    // rides that completed the full verification pipeline.
    const machineVerdictMap = new Map<
      string,
      {
        status: string;
        qualityScore?: number;
        reasonCodes?: string[];
        detectedMaxSpeedKmh?: number;
        maxAllowedSpeedKmh?: number;
        notes?: string;
      }
    >();
    rows.forEach((row) => {
      const vr = (row as Record<string, unknown>).verification_result as
        | Record<string, unknown>
        | null
        | undefined;
      if (!vr || typeof vr !== "object") return;
      machineVerdictMap.set(row.id, {
        status: String(vr.status ?? VERIFICATION_STATUS.PENDING),
        qualityScore:
          vr.qualityScore != null ? Number(vr.qualityScore) : undefined,
        reasonCodes: Array.isArray(vr.reasonCodes)
          ? (vr.reasonCodes as unknown[]).map(String)
          : undefined,
        detectedMaxSpeedKmh:
          vr.detectedMaxSpeedKmh != null
            ? Number(vr.detectedMaxSpeedKmh)
            : undefined,
        maxAllowedSpeedKmh:
          vr.maxAllowedSpeedKmh != null
            ? Number(vr.maxAllowedSpeedKmh)
            : undefined,
        notes: vr.notes ? String(vr.notes) : undefined,
      });
    });

    // Points and verified minutes come from the committed ledger.
    const rewardBySession = new Map<
      string,
      { points: number; verifiedMinutes: number }
    >();
    if (rows.length && riderIds.length) {
      for (let offset = 0; ; offset += 1000) {
        const { data: txRows, error: txError } = await supabaseAdmin
          .from(DB_TABLES.REWARD_TRANSACTIONS)
          .select("rider_id, points_earned, source, metadata")
          .in("rider_id", riderIds)
          .in(
            "metadata->>rideSessionId",
            rows.map((row) => row.id),
          )
          .neq("source", REWARD_SOURCE.REDEMPTION)
          .order("id")
          .range(offset, offset + 999);

        if (txError) return { success: false, error: txError.message };

        (txRows ?? []).forEach((tx) => {
          const meta = tx.metadata as Record<string, unknown> | null;
          const sessionId = meta?.[META_KEYS.RIDE_SESSION_ID] as
            | string
            | undefined;
          if (!sessionId) return;
          const existing = rewardBySession.get(sessionId) ?? {
            points: 0,
            verifiedMinutes: 0,
          };
          existing.points += Number(tx.points_earned ?? 0);
          // verifiedMinutes: take from first matching transaction's metadata
          if (
            !existing.verifiedMinutes &&
            meta?.[META_KEYS.VERIFIED_MINUTES] != null
          ) {
            existing.verifiedMinutes = Number(meta[META_KEYS.VERIFIED_MINUTES]);
          }
          rewardBySession.set(sessionId, existing);
        });
        if ((txRows?.length ?? 0) < 1000) break;
      }
    }

    // Fetch rider names
    const riderNameMap = new Map<string, string>();
    if (riderIds.length) {
      const { data: riderRows } = await supabaseAdmin
        .from("rider")
        .select("id, user_id")
        .in("id", riderIds);

      const userIds = (riderRows ?? [])
        .map((r) => r.user_id)
        .filter(Boolean) as string[];

      const riderToUser = new Map(
        (riderRows ?? []).map((r) => [r.id, r.user_id]),
      );

      if (userIds.length) {
        const { data: userRows } = await supabaseAdmin
          .from("user")
          .select("id, name")
          .in("id", userIds);

        const userNameMap = new Map(
          (userRows ?? []).map((u) => [u.id, u.name ?? "Unknown"]),
        );

        riderIds.forEach((riderId) => {
          const userId = riderToUser.get(riderId);
          if (userId)
            riderNameMap.set(riderId, userNameMap.get(userId) ?? "Unknown");
        });
      }
    }

    // Fetch campaign names
    const campaignNameMap = new Map<string, string>();
    if (campaignIds.length) {
      const { data: campaignRows } = await supabaseAdmin
        .from("campaign")
        .select("id, name")
        .in("id", campaignIds);

      (campaignRows ?? []).forEach((c) => {
        if (c.id) campaignNameMap.set(c.id, c.name ?? `Campaign ${c.id}`);
      });
    }

    const toVerificationStatus = (
      raw?: string,
    ): RideSession["verificationStatus"] => {
      if (
        raw === VERIFICATION_STATUS.VERIFIED ||
        raw === VERIFICATION_STATUS.REJECTED ||
        raw === VERIFICATION_STATUS.MANUAL_REVIEW ||
        raw === VERIFICATION_STATUS.PENDING
      )
        return raw;
      return VERIFICATION_STATUS.PENDING;
    };

    const toSessionStatus = (
      raw?: string | null,
    ): RideSessionStatus | undefined => {
      if (
        raw === "draft" ||
        raw === "active" ||
        raw === "paused" ||
        raw === "completed" ||
        raw === "cancelled" ||
        raw === "rejected"
      )
        return raw;
      return undefined;
    };

    const toEarningMode = (raw?: string): RideSession["earningMode"] => {
      if (raw === "ad_enhanced_ride") return "ad_enhanced_ride";
      return "standard_ride";
    };

    const toBikeType = (raw?: string | null): BikeType | undefined => {
      if (raw === "e_bike") return "e_bike";
      if (raw === "fat_bike") return "fat_bike";
      if (raw === "standard_bike") return "standard_bike";
      if (raw === "unknown") return "unknown";
      return raw ? "unknown" : undefined;
    };

    const mapped: RideSession[] = rows.map((row) => {
      const r = row as Record<string, unknown>;
      const machineVerdict = machineVerdictMap.get(row.id);
      const sessionReward = rewardBySession.get(row.id) ?? {
        points: 0,
        verifiedMinutes: 0,
      };

      // Lifecycle status — prefer DB status column; infer from completed_at / started_at otherwise.
      const inferredStatus =
        toSessionStatus(r.status as string | null) ??
        (r.completed_at ? "completed" : row.started_at ? "active" : "draft");

      const effectiveVerStatus =
        machineVerdict?.status ?? VERIFICATION_STATUS.PENDING;
      const effectiveReasonCodes = machineVerdict?.reasonCodes ?? [];
      const verificationSource: RideSession["verificationSource"] =
        machineVerdict ? "machine" : undefined;

      return {
        id: row.id,
        settlement: r._settlement as RideSession["settlement"],
        riderId: row.rider_id,
        riderName: riderNameMap.get(row.rider_id) ?? "Unknown",
        status: inferredStatus as RideSessionStatus,
        earningMode: toEarningMode(row.earning_mode),
        campaignId: row.campaign_id ?? undefined,
        campaignName: row.campaign_id
          ? campaignNameMap.get(row.campaign_id)
          : undefined,
        routeId: r.route_id as string | undefined,
        routeAssignmentId: r.rider_route_id as string | undefined,
        suggestedRouteId: r.suggested_route_id as string | undefined,
        complianceScore:
          r.compliance_score != null ? Number(r.compliance_score) : undefined,
        bonusApplied:
          r.bonus_applied != null ? Number(r.bonus_applied) : undefined,
        multiplierApplied:
          r.multiplier_applied != null
            ? Number(r.multiplier_applied)
            : undefined,
        startedAt: row.started_at,
        endedAt: r.completed_at as string | undefined,
        // Sourced from reward_transactions.metadata — not ride_session columns
        verifiedMinutes: sessionReward.verifiedMinutes,
        pointsAwarded: sessionReward.points,
        verificationStatus: toVerificationStatus(effectiveVerStatus),
        verificationSource,
        reasonCodes: effectiveReasonCodes,
        // Raw machine verdict preserved for auditing — unaffected by admin overrides
        machineVerification: machineVerdict
          ? {
              status: toVerificationStatus(machineVerdict.status),
              qualityScore: machineVerdict.qualityScore,
              reasonCodes: machineVerdict.reasonCodes,
              detectedMaxSpeedKmh: machineVerdict.detectedMaxSpeedKmh,
              maxAllowedSpeedKmh: machineVerdict.maxAllowedSpeedKmh,
              notes: machineVerdict.notes,
            }
          : undefined,
        bikeType: toBikeType(row.bike_type),
        rideQualityPercent:
          row.ride_quality_percent != null
            ? Number(row.ride_quality_percent)
            : undefined,
        // moving_time_ms converted to minutes (÷ 60 000) — mobile stores milliseconds
        movingTime:
          r.moving_time_ms != null
            ? Math.round((Number(r.moving_time_ms) / 60_000) * 100) / 100
            : undefined,
        totalDistanceMeters:
          r.total_distance_meters != null
            ? Number(r.total_distance_meters)
            : undefined,
        city: row.city ?? undefined,
        country: row.country ?? undefined,
        createdAt: row.created_at,
      };
    });

    return { success: true, data: mapped };
  } catch (error) {
    console.error("Get ride sessions error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch ride sessions",
    };
  }
}
