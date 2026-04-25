"use server";

import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  BikeType,
  RideSession,
  RideSessionFilters,
  RideSessionStatus,
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from(DB_TABLES.RIDE_SESSION)
      .select("total_distance_meters")
      .not("total_distance_meters", "is", null);

    if (error) return { success: false, error: error.message };

    const rows = data ?? [];
    const totalMeters = rows.reduce(
      (sum, r) =>
        sum + Number((r as Record<string, unknown>).total_distance_meters ?? 0),
      0,
    );
    const totalDistanceKm = Math.round((totalMeters / 1000) * 10) / 10;
    const co2SavedKg = Math.round(totalDistanceKm * 0.18 * 10) / 10;

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

export type VerificationAction = "approve" | "reject" | "escalate";

const VERIFICATION_STATUS_MAP: Record<VerificationAction, string> = {
  approve: VERIFICATION_STATUS.VERIFIED,
  reject: VERIFICATION_STATUS.REJECTED,
  escalate: VERIFICATION_STATUS.MANUAL_REVIEW,
};

const VALID_ACTIONS = new Set<string>(["approve", "reject", "escalate"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Update ride_verification status with audit trail.
 * Creates a new verification row if one doesn't exist yet.
 */
export async function verifyRideSession(input: {
  sessionId: string;
  action: VerificationAction;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Runtime validation — TypeScript types don't survive client→server boundaries.
    if (!UUID_RE.test(input.sessionId)) {
      return { success: false, error: "Invalid session ID" };
    }
    if (!VALID_ACTIONS.has(input.action)) {
      return { success: false, error: "Invalid verification action" };
    }
    const reason = input.reason?.trim().slice(0, 2000);

    const admin = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();
    const newStatus = VERIFICATION_STATUS_MAP[input.action];

    // Upsert: insert if absent, update if present
    const { error: upsertError } = await supabase
      .from(DB_TABLES.RIDE_VERIFICATION)
      .upsert(
        {
          ride_session_id: input.sessionId,
          status: newStatus,
          reviewed_by: admin.authUser.id,
          reviewed_at: new Date().toISOString(),
          ...(reason ? { review_notes: reason } : {}),
        },
        { onConflict: "ride_session_id" },
      );

    if (upsertError) return { success: false, error: upsertError.message };

    // Append audit log entry
    await supabase.from("admin_audit_log").insert({
      admin_id: admin.authUser.id,
      action: `ride_session.verification.${input.action}`,
      entity_type: "ride_session",
      entity_id: input.sessionId,
      metadata: reason ? { reason } : {},
      created_at: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Verification action failed",
    };
  }
}

/**
 * Fetch ride sessions joined with ride_verification status and rider info.
 * Falls back gracefully if ride_verification table does not exist yet.
 */
export async function getRideSessions(
  filters?: RideSessionFilters,
): Promise<{ success: boolean; data?: RideSession[]; error?: string }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch ride sessions.
    // Column contract (mobile source of truth):
    //   completed_at   ← mobile's ride_session.completed_at  (not ended_at)
    //   moving_time_ms ← mobile's moving_time in ms          (not moving_time)
    //   rider_route_id ← mobile's FK to rider_route          (not route_assignment_id)
    //   verification_result ← JSONB machine verdict written at ride end
    // points_awarded / verified_minutes are sourced from reward_transactions, NOT ride_session columns.
    const { data: sessionRows, error: sessionError } = await supabaseAdmin
      .from(DB_TABLES.RIDE_SESSION)
      .select(
        "id, rider_id, campaign_id, route_id, rider_route_id, suggested_route_id, earning_mode, status, started_at, completed_at, bike_type, ride_quality_percent, moving_time_ms, total_distance_meters, compliance_score, bonus_applied, multiplier_applied, city, country, created_at, verification_result",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (sessionError) {
      return { success: false, error: sessionError.message };
    }

    const rows = sessionRows ?? [];
    const sessionIds = rows.map((r) => r.id);
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

    // ── Admin verification overrides ──────────────────────────────────────────
    // Secondary source: ride_verification table — populated only by admin manual
    // actions (approve / reject / escalate). Layered ON TOP of machine verdict.
    // Precedence rule: admin override > machine verdict > "pending".
    const adminOverrideMap = new Map<
      string,
      { status: string; reason_codes?: string[] }
    >();
    if (sessionIds.length) {
      const { data: verRows } = await supabaseAdmin
        .from(DB_TABLES.RIDE_VERIFICATION)
        .select("ride_session_id, status, reason_codes")
        .in("ride_session_id", sessionIds);

      (verRows ?? []).forEach((v) => {
        if (v.ride_session_id) {
          adminOverrideMap.set(v.ride_session_id, {
            status: v.status ?? VERIFICATION_STATUS.PENDING,
            reason_codes: Array.isArray(v.reason_codes) ? v.reason_codes : [],
          });
        }
      });
    }

    // ── Canonical reward sourcing from reward_transactions ────────────────────
    // Mobile awards points via award_movrr_points_for_ride_session RPC into
    // reward_transactions — it does NOT write back to ride_session.points_awarded
    // or ride_session.verified_minutes. Both fields must be sourced here.
    const rewardBySession = new Map<
      string,
      { points: number; verifiedMinutes: number }
    >();
    if (rows.length && riderIds.length) {
      const earliestStart = rows.reduce(
        (min, r) => (r.started_at && r.started_at < min ? r.started_at : min),
        rows[0]?.started_at ?? new Date(0).toISOString(),
      );
      const { data: txRows } = await supabaseAdmin
        .from(DB_TABLES.REWARD_TRANSACTIONS)
        .select("rider_id, points_earned, source, metadata")
        .in("rider_id", riderIds)
        .gte("created_at", earliestStart)
        .in("source", [
          REWARD_SOURCE.STANDARD_RIDE,
          REWARD_SOURCE.BOOSTED_RIDE,
          REWARD_SOURCE.AD_BOOST,
        ]);

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

    let mapped: RideSession[] = rows.map((row) => {
      const r = row as Record<string, unknown>;
      const adminOverride = adminOverrideMap.get(row.id);
      const machineVerdict = machineVerdictMap.get(row.id);
      const sessionReward = rewardBySession.get(row.id) ?? {
        points: 0,
        verifiedMinutes: 0,
      };

      // Lifecycle status — prefer DB status column; infer from completed_at / started_at otherwise.
      const inferredStatus =
        toSessionStatus(r.status as string | null) ??
        (r.completed_at ? "completed" : row.started_at ? "active" : "draft");

      // Verification precedence: admin manual override > machine verdict > "pending".
      const effectiveVerStatus =
        adminOverride?.status ??
        machineVerdict?.status ??
        VERIFICATION_STATUS.PENDING;
      const effectiveReasonCodes =
        adminOverride?.reason_codes ?? machineVerdict?.reasonCodes ?? [];
      const verificationSource: RideSession["verificationSource"] =
        adminOverride ? "admin" : machineVerdict ? "machine" : undefined;

      return {
        id: row.id,
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

    // Apply filters
    if (filters?.earningMode && filters.earningMode !== "all") {
      mapped = mapped.filter((s) => s.earningMode === filters.earningMode);
    }

    if (filters?.verificationStatus && filters.verificationStatus !== "all") {
      mapped = mapped.filter(
        (s) => s.verificationStatus === filters.verificationStatus,
      );
    }

    if (filters?.riderId) {
      mapped = mapped.filter((s) => s.riderId === filters.riderId);
    }

    if (filters?.searchQuery) {
      const q = filters.searchQuery.trim().toLowerCase();
      mapped = mapped.filter(
        (s) =>
          s.riderName?.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.campaignName?.toLowerCase().includes(q) ||
          s.city?.toLowerCase().includes(q),
      );
    }

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
