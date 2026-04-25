/**
 * Contract tests for reward_transactions.metadata parsing.
 *
 * These tests verify that parseRewardMetadata correctly extracts every field
 * the mobile app writes. A failure here means admin dashboards will silently
 * display wrong or missing reward data.
 *
 * Mobile write contract reference:
 *   features/rewards/services/rewards.ts → createRewardTransaction()
 */

import { describe, it, expect } from "vitest";
import {
  parseRewardMetadata,
  META_KEYS,
  BONUS_TYPE,
  REWARD_SOURCE,
} from "../../lib/rewardConstants";

// ── Full metadata round-trip ─────────────────────────────────────────────────

describe("parseRewardMetadata — full mobile payload", () => {
  const fullPayload = {
    [META_KEYS.RIDE_SESSION_ID]: "session-abc-123",
    [META_KEYS.EARNING_MODE]: "ad_enhanced_ride",
    [META_KEYS.BIKE_TYPE]: "e_bike",
    [META_KEYS.BASE_POINTS]: 12,
    [META_KEYS.MULTIPLIER]: 1.5,
    [META_KEYS.CAMPAIGN_BOOST_MULTIPLIER]: 1.2,
    [META_KEYS.POINTS_BEFORE_BONUSES]: 18,
    [META_KEYS.FIXED_BONUS_POINTS]: 5,
    [META_KEYS.POINTS_BEFORE_CAP]: 23,
    [META_KEYS.CAPPED_POINTS]: 0,
    [META_KEYS.WAS_CAPPED]: false,
    [META_KEYS.VERIFIED_MINUTES]: 12,
    [META_KEYS.BONUS_BREAKDOWN]: [
      {
        type: BONUS_TYPE.STREAK_BONUS,
        label: "Streak Bonus",
        multiplier: 1.1,
        points: undefined,
      },
      { type: BONUS_TYPE.HOT_ZONE_BOOST, label: "Hot Zone Boost", points: 5 },
    ],
    [META_KEYS.APPLIED_MODIFIERS]: [
      {
        type: "earning_mode",
        label: "Ad Enhanced",
        multiplier: 1.5,
        applied: true,
      },
      {
        type: "campaign_boost",
        label: "Campaign",
        multiplier: 1.2,
        applied: true,
      },
    ],
    [META_KEYS.ADJUSTMENT_DIRECTION]: "credit",
    [META_KEYS.CREATED_BY]: "mobile_app",
    [META_KEYS.DESCRIPTION]: "Ride reward",
    [META_KEYS.REWARD_CONFIG_HASH]: "a1b2c3d4",
  };

  it("extracts rideSessionId", () => {
    expect(parseRewardMetadata(fullPayload).rideSessionId).toBe(
      "session-abc-123",
    );
  });

  it("extracts earningMode", () => {
    expect(parseRewardMetadata(fullPayload).earningMode).toBe(
      "ad_enhanced_ride",
    );
  });

  it("extracts bikeType", () => {
    expect(parseRewardMetadata(fullPayload).bikeType).toBe("e_bike");
  });

  it("extracts calculation chain fields", () => {
    const r = parseRewardMetadata(fullPayload);
    expect(r.basePoints).toBe(12);
    expect(r.multiplier).toBe(1.5);
    expect(r.campaignBoostMultiplier).toBe(1.2);
    expect(r.pointsBeforeBonuses).toBe(18);
    expect(r.fixedBonusPoints).toBe(5);
    expect(r.pointsBeforeCap).toBe(23);
    expect(r.cappedPoints).toBe(0);
    expect(r.wasCapped).toBe(false);
    expect(r.verifiedMinutes).toBe(12);
  });

  it("extracts bonusBreakdown array", () => {
    const r = parseRewardMetadata(fullPayload);
    expect(r.bonusBreakdown).toHaveLength(2);
    expect(r.bonusBreakdown![0].type).toBe(BONUS_TYPE.STREAK_BONUS);
    expect(r.bonusBreakdown![0].multiplier).toBe(1.1);
    expect(r.bonusBreakdown![0].points).toBeUndefined();
    expect(r.bonusBreakdown![1].type).toBe(BONUS_TYPE.HOT_ZONE_BOOST);
    expect(r.bonusBreakdown![1].points).toBe(5);
  });

  it("extracts appliedModifiers array", () => {
    const r = parseRewardMetadata(fullPayload);
    expect(r.appliedModifiers).toHaveLength(2);
    expect(r.appliedModifiers![0].type).toBe("earning_mode");
    expect(r.appliedModifiers![0].multiplier).toBe(1.5);
    expect(r.appliedModifiers![0].applied).toBe(true);
  });

  it("extracts admin/adjustment fields", () => {
    const r = parseRewardMetadata(fullPayload);
    expect(r.adjustmentDirection).toBe("credit");
    expect(r.createdBy).toBe("mobile_app");
    expect(r.description).toBe("Ride reward");
    expect(r.rewardConfigHash).toBe("a1b2c3d4");
  });
});

// ── camelCase key contract (critical) ────────────────────────────────────────

