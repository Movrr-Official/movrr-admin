"use server";

import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BikeType, RideSession, RideSessionFilters } from "@/schemas";

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

    // Fetch ride sessions — includes quality fields for verification support
    const { data: sessionRows, error: sessionError } = await supabaseAdmin
      .from("ride_session")
      .select(
        "id, rider_id, campaign_id, earning_mode, started_at, ended_at, verified_minutes, points_awarded, bike_type, ride_quality_percent, moving_time, city, country, created_at",
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
      return {
        id: row.id,
        riderId: row.rider_id,
        riderName: riderNameMap.get(row.rider_id) ?? "Unknown",
        earningMode: toEarningMode(row.earning_mode),
        campaignId: row.campaign_id ?? undefined,
        campaignName: row.campaign_id
          ? campaignNameMap.get(row.campaign_id)
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
