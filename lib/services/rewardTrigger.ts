/**
 * Reward Trigger Service
 *
 * Called by the GPS ingest API after each verified batch. Reads from
 * zone_visit and corridor_compliance (backend-verified data ONLY) to
 * calculate incremental reward deltas and write to reward_ledger.
 *
 * The mobile client NEVER calls this — it is triggered exclusively by the
 * ingest API after server-side compliance verification.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { logSessionEvent } from "./sessionLogger";
import { resolveActiveRewardPolicy, type RewardPolicySnapshot } from "./rewardPolicy";

type PolicySnapshot = RewardPolicySnapshot;

// ─── Main trigger ─────────────────────────────────────────────────────────────

/**
 * Compute and write incremental reward for a session based on verified
 * compliance data. Safe to call multiple times — idempotent via checkpoint
 * watermark. Silently returns on any error (reward failure must not block
 * session data collection).
 */
export async function triggerRewardUpdate(params: {
  sessionId: string;
  supabase: SupabaseClient;
}): Promise<void> {
  const { sessionId, supabase } = params;

  try {
    // Load session for policy snapshot and rider_id
    const { data: session } = await supabase
      .from("ride_session")
      .select("id, rider_id, earning_mode, status, started_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session || session.status === "rejected") return;

    const policy = await resolveActiveRewardPolicy();

    // Check daily cap
    const today = new Date().toISOString().split("T")[0];
    const { data: todayTransactions } = await supabase
      .from("reward_transactions")
      .select("points_earned")
      .eq("rider_id", session.rider_id)
      .gte("created_at", `${today}T00:00:00Z`);

    const todayTotal = (todayTransactions ?? []).reduce(
      (sum, t) => sum + (t.points_earned ?? 0),
      0,
    );

    if (todayTotal >= policy.dailyCapPoints) {
      logSessionEvent(
        logger,
        "reward_cap_reached",
        sessionId,
        session.rider_id,
        { today_total: todayTotal, cap: policy.dailyCapPoints },
      );
      return;
    }

    const remaining = policy.dailyCapPoints - todayTotal;

    if (session.earning_mode === "ad_enhanced_ride") {
      await handleBoostedRideReward(
        sessionId,
        session.rider_id,
        policy,
        remaining,
        supabase,
      );
    } else {
      await handleStandardRideReward(
        sessionId,
        session.rider_id,
        policy,
        remaining,
        supabase,
      );
    }
  } catch (err) {
    logger.warn("rewardTrigger: non-critical error", {
      sessionId,
      error: String(err),
    });
  }
}

// ─── Boosted ride reward ─────────────────────────────────────────────────────

async function handleBoostedRideReward(
  sessionId: string,
  riderId: string,
  policy: PolicySnapshot,
  remainingCap: number,
  supabase: SupabaseClient,
): Promise<void> {
  // Sum impression units from completed zone visits NOT yet rewarded
  const { data: visits } = await supabase
    .from("zone_visit")
    .select("id, impression_units, speed_violation")
    .eq("session_id", sessionId)
    .not("exited_at", "is", null)
    .gt("impression_units", 0);

  if (!visits || visits.length === 0) return;

  // Check which visits already have a transaction
  const visitIds = visits.map((v) => v.id);
  const { data: existingTx } = await supabase
    .from("reward_transactions")
    .select("metadata")
    .eq("rider_id", riderId)
    .contains("metadata", { sessionId });

  const rewardedVisitIds = new Set(
    (existingTx ?? [])
      .flatMap((t) => t.metadata?.zoneVisitIds ?? [])
      .filter(Boolean),
  );

  const unrewarded = visits.filter(
    (v) => !rewardedVisitIds.has(v.id) && !v.speed_violation,
  );
  if (unrewarded.length === 0) return;

  const totalImpressions = unrewarded.reduce(
    (sum, v) => sum + (v.impression_units ?? 0),
    0,
  );
  const rawPoints = Math.round(
    totalImpressions * policy.zoneDwellRatePerSecond,
  );
  const pointsToAward = Math.min(rawPoints, remainingCap);

  if (pointsToAward <= 0) return;

  const { error } = await supabase.rpc("award_reward_points_capped", {
    p_rider_id: riderId,
    p_points: pointsToAward,
    p_daily_cap: policy.dailyCapPoints,
    p_source: "boosted_ride",
    p_metadata: {
      sessionId,
      zoneVisitIds: unrewarded.map((v) => v.id),
      totalImpressions,
      policyRatePerUnit: policy.zoneDwellRatePerSecond,
      cappedFrom: rawPoints > pointsToAward ? rawPoints : undefined,
    },
  });

  if (!error) {
    logSessionEvent(logger, "reward_calculated", sessionId, riderId, {
      mode: "boosted_ride",
      impression_units: totalImpressions,
      points_awarded: pointsToAward,
      zone_visit_count: unrewarded.length,
    });
  }
}

// ─── Standard ride reward ─────────────────────────────────────────────────────────

async function handleStandardRideReward(
  sessionId: string,
  riderId: string,
  policy: PolicySnapshot,
  remainingCap: number,
  supabase: SupabaseClient,
): Promise<void> {
  // Check whether this session already has a standard_ride transaction
  const { count } = await supabase
    .from("reward_transactions")
    .select("id", { count: "exact", head: true })
    .eq("rider_id", riderId)
    .eq("source", "standard_ride")
    .contains("metadata", { sessionId });

  // Standard ride base rewards are calculated at session end, not incrementally
  // (unlike boosted rides where zone visits are discrete events).
  // This trigger is a no-op for standard rides mid-session.
  if ((count ?? 0) > 0) return;
  // No-op: standard ride base + corridor bonus handled at session completion
  // by completeRideSessionTracking in rideSessions.ts
}