describe("parseRewardMetadata — camelCase key contract", () => {
  it("reads bonusBreakdown from camelCase key (mobile wire format)", () => {
    const raw = { bonusBreakdown: [{ type: "streak_bonus", points: 10 }] };
    const r = parseRewardMetadata(raw);
    expect(r.bonusBreakdown).toHaveLength(1);
    expect(r.bonusBreakdown![0].points).toBe(10);
  });

  it("does NOT read from snake_case bonus_breakdown (would be a regression)", () => {
    // If mobile switches to snake_case, this test will catch the admin side being out of sync
    const raw = { bonus_breakdown: [{ type: "streak_bonus", points: 10 }] };
    const r = parseRewardMetadata(raw);
    expect(r.bonusBreakdown).toBeUndefined();
  });

  it("reads rideSessionId from camelCase key", () => {
    expect(parseRewardMetadata({ rideSessionId: "abc" }).rideSessionId).toBe(
      "abc",
    );
  });

  it("does NOT read from snake_case ride_session_id", () => {
    expect(
      parseRewardMetadata({ ride_session_id: "abc" }).rideSessionId,
    ).toBeUndefined();
  });

  it("reads verifiedMinutes from camelCase key", () => {
    expect(parseRewardMetadata({ verifiedMinutes: 15 }).verifiedMinutes).toBe(
      15,
    );
  });
});

// ── Empty / null / malformed inputs ──────────────────────────────────────────

describe("parseRewardMetadata — defensive parsing", () => {
  it("returns all undefined for null input", () => {
    const r = parseRewardMetadata(null);
    expect(r.rideSessionId).toBeUndefined();
    expect(r.basePoints).toBeUndefined();
    expect(r.bonusBreakdown).toBeUndefined();
    expect(r.appliedModifiers).toBeUndefined();
    expect(r.verifiedMinutes).toBeUndefined();
  });

  it("returns all undefined for undefined input", () => {
    const r = parseRewardMetadata(undefined);
    expect(r.rideSessionId).toBeUndefined();
    expect(r.basePoints).toBeUndefined();
  });

  it("returns all undefined for empty object", () => {
    const r = parseRewardMetadata({});
    expect(r.rideSessionId).toBeUndefined();
    expect(r.wasCapped).toBeUndefined();
    expect(r.bonusBreakdown).toBeUndefined();
  });

  it("coerces numeric strings to numbers", () => {
    const r = parseRewardMetadata({ basePoints: "10", multiplier: "1.5" });
    expect(r.basePoints).toBe(10);
    expect(r.multiplier).toBe(1.5);
  });

  it("coerces wasCapped truthy/falsy", () => {
    expect(parseRewardMetadata({ wasCapped: 1 }).wasCapped).toBe(true);
    expect(parseRewardMetadata({ wasCapped: 0 }).wasCapped).toBe(false);
    expect(parseRewardMetadata({ wasCapped: true }).wasCapped).toBe(true);
  });

  it("returns undefined bonusBreakdown for non-array value", () => {
    expect(
      parseRewardMetadata({ bonusBreakdown: "not-an-array" }).bonusBreakdown,
    ).toBeUndefined();
    expect(
      parseRewardMetadata({ bonusBreakdown: null }).bonusBreakdown,
    ).toBeUndefined();
    expect(
      parseRewardMetadata({ bonusBreakdown: 42 }).bonusBreakdown,
    ).toBeUndefined();
  });

  it("returns undefined appliedModifiers for non-array value", () => {
    expect(
      parseRewardMetadata({ appliedModifiers: {} }).appliedModifiers,
    ).toBeUndefined();
  });

  it("handles malformed bonus entry gracefully", () => {
    const r = parseRewardMetadata({
      bonusBreakdown: [null, undefined, { type: "streak_bonus", points: 5 }],
    });
    expect(r.bonusBreakdown).toHaveLength(3);
    expect(r.bonusBreakdown![0].type).toBe(""); // null entry → empty string type
    expect(r.bonusBreakdown![2].points).toBe(5);
  });

  it("never throws regardless of input shape", () => {
    const inputs = [
      42,
      "string",
      [],
      true,
      { bonusBreakdown: [{ points: "bad" }] },
    ];
    for (const input of inputs) {
      expect(() => parseRewardMetadata(input)).not.toThrow();
    }
  });
});

// ── META_KEYS internal consistency ───────────────────────────────────────────

describe("META_KEYS contract", () => {
  it("all META_KEYS values are non-empty strings", () => {
    for (const [k, v] of Object.entries(META_KEYS)) {
      expect(typeof v, `META_KEYS.${k}`).toBe("string");
      expect(v.length, `META_KEYS.${k} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("all META_KEYS values are unique (no two keys map to the same string)", () => {
    const values = Object.values(META_KEYS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("REWARD_SOURCE values are all unique", () => {
    const values = Object.values(REWARD_SOURCE);
    expect(new Set(values).size).toBe(values.length);
  });

  it("BONUS_TYPE values are all unique", () => {
    const values = Object.values(BONUS_TYPE);
    expect(new Set(values).size).toBe(values.length);
  });
});
