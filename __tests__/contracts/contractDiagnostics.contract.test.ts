/**
 * Contract tests for the drift detection layer (lib/contractDiagnostics.ts).
 *
 * Verifies that:
 *   - validateRewardMetadata correctly classifies critical vs warning violations
 *   - Type guards correctly identify known/unknown enum values
 *   - buildContractHealthReport produces correct health scores and aggregates
 *   - warnContractViolations is a no-op in test (NODE_ENV = test, not production)
 */

import { describe, it, expect } from "vitest";
import {
  validateRewardMetadata,
  isKnownBonusType,
  isKnownRewardSource,
  buildContractHealthReport,
  warnContractViolations,
  type RewardTransactionHealthRow,
} from "../../lib/contractDiagnostics";
import {
  BONUS_TYPE,
  REWARD_SOURCE,
  META_KEYS,
} from "../../lib/rewardConstants";

// ── isKnownBonusType ──────────────────────────────────────────────────────────

describe("isKnownBonusType", () => {
  it("returns true for all canonical BONUS_TYPE values", () => {
    for (const [name, value] of Object.entries(BONUS_TYPE)) {
      expect(
        isKnownBonusType(value),
        `BONUS_TYPE.${name} should be known`,
      ).toBe(true);
    }
  });

  it("returns false for legacy admin-only keys never written by mobile", () => {
    // These were dead keys in the old BONUS_TYPE_LABELS — kept for display only
    expect(isKnownBonusType("quality_bonus")).toBe(false);
    expect(isKnownBonusType("campaign_boost")).toBe(false);
  });

  it("returns false for unknown/typo values", () => {
    expect(isKnownBonusType("")).toBe(false);
    expect(isKnownBonusType("STREAK_BONUS")).toBe(false);
    expect(isKnownBonusType("streakBonus")).toBe(false);
    expect(isKnownBonusType("unknown_future_type")).toBe(false);
  });
});

// ── isKnownRewardSource ───────────────────────────────────────────────────────

describe("isKnownRewardSource", () => {
  it("returns true for all canonical REWARD_SOURCE values", () => {
    for (const [name, value] of Object.entries(REWARD_SOURCE)) {
      expect(
        isKnownRewardSource(value),
        `REWARD_SOURCE.${name} should be known`,
      ).toBe(true);
    }
  });

  it("returns false for unknown source values", () => {
    expect(isKnownRewardSource("")).toBe(false);
    expect(isKnownRewardSource("ad_enhanced_ride")).toBe(false); // earning mode, not a source
    expect(isKnownRewardSource("unknown_future_source")).toBe(false);
  });
});

// ── validateRewardMetadata ────────────────────────────────────────────────────

describe("validateRewardMetadata — violation classification", () => {
  it("returns no violations for a fully compliant payload", () => {
    const validPayload = {
      [META_KEYS.RIDE_SESSION_ID]: "sess-001",
      [META_KEYS.VERIFIED_MINUTES]: 12,
      [META_KEYS.BASE_POINTS]: 12,
      [META_KEYS.MULTIPLIER]: 1.5,
      [META_KEYS.POINTS_BEFORE_BONUSES]: 18,
      [META_KEYS.FIXED_BONUS_POINTS]: 5,
      [META_KEYS.POINTS_BEFORE_CAP]: 23,
      [META_KEYS.BONUS_BREAKDOWN]: [
        { type: BONUS_TYPE.STREAK_BONUS, multiplier: 1.1 },
        { type: BONUS_TYPE.HOT_ZONE_BOOST, points: 5 },
      ],
    };
    expect(validateRewardMetadata(validPayload)).toHaveLength(0);
  });

  it("reports CRITICAL when rideSessionId is missing", () => {
    const violations = validateRewardMetadata({
      verifiedMinutes: 10,
      basePoints: 10,
    });
    const critical = violations.filter((v) => v.severity === "critical");
    expect(critical).toHaveLength(1);
    expect(critical[0].field).toBe("rideSessionId");
  });

  it("reports WARNING when verifiedMinutes is missing", () => {
    const violations = validateRewardMetadata({
      rideSessionId: "x",
      basePoints: 10,
    });
    expect(
      violations.some(
        (v) => v.field === "verifiedMinutes" && v.severity === "warning",
      ),
    ).toBe(true);
  });

  it("reports WARNING when basePoints is missing", () => {
    const violations = validateRewardMetadata({
      rideSessionId: "x",
      verifiedMinutes: 10,
    });
    expect(
      violations.some(
        (v) => v.field === "basePoints" && v.severity === "warning",
      ),
    ).toBe(true);
  });

  it("reports INFO for an unrecognized bonus type", () => {
    const violations = validateRewardMetadata({
      rideSessionId: "x",
      verifiedMinutes: 10,
      basePoints: 10,
      bonusBreakdown: [{ type: "future_mobile_bonus", points: 5 }],
    });
    const info = violations.filter((v) => v.severity === "info");
    expect(info).toHaveLength(1);
    expect(info[0].field).toBe("bonusBreakdown[].type");
    expect(info[0].value).toBe("future_mobile_bonus");
  });

  it("does not double-report the same unrecognized type within one transaction", () => {
    const violations = validateRewardMetadata({
      rideSessionId: "x",
      verifiedMinutes: 10,
      basePoints: 10,
      bonusBreakdown: [
        { type: "new_type", points: 5 },
        { type: "new_type", points: 3 }, // same type, second entry
      ],
    });
    const info = violations.filter((v) => v.field === "bonusBreakdown[].type");
    expect(info).toHaveLength(1);
  });

  it("reports pointsBeforeCap invariant violation when cap < bonuses", () => {
    const violations = validateRewardMetadata({
      rideSessionId: "x",
      verifiedMinutes: 10,
      basePoints: 10,
      pointsBeforeBonuses: 50,
      pointsBeforeCap: 10, // should be >= 50
    });
    expect(violations.some((v) => v.field === "pointsBeforeCap")).toBe(true);
  });

  it("does not report invariant violation when pointsBeforeCap >= pointsBeforeBonuses", () => {
    const violations = validateRewardMetadata({
      rideSessionId: "x",
      verifiedMinutes: 10,
      basePoints: 10,
      pointsBeforeBonuses: 18,
      pointsBeforeCap: 23, // correct: 18 + 5 fixed bonus
    });
    expect(violations.some((v) => v.field === "pointsBeforeCap")).toBe(false);
  });

  it("never throws on malformed or null input", () => {
    const inputs = [
      null,
      undefined,
      42,
      "string",
      [],
      { bonusBreakdown: "bad" },
    ];
    for (const input of inputs) {
      expect(() => validateRewardMetadata(input)).not.toThrow();
    }
  });
});

