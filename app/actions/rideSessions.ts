"use server";

import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BikeType, RideSession, RideSessionFilters, RideSessionStatus } from "@/schemas";

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
      .from("ride_session")
      .select("total_distance_meters")
      .not("total_distance_meters", "is", null);

    if (error) return { success: false, error: error.message };

    const rows = data ?? [];
    const totalMeters = rows.reduce(
      (sum, r) => sum + Number((r as Record<string, unknown>).total_distance_meters ?? 0),
      0,
    );
    const totalDistanceKm = Math.round((totalMeters / 1000) * 10) / 10;
    const co2SavedKg = Math.round(totalDistanceKm * 0.180 * 10) / 10;

    return { success: true, data: { totalDistanceKm, co2SavedKg, sessionCount: rows.length } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch distance stats",
    };
  }
}

export type VerificationAction = "approve" | "reject" | "escalate";

const VERIFICATION_STATUS_MAP: Record<VerificationAction, string> = {
  approve: "verified",
  reject: "rejected",
  escalate: "manual_review",
};

const VALID_ACTIONS = new Set<string>(["approve", "reject", "escalate"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      .from("ride_verification")
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
      error: error instanceof Error ? error.message : "Verification action failed",
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

    // Fetch ride sessions — includes lifecycle status, quality, distance, and suggested route fields.
    // The `status` column is added by migration 001; if absent the DB simply omits it.
    const { data: sessionRows, error: sessionError } = await supabaseAdmin
      .from("ride_session")
      .select(
        "id, rider_id, campaign_id, route_id, route_assignment_id, suggested_route_id, earning_mode, status, started_at, ended_at, verified_minutes, points_awarded, bike_type, ride_quality_percent, moving_time, total_distance_meters, compliance_score, bonus_applied, multiplier_applied, city, country, created_at",
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

    // Fetch verification data — table may not exist; silently skip errors
    const verificationMap = new Map<
      string,
      { status: string; reason_codes?: string[] }
    >();
    if (sessionIds.length) {
      const { data: verRows } = await supabaseAdmin
        .from("ride_verification")
        .select("ride_session_id, status, reason_codes")
        .in("ride_session_id", sessionIds);

      (verRows ?? []).forEach((v) => {
        if (v.ride_session_id) {
          verificationMap.set(v.ride_session_id, {
            status: v.status ?? "pending",
            reason_codes: Array.isArray(v.reason_codes) ? v.reason_codes : [],
          });
        }
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
          if (userId) riderNameMap.set(riderId, userNameMap.get(userId) ?? "Unknown");
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
        raw === "verified" ||
        raw === "rejected" ||
        raw === "manual_review" ||
        raw === "pending"
      )
        return raw;
      return "pending";
    };

    const toSessionStatus = (raw?: string | null): RideSessionStatus | undefined => {
      if (
        raw === "draft" ||
        raw === "active" ||
        raw === "paused" ||
        raw === "completed" ||
        raw === "cancelled" ||
        raw === "rejected"
      )
        return raw;
      // If the status column isn't populated yet, infer from ended_at presence
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
      const ver = verificationMap.get(row.id);
      // Infer lifecycle status: if status column absent, derive from row shape
      const inferredStatus = toSessionStatus((row as Record<string, unknown>).status as string | null)
        ?? (row.ended_at ? "completed" : row.started_at ? "active" : "draft");
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
        routeId: (row as Record<string, unknown>).route_id as string | undefined ?? undefined,
        routeAssignmentId: (row as Record<string, unknown>).route_assignment_id as string | undefined ?? undefined,
        suggestedRouteId: (row as Record<string, unknown>).suggested_route_id as string | undefined ?? undefined,
        complianceScore: (row as Record<string, unknown>).compliance_score != null
          ? Number((row as Record<string, unknown>).compliance_score)
          : undefined,
        bonusApplied: (row as Record<string, unknown>).bonus_applied != null
          ? Number((row as Record<string, unknown>).bonus_applied)
          : undefined,
        multiplierApplied: (row as Record<string, unknown>).multiplier_applied != null
          ? Number((row as Record<string, unknown>).multiplier_applied)
          : undefined,
        startedAt: row.started_at,
        endedAt: row.ended_at ?? undefined,
        verifiedMinutes: Number(row.verified_minutes ?? 0),
        pointsAwarded: Number(row.points_awarded ?? 0),
        verificationStatus: toVerificationStatus(ver?.status),
        reasonCodes: ver?.reason_codes ?? [],
        bikeType: toBikeType(row.bike_type),
        rideQualityPercent: row.ride_quality_percent != null ? Number(row.ride_quality_percent) : undefined,
        movingTime: row.moving_time != null ? Number(row.moving_time) : undefined,
        totalDistanceMeters: (row as Record<string, unknown>).total_distance_meters != null
          ? Number((row as Record<string, unknown>).total_distance_meters)
          : undefined,
        city: row.city ?? undefined,
        country: row.country ?? undefined,
        createdAt: row.created_at,
      };
    });

    // Apply filters
    if (
      filters?.earningMode &&
      filters.earningMode !== "all"
    ) {
      mapped = mapped.filter((s) => s.earningMode === filters.earningMode);
    }

    if (
      filters?.verificationStatus &&
      filters.verificationStatus !== "all"
    ) {
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
        error instanceof Error ? error.message : "Failed to fetch ride sessions",
    };
  }
}
