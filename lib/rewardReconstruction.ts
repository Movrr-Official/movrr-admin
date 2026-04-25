import type { RewardTransaction } from "../schemas/reward";

export type AuditStepStatus = "ok" | "inconsistent" | "missing";

export interface AuditStep {
  label: string;
  value: number | undefined;
  formula: string;
  status: AuditStepStatus;
  note?: string;
}

export interface RewardAuditTrail {
  /** Stored final points on the transaction */
  storedPoints: number;
  /** Reconstructed final points from payout chain */
  reconstructedPoints: number;
  /** Whether stored and reconstructed values match (within 1 point, rounding) */
  consistent: boolean;
  steps: AuditStep[];
  warnings: string[];
}

/**
 * Reconstructs the full payout chain for a reward transaction.
 *
 * Chain: verifiedMinutes × BASE_PPM → basePoints → ×totalMultiplier
 *        → pointsBeforeBonuses → +fixedBonuses → pointsBeforeCap
 *        → −cappedPoints → finalPoints
 *
 * Each step reports whether the stored intermediate value matches
 * the reconstructed value, surfacing drift between mobile writes
 * and what admin observes.
 */
export function buildRewardAuditTrail(tx: RewardTransaction): RewardAuditTrail {
  const steps: AuditStep[] = [];
  const warnings: string[] = [];

  // ── Step 1: verifiedMinutes → basePoints ─────────────────────────────────
  const BASE_POINTS_PER_MINUTE = 1;
  const verifiedMinutes = tx.verifiedMinutes;
  const computedBase =
    verifiedMinutes != null
      ? Math.round(verifiedMinutes * BASE_POINTS_PER_MINUTE)
      : undefined;

  steps.push({
    label: "Base Points",
    value: tx.basePoints,
    formula:
      verifiedMinutes != null
        ? `${verifiedMinutes} min × ${BASE_POINTS_PER_MINUTE} pt/min = ${computedBase}`
        : "verifiedMinutes missing",
    status:
      computedBase == null
        ? "missing"
        : tx.basePoints == null
          ? "missing"
          : computedBase === tx.basePoints
            ? "ok"
            : "inconsistent",
  });

  if (tx.basePoints == null) {
    warnings.push("basePoints not recorded — reconstruction is partial");
  }
  if (verifiedMinutes == null) {
    warnings.push("verifiedMinutes not recorded — cannot verify base points");
  }

  // ── Step 2: basePoints × totalMultiplier → pointsBeforeBonuses ───────────
  const multiplier = tx.multiplier ?? 1;
  const computedBeforeBonuses =
    tx.basePoints != null ? Math.round(tx.basePoints * multiplier) : undefined;

  steps.push({
    label: "Points Before Bonuses",
    value: tx.pointsBeforeBonuses,
    formula:
      tx.basePoints != null
        ? `${tx.basePoints} × ${multiplier} = ${computedBeforeBonuses}`
        : "basePoints missing",
    status:
      computedBeforeBonuses == null
        ? "missing"
        : tx.pointsBeforeBonuses == null
          ? "missing"
          : Math.abs(computedBeforeBonuses - tx.pointsBeforeBonuses) <= 1
            ? "ok"
            : "inconsistent",
    note:
      tx.campaignBoostMultiplier != null
        ? `Includes campaign boost ×${tx.campaignBoostMultiplier}`
        : undefined,
  });

  // ── Step 3: pointsBeforeBonuses + fixedBonuses → pointsBeforeCap ─────────
  const fixedBonusPoints = tx.fixedBonusPoints ?? 0;
  const computedBeforeCap =
    tx.pointsBeforeBonuses != null
      ? tx.pointsBeforeBonuses + fixedBonusPoints
      : undefined;

  steps.push({
    label: "Points Before Cap",
    value: tx.pointsBeforeCap,
    formula:
      tx.pointsBeforeBonuses != null
        ? `${tx.pointsBeforeBonuses} + ${fixedBonusPoints} (flat bonuses) = ${computedBeforeCap}`
        : "pointsBeforeBonuses missing",
    status:
      computedBeforeCap == null
        ? "missing"
        : tx.pointsBeforeCap == null
          ? "missing"
          : Math.abs(computedBeforeCap - tx.pointsBeforeCap) <= 1
            ? "ok"
            : "inconsistent",
  });

  // ── Step 4: pointsBeforeCap − cappedPoints → finalPoints ─────────────────
  const cappedPoints = tx.cappedPoints ?? 0;
  const computedFinal =
    tx.pointsBeforeCap != null ? tx.pointsBeforeCap - cappedPoints : undefined;

  const storedPoints = Math.abs(tx.points); // transactions store signed points; compare magnitude
  const reconstructedPoints = computedFinal ?? storedPoints;

  steps.push({
    label: "Final Points",
    value: storedPoints,
    formula:
      tx.pointsBeforeCap != null
        ? cappedPoints > 0
          ? `${tx.pointsBeforeCap} − ${cappedPoints} (capped) = ${computedFinal}`
          : `${tx.pointsBeforeCap} (no cap applied)`
        : "pointsBeforeCap missing",
    status:
      computedFinal == null
        ? "missing"
        : Math.abs(computedFinal - storedPoints) <= 1
          ? "ok"
          : "inconsistent",
    note: tx.wasCapped
      ? `Daily/ride cap hit — removed ${cappedPoints} pts`
      : undefined,
  });

  const consistent =
    computedFinal != null && Math.abs(computedFinal - storedPoints) <= 1;

  if (!consistent && computedFinal != null) {
    warnings.push(
      `Stored ${storedPoints} pts ≠ reconstructed ${computedFinal} pts — possible metadata drift`,
    );
  }

  return {
    storedPoints,
    reconstructedPoints,
    consistent,
    steps,
    warnings,
  };
}

/** True when every step in the trail has status "ok" */
export function isAuditTrailClean(trail: RewardAuditTrail): boolean {
  return trail.consistent && trail.steps.every((s) => s.status === "ok");
}
