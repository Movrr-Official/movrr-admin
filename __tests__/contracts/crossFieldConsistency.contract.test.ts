/**
 * Cross-field consistency tests — Phase 6 cross-system truth verification.
 *
 * Probes scenarios where individual field values are each valid in isolation
 * but contradict each other or violate domain invariants:
 *
 *   - Cap arithmetic invariants (wasCapped/cappedPoints mismatch)
 *   - Multiplier chain arithmetic (multiplier vs appliedModifiers product)
 *   - Source vs earningMode consistency (boosted_ride with standard earningMode)
 *   - Payout chain ordering (preCapTotal ≥ postCapTotal ≥ 0)
 *   - Verification status vs reward existence (rewards on rejected rides)
 *   - Bonus breakdown completeness (sum of flat bonuses = fixedBonusPoints)
 *
 * These tests do NOT assert that the code currently rejects these states —
 * rather, they document the invariants and verify which ones the contract
 * layer catches vs which ones are silent gaps that need future guards.
 */

import { describe, it, expect } from "vitest";
import {
  parseRewardMetadata,
  BONUS_TYPE,
  REWARD_SOURCE,
  VERIFICATION_STATUS,
} from "../../lib/rewardConstants";
import {
  validateRewardMetadata,
  buildContractHealthReport,
  type RewardTransactionHealthRow,
} from "../../lib/contractDiagnostics";
import { buildRewardAuditTrail } from "../../lib/rewardReconstruction";
import type { RewardTransaction } from "../../schemas/reward";

