/**
 * Contract tests for lib/rewardReconstruction.ts.
 *
 * Verifies the step-by-step payout chain reconstruction:
 *   verifiedMinutes → basePoints → ×multiplier → pointsBeforeBonuses
 *   → +fixedBonuses → pointsBeforeCap → −cappedPoints → finalPoints
 *
 * Each test uses a representative RewardTransaction payload and
 * asserts the correct step values, statuses, and consistency flag.
 */

import { describe, it, expect } from "vitest";
import {
  buildRewardAuditTrail,
  isAuditTrailClean,
  type RewardAuditTrail,
} from "../../lib/rewardReconstruction";
import type { RewardTransaction } from "../../schemas/reward";

function makeTx(overrides: Partial<RewardTransaction>): RewardTransaction {
  return {
    id: "tx-test",
    riderId: "rider-1",
    type: "awarded",
    source: "standard_ride",
    points: 25,
    balanceAfter: 100,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Full chain — consistent ───────────────────────────────────────────────────

describe("buildRewardAuditTrail — fully consistent chain", () => {
  const tx = makeTx({
    points: 33,
    verifiedMinutes: 14,
    basePoints: 14, // 14 × 1 = 14
    multiplier: 1.8,
    pointsBeforeBonuses: 25, // 14 × 1.8 ≈ 25
    fixedBonusPoints: 8,
    pointsBeforeCap: 33, // 25 + 8
    cappedPoints: 0,
    wasCapped: false,
  });

  let trail: RewardAuditTrail;

  it("returns consistent: true", () => {
    trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(true);
  });

  it("storedPoints equals abs(tx.points)", () => {
    trail = buildRewardAuditTrail(tx);
    expect(trail.storedPoints).toBe(33);
  });

  it("all steps have status ok", () => {
    trail = buildRewardAuditTrail(tx);
    for (const step of trail.steps) {
      expect(step.status, `step "${step.label}" should be ok`).toBe("ok");
    }
  });

  it("isAuditTrailClean returns true", () => {
    trail = buildRewardAuditTrail(tx);
    expect(isAuditTrailClean(trail)).toBe(true);
  });

  it("produces exactly 4 steps", () => {
    trail = buildRewardAuditTrail(tx);
    expect(trail.steps).toHaveLength(4);
  });

  it("has no warnings", () => {
    trail = buildRewardAuditTrail(tx);
    expect(trail.warnings).toHaveLength(0);
  });
});

// ── Capped ride ───────────────────────────────────────────────────────────────

describe("buildRewardAuditTrail — capped ride", () => {
  const tx = makeTx({
    points: 80, // cap kicked in
    verifiedMinutes: 90,
    basePoints: 90,
    multiplier: 1.5,
    pointsBeforeBonuses: 135,
    fixedBonusPoints: 15,
    pointsBeforeCap: 150,
    cappedPoints: 70, // 150 − 70 = 80
    wasCapped: true,
  });

  it("consistent: true when cap arithmetic is correct", () => {
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(true);
  });

  it("Final Points step note mentions cap", () => {
    const trail = buildRewardAuditTrail(tx);
    const finalStep = trail.steps.find((s) => s.label === "Final Points")!;
    expect(finalStep.note).toContain("70 pts");
  });
});

// ── Inconsistent metadata ─────────────────────────────────────────────────────

describe("buildRewardAuditTrail — stored points diverge from chain", () => {
  const tx = makeTx({
    points: 50, // stored value
    verifiedMinutes: 14,
    basePoints: 14,
    multiplier: 1.8,
    pointsBeforeBonuses: 25,
    fixedBonusPoints: 8,
    pointsBeforeCap: 33, // reconstructed final = 33, stored = 50 → inconsistent
    cappedPoints: 0,
    wasCapped: false,
  });

  it("consistent: false when stored != reconstructed", () => {
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(false);
  });

  it("Final Points step status is inconsistent", () => {
    const trail = buildRewardAuditTrail(tx);
    const finalStep = trail.steps.find((s) => s.label === "Final Points")!;
    expect(finalStep.status).toBe("inconsistent");
  });

  it("warnings array is non-empty", () => {
    const trail = buildRewardAuditTrail(tx);
    expect(trail.warnings.length).toBeGreaterThan(0);
  });

  it("isAuditTrailClean returns false", () => {
    const trail = buildRewardAuditTrail(tx);
    expect(isAuditTrailClean(trail)).toBe(false);
  });
});

// ── Missing intermediate fields ───────────────────────────────────────────────

describe("buildRewardAuditTrail — partial metadata (missing fields)", () => {
  it("marks Base Points step as missing when verifiedMinutes absent", () => {
    const tx = makeTx({ points: 20, basePoints: 20 }); // no verifiedMinutes
    const trail = buildRewardAuditTrail(tx);
    const step = trail.steps.find((s) => s.label === "Base Points")!;
    expect(step.status).toBe("missing");
    expect(trail.warnings.some((w) => w.includes("verifiedMinutes"))).toBe(
      true,
    );
  });

  it("marks Base Points step as missing when basePoints absent", () => {
    const tx = makeTx({ points: 20, verifiedMinutes: 20 }); // no basePoints
    const trail = buildRewardAuditTrail(tx);
    const step = trail.steps.find((s) => s.label === "Base Points")!;
    expect(step.status).toBe("missing");
    expect(trail.warnings.some((w) => w.includes("basePoints"))).toBe(true);
  });

  it("does not throw for a completely bare transaction", () => {
    const tx = makeTx({ points: 10 });
    expect(() => buildRewardAuditTrail(tx)).not.toThrow();
  });

  it("still returns 4 steps for a bare transaction", () => {
    const tx = makeTx({ points: 10 });
    const trail = buildRewardAuditTrail(tx);
    expect(trail.steps).toHaveLength(4);
  });
});

// ── Rounding tolerance ────────────────────────────────────────────────────────

describe("buildRewardAuditTrail — 1-point rounding tolerance", () => {
  it("marks ok when stored and reconstructed differ by exactly 1 (float rounding)", () => {
    const tx = makeTx({
      points: 26, // reconstructed: 14 × 1.8 = 25.2 → round = 25; 25 + 8 = 33; stored = 26 → inconsistent
      verifiedMinutes: 14,
      basePoints: 14,
      multiplier: 1.0, // 14 × 1.0 = 14
      pointsBeforeBonuses: 14,
      fixedBonusPoints: 11,
      pointsBeforeCap: 25, // 14 + 11
      cappedPoints: 0,
      wasCapped: false,
    });
    // stored = 26, reconstructed = 25 — diff = 1, within tolerance
    const trail = buildRewardAuditTrail(tx);
    const finalStep = trail.steps.find((s) => s.label === "Final Points")!;
    expect(finalStep.status).toBe("ok");
    expect(trail.consistent).toBe(true);
  });

  it("marks inconsistent when diff > 1", () => {
    const tx = makeTx({
      points: 28, // stored = 28, reconstructed = 25 — diff = 3
      verifiedMinutes: 14,
      basePoints: 14,
      multiplier: 1.0,
      pointsBeforeBonuses: 14,
      fixedBonusPoints: 11,
      pointsBeforeCap: 25,
      cappedPoints: 0,
      wasCapped: false,
    });
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(false);
  });
});

// ── Adjustment/debit transactions ─────────────────────────────────────────────

describe("buildRewardAuditTrail — negative/adjustment transactions", () => {
  it("uses abs(points) for storedPoints (adjustments are stored negative)", () => {
    const tx = makeTx({ type: "adjusted", points: -50, source: "adjustment" });
    const trail = buildRewardAuditTrail(tx);
    expect(trail.storedPoints).toBe(50); // absolute value
  });
});