// ── buildContractHealthReport ─────────────────────────────────────────────────

describe("buildContractHealthReport — aggregation and scoring", () => {
  function makeRow(
    id: string,
    metadata: Record<string, unknown>,
    source = "standard_ride",
  ): RewardTransactionHealthRow {
    return { id, source, metadata, createdAt: new Date().toISOString() };
  }

  const goodRow = makeRow("tx-1", {
    rideSessionId: "sess-1",
    verifiedMinutes: 10,
    basePoints: 10,
    bonusBreakdown: [{ type: BONUS_TYPE.STREAK_BONUS, multiplier: 1.1 }],
  });

  const badRow = makeRow("tx-2", {
    // missing rideSessionId
    verifiedMinutes: 10,
    basePoints: 10,
  });

  it("returns healthScore 100 for all-healthy transactions", () => {
    const report = buildContractHealthReport([goodRow], 7);
    expect(report.healthScore).toBe(100);
    expect(report.criticalCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it("returns healthScore 0 for all-critical transactions", () => {
    const report = buildContractHealthReport([badRow], 7);
    expect(report.healthScore).toBe(0);
    expect(report.criticalCount).toBeGreaterThan(0);
  });

  it("computes correct mixed health score (1 good, 1 bad = 50%)", () => {
    const report = buildContractHealthReport([goodRow, badRow], 7);
    expect(report.healthScore).toBe(50);
    expect(report.totalTransactions).toBe(2);
    expect(report.healthyTransactions).toBe(1);
  });

  it("returns healthScore 100 for empty transaction list", () => {
    const report = buildContractHealthReport([], 7);
    expect(report.healthScore).toBe(100);
    expect(report.totalTransactions).toBe(0);
  });

  it("detects unrecognized bonus types", () => {
    const row = makeRow("tx-3", {
      rideSessionId: "sess-3",
      verifiedMinutes: 10,
      basePoints: 10,
      bonusBreakdown: [{ type: "mobile_shipped_new_type", points: 5 }],
    });
    const report = buildContractHealthReport([row], 7);
    expect(report.unrecognizedBonusTypes).toContain("mobile_shipped_new_type");
  });

  it("detects unrecognized transaction sources", () => {
    const row = makeRow(
      "tx-4",
      { rideSessionId: "s", verifiedMinutes: 5, basePoints: 5 },
      "new_future_source",
    );
    const report = buildContractHealthReport([row], 7);
    expect(report.unrecognizedSources).toContain("new_future_source");
  });

  it("tracks missingRideSessionId count", () => {
    const report = buildContractHealthReport([goodRow, badRow, badRow], 7);
    expect(report.missingRideSessionId).toBe(2);
  });

  it("populates sampleViolations (up to 5 transactions)", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow(`tx-bad-${i}`, { verifiedMinutes: 10, basePoints: 10 }),
    );
    const report = buildContractHealthReport(rows, 7);
    expect(report.sampleViolations.length).toBeLessThanOrEqual(5);
    expect(report.sampleViolations[0].violations.length).toBeGreaterThan(0);
  });

  it("includes checkedAt and windowDays in report", () => {
    const report = buildContractHealthReport([], 14);
    expect(report.windowDays).toBe(14);
    expect(new Date(report.checkedAt).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  });
});

// ── warnContractViolations ────────────────────────────────────────────────────

describe("warnContractViolations", () => {
  it("does not throw in any environment", () => {
    const violations = validateRewardMetadata(null);
    expect(() =>
      warnContractViolations(violations, "test context"),
    ).not.toThrow();
  });

  it("is a no-op when violations array is empty", () => {
    expect(() => warnContractViolations([], "test context")).not.toThrow();
  });
});
