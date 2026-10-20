"use server";

import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  BIKE_TYPE_LABELS,
  BONUS_TYPE,
  BONUS_TYPE_LABELS,
  DB_TABLES,
  REWARD_SOURCE,
  VERIFICATION_STATUS,
} from "@/lib/rewardConstants";

export interface VerificationTrendPoint {
  date: string; // "YYYY-MM-DD"
  verified: number;
  rejected: number;
  manual_review: number;
  pending: number;
}

export interface BikeTypeCount {
  bikeType: string;
  count: number;
}

export interface DistanceTrendPoint {
  date: string; // "YYYY-MM-DD"
  distanceKm: number;
  co2SavedKg: number;
  sessions: number;
}

export interface BonusTypeBreakdown {
  type: string;
  label: string;
  totalPoints: number;
  count: number;
}

export interface SessionAnalytics {
  verificationTrend: VerificationTrendPoint[];
  bikeTypeDistribution: BikeTypeCount[];
  distanceTrend: DistanceTrendPoint[];
  bonusBreakdown: BonusTypeBreakdown[];
}



function isoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function buildDateRange(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(isoDate(d));
  }
  return dates;
}

export async function getSessionAnalytics(days = 30): Promise<{
  success: boolean;
  data?: SessionAnalytics;
  error?: string;
}> {
  try {
    await requireCapability("analytics.read");
    const supabase = createSupabaseAdminClient();

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - days);
    const windowStartIso = windowStart.toISOString();

    // Fetch sessions in the window — includes bike_type, distance, and status
    const sessionRows: Array<{id:string;bike_type:string|null;created_at:string;verification_result:{status?:string}|null}> = [];
    const snapshot = new Date().toISOString();
    for (let offset=0;;offset+=500) {
      const page=await supabase.from(DB_TABLES.RIDE_SESSION)
       .select("id,bike_type,created_at,verification_result").gte("created_at",windowStartIso).lte("created_at",snapshot)
       .order("created_at").order("id").range(offset,offset+499);
      if(page.error)return {success:false,error:page.error.message};
      sessionRows.push(...(page.data??[]));if((page.data?.length??0)<500)break;
    }

    const rows = sessionRows ?? [];
    const verMap = new Map<string, string>(
      rows.map((row) => [
        row.id,
        row.verification_result?.status ?? VERIFICATION_STATUS.PENDING,
      ]),
    );

    // Fetch bonus breakdown from reward_transactions metadata
    const txRows: Array<{metadata:unknown;points_earned:number}> = [];
    for(let offset=0;;offset+=500){
      const page=await supabase.from(DB_TABLES.REWARD_TRANSACTIONS).select("metadata,points_earned")
       .gte("created_at",windowStartIso).lte("created_at",snapshot).not("metadata","is",null)
       .order("created_at").order("id").range(offset,offset+499);
      if(page.error)return {success:false,error:page.error.message};
      txRows.push(...(page.data??[]));if((page.data?.length??0)<500)break;
    }

    // ── Verification trend ────────────────────────────────────────────────────
    const dateRange = buildDateRange(days);
    const trendMap = new Map<string, VerificationTrendPoint>(
      dateRange.map((d) => [
        d,
        { date: d, verified: 0, rejected: 0, manual_review: 0, pending: 0 },
      ]),
    );

    rows.forEach((row) => {
      const day = isoDate(new Date(row.created_at));
      const point = trendMap.get(day);
      if (!point) return;
      const status = verMap.get(row.id) ?? VERIFICATION_STATUS.PENDING;
      if (status === VERIFICATION_STATUS.VERIFIED) point.verified++;
      else if (status === VERIFICATION_STATUS.REJECTED) point.rejected++;
      else if (status === VERIFICATION_STATUS.MANUAL_REVIEW)
        point.manual_review++;
      else point.pending++;
    });

    const verificationTrend = Array.from(trendMap.values());

    // ── Bike-type distribution ────────────────────────────────────────────────
    const bikeMap = new Map<string, number>();
    rows.forEach((row) => {
      const bt = (row.bike_type as string | null) ?? "unknown";
      bikeMap.set(bt, (bikeMap.get(bt) ?? 0) + 1);
    });

    const bikeTypeDistribution: BikeTypeCount[] = Array.from(bikeMap.entries())
      .map(([bikeType, count]) => ({
        bikeType: BIKE_TYPE_LABELS[bikeType] ?? bikeType,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Distance trend ────────────────────────────────────────────────────────
    const { data: impactRows, error: impactError } = await supabase.rpc("get_impact_daily", { p_days: days });
    if (impactError) return { success: false, error: impactError.message };
    const daily = new Map((impactRows ?? []).map((row: DistanceTrendPoint) => [row.date, row]));
    const distanceTrend: DistanceTrendPoint[] = dateRange.map(date => {
      const row = daily.get(date) as DistanceTrendPoint | undefined;
      return { date, distanceKm: Number(row?.distanceKm ?? 0), co2SavedKg: Number(row?.co2SavedKg ?? 0), sessions: Number(row?.sessions ?? 0) };
    });

    // ── Bonus breakdown from transaction metadata ─────────────────────────────
    const bonusAccum = new Map<string, { points: number; count: number }>();

    (txRows ?? []).forEach((tx) => {
      const meta = tx.metadata as Record<string, unknown> | null;
      if (!meta) return;
      const breakdown = meta.bonusBreakdown as
        | Array<{
            type: string;
            points?: number;
            multiplier?: number;
          }>
        | undefined;
      if (!Array.isArray(breakdown)) return;
      breakdown.forEach((entry) => {
        const existing = bonusAccum.get(entry.type) ?? { points: 0, count: 0 };
        existing.points += entry.points ?? 0;
        existing.count++;
        bonusAccum.set(entry.type, existing);
      });
    });

    const bonusBreakdown: BonusTypeBreakdown[] = Array.from(
      bonusAccum.entries(),
    )
      .map(([type, { points, count }]) => ({
        type,
        label: BONUS_TYPE_LABELS[type] ?? type,
        totalPoints: points,
        count,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    return {
      success: true,
      data: {
        verificationTrend,
        bikeTypeDistribution,
        distanceTrend,
        bonusBreakdown,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch analytics",
    };
  }
}

// ── Streak leaderboard ────────────────────────────────────────────────────────

export interface StreakLeader {
  riderId: string;
  riderName: string;
  streakBonusCount: number;
  totalStreakPoints: number;
}

export async function getStreakLeaderboard(limit = 10): Promise<{
  success: boolean;
  data?: StreakLeader[];
  error?: string;
}> {
  try {
    await requireCapability("analytics.read");
    const supabase = createSupabaseAdminClient();

    // reward_transactions where source = 'bonus' and metadata contains streak entries,
    // or where the transaction source is standard_ride_bonus with streak type in metadata.
    // Fallback: group by rider_id, count rows with any streak bonus entry.
    const { data: txRows, error } = await supabase
      .from(DB_TABLES.REWARD_TRANSACTIONS)
      .select("rider_id, points_earned, metadata")
      .in("source", [
        REWARD_SOURCE.BONUS,
        REWARD_SOURCE.STANDARD_RIDE_BONUS,
        REWARD_SOURCE.AD_BOOST,
      ])
      .not("metadata", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) return { success: false, error: error.message };

    const accum = new Map<string, { count: number; points: number }>();
    (txRows ?? []).forEach((tx) => {
      const meta = tx.metadata as Record<string, unknown> | null;
      if (!meta) return;
      const breakdown = meta.bonusBreakdown as
        | Array<{ type: string; points?: number }>
        | undefined;
      if (!Array.isArray(breakdown)) return;
      const streakEntries = breakdown.filter(
        (e) => e.type === BONUS_TYPE.STREAK_BONUS,
      );
      if (!streakEntries.length) return;
      const riderId = tx.rider_id as string;
      if (!riderId) return;
      const streakPts = streakEntries.reduce((s, e) => s + (e.points ?? 0), 0);
      const existing = accum.get(riderId) ?? { count: 0, points: 0 };
      existing.count += streakEntries.length;
      existing.points += streakPts;
      accum.set(riderId, existing);
    });

    if (accum.size === 0) return { success: true, data: [] };

    const riderIds = Array.from(accum.keys()).slice(0, 50);

    // Fetch rider names
    const { data: riderRows } = await supabase
      .from("rider")
      .select("id, user_id")
      .in("id", riderIds);

    const userIds = (riderRows ?? [])
      .map((r) => r.user_id)
      .filter(Boolean) as string[];
    const riderToUser = new Map(
      (riderRows ?? []).map((r) => [r.id, r.user_id]),
    );

    const nameMap = new Map<string, string>();
    if (userIds.length) {
      const { data: userRows } = await supabase
        .from("user")
        .select("id, name")
        .in("id", userIds);
      (userRows ?? []).forEach((u) => {
        nameMap.set(u.id, u.name ?? "Unknown");
      });
    }

    const leaders: StreakLeader[] = Array.from(accum.entries())
      .map(([riderId, { count, points }]) => {
        const userId = riderToUser.get(riderId);
        return {
          riderId,
          riderName: userId ? (nameMap.get(userId) ?? "Unknown") : "Unknown",
          streakBonusCount: count,
          totalStreakPoints: points,
        };
      })
      .sort((a, b) => b.totalStreakPoints - a.totalStreakPoints)
      .slice(0, limit);

    return { success: true, data: leaders };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch streak leaderboard",
    };
  }
}
