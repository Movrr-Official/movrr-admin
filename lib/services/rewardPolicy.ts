import "server-only";

import { getResolvedPlatformSettingsValues } from "@/lib/platformSettings";

export type RewardPolicySnapshot = {
  baseDistanceRatePerMeter: number;
  baseTimeRatePerSecond: number;
  zoneDwellRatePerSecond: number;
  hotZoneMultiplier: number;
  standardRideRouteMultiplier: number;
  standardRideMinCompliancePct: number;
  dailyCapPoints: number;
};

const DEFAULT_POLICY: RewardPolicySnapshot = {
  baseDistanceRatePerMeter: 0.01,
  baseTimeRatePerSecond: 0.005,
  zoneDwellRatePerSecond: 0.1,
  hotZoneMultiplier: 2.0,
  standardRideRouteMultiplier: 1.5,
  standardRideMinCompliancePct: 60,
  dailyCapPoints: 500,
};

/**
 * Authoritative reward policy from platform settings.
 * Ignores client-writable session.policy_snapshot to prevent cap inflation.
 */
export async function resolveActiveRewardPolicy(): Promise<RewardPolicySnapshot> {
  try {
    const values = await getResolvedPlatformSettingsValues();
    const basePerMinute = values.rewards.basePointsPerMinute;
    const compliancePct = Math.round(
      values.suggestedRoutes.complianceThreshold * 100,
    );

    return {
      ...DEFAULT_POLICY,
      baseTimeRatePerSecond: basePerMinute / 60,
      zoneDwellRatePerSecond: basePerMinute / 60,
      hotZoneMultiplier: values.rewards.boostedRideMultiplier,
      standardRideRouteMultiplier: values.suggestedRoutes.defaultMultiplier,
      standardRideMinCompliancePct: compliancePct,
      dailyCapPoints: values.rewards.dailyCap,
    };
  } catch {
    return DEFAULT_POLICY;
  }
}
