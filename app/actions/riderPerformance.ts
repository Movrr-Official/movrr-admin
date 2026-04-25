"use server";

import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { RiderPerformanceMetrics } from "@/schemas";
import { DB_TABLES, VERIFICATION_STATUS } from "@/lib/rewardConstants";

/**
 * Compute rider performance metrics from ride_session and ride_verification data.
 * Mirrors the mobile app's RiderPerformanceModel — used in the admin rider details drawer.
 *
 * Sample window: last 90 days to keep computation bounded.
 */
export async function getRiderPerformanceMetrics(riderId: string): Promise<{
  success: boolean;
  data?: RiderPerformanceMetrics;
  error?: string;
}> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 90);

    // Fetch all-time distance in parallel with windowed sessions
    const [{ data: distanceRows }, { data: sessions, error: sessionsError }] =
      await Promise.all([
        supabase
          .from("ride_session")
          .select("total_distance_meters")
          .eq("rider_id", riderId)
          .not("total_distance_meters", "is", null),
        supabase
          .from("ride_session")
          .select("id, ride_quality_percent, created_at")
          .eq("rider_id", riderId)
          .gte("created_at", windowStart.toISOString())
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    if (sessionsError) return { success: false, error: sessionsError.message };

    const totalDistanceMeters = (distanceRows ?? []).reduce(
      (sum, r) =>
        sum + Number((r as Record<string, unknown>).total_distance_meters ?? 0),
      0,
    );
    const totalDistanceKm = Math.round((totalDistanceMeters / 1000) * 10) / 10;
    const co2SavedKg = Math.round(totalDistanceKm * 0.18 * 10) / 10;

    const rows = sessions ?? [];
    const totalSessions = rows.length;

    if (totalSessions === 0) {
      return {
        success: true,
        data: {
          completionRate: 0,
          verificationSuccessRate: 0,
          avgQualityScore: undefined,
          trendDirection: "insufficient_data",
          totalSessions: 0,
          qualityDataAvailable: false,
          totalDistanceKm: totalDistanceKm || undefined,
          co2SavedKg: co2SavedKg || undefined,
        },
      };
    }

    const sessionIds = rows.map((r) => r.id);

    // Fetch verification results for these sessions
    const { data: verRows } = await supabase
      .from(DB_TABLES.RIDE_VERIFICATION)
      .select("ride_session_id, status")
      .in("ride_session_id", sessionIds);

    const verMap = new Map<string, string>();
    (verRows ?? []).forEach((v) => {
      if (v.ride_session_id)
        verMap.set(v.ride_session_id, v.status ?? VERIFICATION_STATUS.PENDING);
    });

    const verifiedCount = sessionIds.filter(
      (id) => verMap.get(id) === VERIFICATION_STATUS.VERIFIED,
    ).length;
    const completedCount = sessionIds.filter((id) => {
      const status = verMap.get(id);
      return (
        status === VERIFICATION_STATUS.VERIFIED ||
        status === VERIFICATION_STATUS.REJECTED ||
        status === VERIFICATION_STATUS.MANUAL_REVIEW
      );
    }).length;

    const completionRate =
      totalSessions > 0
        ? Math.round((completedCount / totalSessions) * 100)
        : 0;
    const verificationSuccessRate =
      completedCount > 0
        ? Math.round((verifiedCount / completedCount) * 100)
        : 0;

    // Quality score — average from sessions that have ride_quality_percent
    const qualityRows = rows.filter((r) => r.ride_quality_percent != null);
    const qualityDataAvailable = qualityRows.length > 0;
    const avgQualityScore = qualityDataAvailable
      ? Math.round(
          qualityRows.reduce(
            (sum, r) => sum + Number(r.ride_quality_percent),
            0,
          ) / qualityRows.length,
        )
      : undefined;

    // Trend: compare 7-day verified rate vs 30-day verified rate
    let trendDirection: RiderPerformanceMetrics["trendDirection"] =
      "insufficient_data";
    if (totalSessions >= 5) {
      const now = Date.now();
      const sevenDayMs = 7 * 24 * 60 * 60 * 1000;
      const thirtyDayMs = 30 * 24 * 60 * 60 * 1000;

      const recent7 = rows.filter(
        (r) => now - new Date(r.created_at).getTime() <= sevenDayMs,
      );
      const recent30 = rows.filter(
        (r) => now - new Date(r.created_at).getTime() <= thirtyDayMs,
      );

      if (recent7.length >= 2 && recent30.length >= 5) {
        const rate7 =
          recent7.filter(
            (r) => verMap.get(r.id) === VERIFICATION_STATUS.VERIFIED,
          ).length / recent7.length;
        const rate30 =
          recent30.filter(
            (r) => verMap.get(r.id) === VERIFICATION_STATUS.VERIFIED,
          ).length / recent30.length;

        const delta = rate7 - rate30;
        if (delta > 0.05) trendDirection = "improving";
        else if (delta < -0.05) trendDirection = "declining";
        else trendDirection = "stable";
      }
    }

    return {
      success: true,
      data: {
        completionRate,
        verificationSuccessRate,
        avgQualityScore,
        trendDirection,
        totalSessions,
        qualityDataAvailable,
        totalDistanceKm: totalDistanceKm || undefined,
        co2SavedKg: co2SavedKg || undefined,
      },
    };
  } catch (error) {
    console.error("getRiderPerformanceMetrics error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to compute performance metrics",
    };
  }
}