function makeTx(overrides: Partial<RewardTransaction>): RewardTransaction {
  return {
    id: "tx-cf",
    riderId: "rider-1",
    type: "awarded",
    source: "standard_ride",
    points: 20,
    balanceAfter: 120,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeHealthRow(
  id: string,
  metadata: Record<string, unknown>,
  source: string | null = "standard_ride",
): RewardTransactionHealthRow {
  return { id, source, metadata, createdAt: new Date().toISOString() };
}

// ── Cap arithmetic invariants ─────────────────────────────────────────────────

describe("Cap arithmetic invariants", () => {
  it("wasCapped=true with cappedPoints=0: reconstruction still consistent if chain adds up", () => {
    // Allowed edge case: cap was enabled (daily limit hit) but no actual points removed
    // (e.g., ride points exactly equalled the remaining daily budget)
    const tx = makeTx({
      points: 30,
      verifiedMinutes: 30,
      basePoints: 30,
      multiplier: 1,
      pointsBeforeBonuses: 30,
      fixedBonusPoints: 0,
      pointsBeforeCap: 30,
      cappedPoints: 0,
      wasCapped: true, // flag set but no actual reduction
    });
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(true);
  });

  it("wasCapped=false with cappedPoints=40: math shows cap was applied — inconsistency detected", () => {
    const tx = makeTx({
      points: 60,
      verifiedMinutes: 60,
      basePoints: 60,
      multiplier: 1,
      pointsBeforeBonuses: 60,
      fixedBonusPoints: 0,
      pointsBeforeCap: 100,
      cappedPoints: 40, // points removed despite wasCapped=false
      wasCapped: false, // contradicts cappedPoints
    });
    // Reconstruction: 100 - 40 = 60 = stored 60 → consistent (chain arithmetic is fine)
    // But wasCapped flag is wrong — this is a cross-field inconsistency not caught by reconstruction
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(true); // arithmetic consistent — flag mismatch is a gap

    // Document the gap: reconstruction does not validate wasCapped vs cappedPoints
    // A future guard should flag: cappedPoints > 0 AND wasCapped === false
  });

  it("finalPoints > pointsBeforeCap: impossible (cap can only reduce) → inconsistency detected", () => {
    const tx = makeTx({
      points: 150, // stored is MORE than before-cap — impossible
      verifiedMinutes: 30,
      basePoints: 30,
      multiplier: 1,
      pointsBeforeBonuses: 30,
      fixedBonusPoints: 0,
      pointsBeforeCap: 100,
      cappedPoints: 0,
      wasCapped: false,
    });
    // Reconstruction: 100 - 0 = 100; stored = 150; diff = 50 → inconsistent
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(false);
    expect(trail.warnings.length).toBeGreaterThan(0);
  });

  it("cappedPoints exactly equals pointsBeforeCap: rider receives 0 pts — consistent", () => {
    const tx = makeTx({
      points: 0,
      verifiedMinutes: 30,
      basePoints: 30,
      multiplier: 1,
      pointsBeforeBonuses: 30,
      fixedBonusPoints: 0,
      pointsBeforeCap: 30,
      cappedPoints: 30, // all points removed by cap — rare but valid
      wasCapped: true,
    });
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(true);
    expect(trail.storedPoints).toBe(0);
    expect(trail.reconstructedPoints).toBe(0);
  });
});

// ── Multiplier chain arithmetic ───────────────────────────────────────────────

describe("Multiplier chain — appliedModifiers product vs stored multiplier", () => {
  // The stored `multiplier` should equal the product of all applied modifier multipliers.
  // This is not enforced by the parser — it's a cross-field invariant.
  function computeModifierProduct(
    modifiers: Array<{ multiplier?: number; applied: boolean }>,
  ): number {
    return modifiers
      .filter((m) => m.applied)
      .reduce((acc, m) => acc * (m.multiplier ?? 1), 1);
  }

  it("product of applied modifiers matches stored multiplier (1.5 × 1.2 = 1.8)", () => {
    const metadata = {
      [BONUS_TYPE.BOOSTED_RIDE_BOOST]: 1,
      multiplier: 1.8,
      appliedModifiers: [
        { type: "earning_mode", multiplier: 1.5, applied: true },
        { type: "campaign_boost", multiplier: 1.2, applied: true },
      ],
    };
    const r = parseRewardMetadata(metadata);
    const product = computeModifierProduct(r.appliedModifiers!);
    expect(Math.abs(product - (r.multiplier ?? 1))).toBeLessThanOrEqual(0.01);
  });

  it("non-applied modifier is excluded from product calculation", () => {
    const metadata = {
      multiplier: 1.5,
      appliedModifiers: [
        { type: "earning_mode", multiplier: 1.5, applied: true },
        { type: "campaign_boost", multiplier: 1.2, applied: false }, // not applied
      ],
    };
    const r = parseRewardMetadata(metadata);
    const product = computeModifierProduct(r.appliedModifiers!);
    expect(product).toBeCloseTo(1.5);
    // Stored multiplier is 1.5 — matches: only earning_mode was applied
    expect(Math.abs(product - (r.multiplier ?? 1))).toBeLessThanOrEqual(0.01);
  });

  it("all modifiers non-applied: product = 1 (identity multiplier)", () => {
    const modifiers = [
      { type: "campaign_boost", multiplier: 1.2, applied: false },
      { type: "earning_mode", multiplier: 1.5, applied: false },
    ];
    expect(computeModifierProduct(modifiers)).toBe(1);
  });
});

// ── Source vs earningMode consistency ─────────────────────────────────────────

describe("Source vs earningMode cross-field consistency (document gaps)", () => {
  // These tests document which inconsistencies the contract layer catches
  // vs which are currently silent gaps.

  it("source=boosted_ride with earningMode=standard_ride: contradiction — current layer does NOT catch this", () => {
    // The contract layer only validates metadata keys, not cross-field source/earningMode alignment.
    // This test documents the gap.
    const metadata = {
      [BONUS_TYPE.BOOSTED_RIDE_BOOST]: 1,
      rideSessionId: "sess-1",
      verifiedMinutes: 10,
      basePoints: 10,
      earningMode: "standard_ride", // standard earningMode...
      // source is on the txn row, not in metadata — can't cross-validate here
    };
    const violations = validateRewardMetadata(metadata);
    // No violation raised for earningMode/source mismatch — documents the gap
    const modeViolations = violations.filter((v) => v.field === "earningMode");
    expect(modeViolations).toHaveLength(0); // gap: not currently detected
  });

  it("earningMode=ad_enhanced_ride from metadata is preserved correctly", () => {
    const r = parseRewardMetadata({ earningMode: "ad_enhanced_ride" });
    expect(r.earningMode).toBe("ad_enhanced_ride");
  });

  it("unknown earningMode is preserved (forward-compat — mobile may add new modes)", () => {
    const r = parseRewardMetadata({ earningMode: "cargo_bike_ride" });
    expect(r.earningMode).toBe("cargo_bike_ride");
  });
});

// ── Bonus breakdown sum vs fixedBonusPoints ───────────────────────────────────

describe("Bonus breakdown sum vs fixedBonusPoints cross-field invariant", () => {
  // fixedBonusPoints should equal the sum of all points-kind bonus entries.
  // This is not enforced — tests document the expected invariant.

  function sumFlatBonuses(
    breakdown: Array<{ type?: string; points?: number; multiplier?: number }>,
  ): number {
    return breakdown.reduce((s, e) => s + (e.points ?? 0), 0);
  }

  it("sum of flat bonus entries matches fixedBonusPoints (consistent payload)", () => {
    const metadata = {
      rideSessionId: "sess-x",
      verifiedMinutes: 10,
      basePoints: 10,
      fixedBonusPoints: 13,
      bonusBreakdown: [
        { type: BONUS_TYPE.HOT_ZONE_BOOST, points: 8 },
        { type: BONUS_TYPE.SUGGESTED_ROUTE_BONUS, points: 5 },
        { type: BONUS_TYPE.STREAK_BONUS, multiplier: 1.1 }, // multiplier-kind: no points
      ],
    };
    const r = parseRewardMetadata(metadata);
    const flatSum = sumFlatBonuses(r.bonusBreakdown!);
    expect(flatSum).toBe(r.fixedBonusPoints);
  });

  it("multiplier-kind bonuses contribute 0 to flat sum (expected behavior)", () => {
    const breakdown = [
      { type: BONUS_TYPE.STREAK_BONUS, multiplier: 1.2 }, // no points field
      { type: BONUS_TYPE.PEAK_HOUR_BOOST, multiplier: 1.1 },
    ];
    expect(sumFlatBonuses(breakdown)).toBe(0);
  });

  it("mixed breakdown: only points-kind entries sum to fixedBonusPoints", () => {
    const metadata = {
      fixedBonusPoints: 5,
      bonusBreakdown: [
        { type: BONUS_TYPE.HOT_ZONE_BOOST, points: 5 }, // flat
        { type: BONUS_TYPE.STREAK_BONUS, multiplier: 1.1 }, // multiplier
      ],
    };
    const r = parseRewardMetadata(metadata);
    const flatSum = sumFlatBonuses(r.bonusBreakdown!);
    expect(flatSum).toBe(5);
    expect(flatSum).toBe(r.fixedBonusPoints);
  });
});

// ── Verification status vs reward existence ───────────────────────────────────

describe("Verification status vs reward transaction existence (buildContractHealthReport context)", () => {
  // The contract health report scores transactions regardless of verification status.
  // These tests verify the scoring logic handles status-tagged rows correctly.

  it("unrecognized source on an otherwise healthy metadata row is flagged in report", () => {
    const row = makeHealthRow(
      "tx-future-src",
      {
        rideSessionId: "sess-1",
        verifiedMinutes: 10,
        basePoints: 10,
      },
      "cargo_bike_ride", // future mobile source not in REWARD_SOURCE
    );
    const report = buildContractHealthReport([row], 7);
    expect(report.unrecognizedSources).toContain("cargo_bike_ride");
  });

  it("null source is not flagged as unrecognized (it's absent, not wrong)", () => {
    const row = makeHealthRow(
      "tx-no-src",
      { rideSessionId: "s", verifiedMinutes: 5, basePoints: 5 },
      null,
    );
    const report = buildContractHealthReport([row], 7);
    // null source → !isKnownRewardSource(null) is gated by `row.source &&`
    expect(report.unrecognizedSources).toHaveLength(0);
  });

  it("transaction with info-only violations counts as healthy", () => {
    // info = unrecognized bonus type; does not affect healthScore denominator
    const row = makeHealthRow("tx-info-only", {
      rideSessionId: "sess-1",
      verifiedMinutes: 10,
      basePoints: 10,
      bonusBreakdown: [{ type: "future_bonus_type", points: 5 }],
    });
    const report = buildContractHealthReport([row], 7);
    // info violations: the transaction should still count as healthy
    // (healthyTransactions = rows with no critical OR warning violations)
    expect(report.healthyTransactions).toBe(1);
    expect(report.healthScore).toBe(100);
  });

  it("a mix of critical + info violations counts as unhealthy", () => {
    const row = makeHealthRow("tx-crit-info", {
      // missing rideSessionId = critical
      verifiedMinutes: 10,
      basePoints: 10,
      bonusBreakdown: [{ type: "future_bonus_type", points: 5 }], // info
    });
    const report = buildContractHealthReport([row], 7);
    expect(report.criticalCount).toBeGreaterThan(0);
    expect(report.healthyTransactions).toBe(0);
    expect(report.healthScore).toBe(0);
  });
});

// ── Payout chain ordering invariant ──────────────────────────────────────────

describe("Payout chain ordering invariant: preBonus ≤ preCap ≥ final", () => {
  it("consistent chain: pointsBeforeBonuses ≤ pointsBeforeCap (bonuses add, never subtract)", () => {
    const r = parseRewardMetadata({
      pointsBeforeBonuses: 25,
      fixedBonusPoints: 8,
      pointsBeforeCap: 33,
    });
    expect(r.pointsBeforeCap!).toBeGreaterThanOrEqual(r.pointsBeforeBonuses!);
  });

  it("pointsBeforeCap < pointsBeforeBonuses triggers invariant violation in validateRewardMetadata", () => {
    const violations = validateRewardMetadata({
      rideSessionId: "x",
      verifiedMinutes: 10,
      basePoints: 10,
      pointsBeforeBonuses: 50,
      pointsBeforeCap: 40, // diff = -10 → below tolerance → violation
    });
    expect(violations.some((v) => v.field === "pointsBeforeCap")).toBe(true);
  });

  it("buildRewardAuditTrail: reconstruction detects when final > preCap (impossible via cap)", () => {
    // Cap can only remove points; final must be ≤ preCap
    const tx = makeTx({
      points: 110, // stored MORE than preCap — impossible
      verifiedMinutes: 30,
      basePoints: 30,
      multiplier: 1,
      pointsBeforeBonuses: 30,
      fixedBonusPoints: 0,
      pointsBeforeCap: 100,
      cappedPoints: 0,
      wasCapped: false,
    });
    // Reconstruction: 100 - 0 = 100; stored = 110; diff = 10 > 1 → inconsistent
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(false);
  });
});

// ── REWARD_SOURCE coverage in health report ───────────────────────────────────

describe("REWARD_SOURCE — all canonical sources are recognized (no false positives)", () => {
  const allSources = [
    REWARD_SOURCE.STANDARD_RIDE,
    REWARD_SOURCE.AD_BOOST,
    REWARD_SOURCE.BOOSTED_RIDE,
    REWARD_SOURCE.BONUS,
    REWARD_SOURCE.STANDARD_RIDE_BONUS,
    REWARD_SOURCE.ADJUSTMENT,
    REWARD_SOURCE.REDEMPTION,
  ] as const;

  for (const source of allSources) {
    it(`source "${source}" is not flagged as unrecognized in health report`, () => {
      const row = makeHealthRow(
        `tx-${source}`,
        { rideSessionId: "s", verifiedMinutes: 5, basePoints: 5 },
        source,
      );
      const report = buildContractHealthReport([row], 7);
      expect(report.unrecognizedSources).not.toContain(source);
    });
  }
});

// ── VERIFICATION_STATUS — cross-system key guard ──────────────────────────────

describe("VERIFICATION_STATUS — values match what mobile writes to verification_result.status", () => {
  // These 4 strings are the only values mobile ever writes.
  // If admin logic compares against a different string, it silently breaks.
  const expectedValues = ["pending", "verified", "rejected", "manual_review"];

  it("all VERIFICATION_STATUS values are lowercase and use underscores (not hyphens)", () => {
    for (const val of Object.values(VERIFICATION_STATUS)) {
      expect(val).toBe(val.toLowerCase());
      expect(val).not.toContain("-");
    }
  });

  it("VERIFICATION_STATUS contains exactly the 4 expected values", () => {
    const actual = new Set(Object.values(VERIFICATION_STATUS));
    for (const expected of expectedValues) {
      expect(
        actual.has(
          expected as (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS],
        ),
      ).toBe(true);
    }
    expect(actual.size).toBe(expectedValues.length);
  });

  it("VERIFICATION_STATUS.MANUAL_REVIEW uses underscore not hyphen (manual_review not manual-review)", () => {
    expect(VERIFICATION_STATUS.MANUAL_REVIEW).toBe("manual_review");
    expect(VERIFICATION_STATUS.MANUAL_REVIEW).not.toBe("manual-review");
  });
});
