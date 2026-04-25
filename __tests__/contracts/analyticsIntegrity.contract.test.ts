/**
 * Analytics integrity contract tests.
 *
 * Tests the pure calculation logic extracted from sessionAnalytics.ts and
 * CampaignsOverview.tsx to verify:
 *   - Bonus breakdown charts never silently zero
 *   - Streak leaderboard correctly handles multiplier-kind vs points-kind bonuses
 *   - Impression KPI prefers live session aggregate over stale campaign column
 *   - Reward provenance round-trip: mobile output → parseRewardMetadata → correct display
 *
 * These tests use no DB or server connections — they verify the calculation
 * logic in isolation using representative payloads.
 */

import { describe, it, expect } from "vitest";
import {
  parseRewardMetadata,
  BONUS_TYPE,
  BONUS_TYPE_LABELS,
  REWARD_SOURCE,
  REWARD_SOURCE_LABELS,
  VERIFICATION_STATUS,
} from "../../lib/rewardConstants";

// ── Bonus chart label coverage ────────────────────────────────────────────────

describe("Bonus chart — label coverage for all mobile-written bonus types", () => {
  // Simulates the bonus chart aggregation in sessionAnalytics.ts
  function aggregateBonusByType(
    breakdowns: Array<{ type: string; points?: number }>[],
  ): Map<string, { count: number; points: number; label: string }> {
    const acc = new Map<
      string,
      { count: number; points: number; label: string }
    >();
    for (const bd of breakdowns) {
      for (const entry of bd) {
        const existing = acc.get(entry.type) ?? {
          count: 0,
          points: 0,
          label: BONUS_TYPE_LABELS[entry.type] ?? entry.type, // fallback to raw type = bug
        };
        existing.count++;
        existing.points += entry.points ?? 0;
        acc.set(entry.type, existing);
      }
    }
    return acc;
  }

  it("every BONUS_TYPE produces a human-readable label (not the raw type string)", () => {
    for (const [name, type] of Object.entries(BONUS_TYPE)) {
      const label = BONUS_TYPE_LABELS[type];
      expect(
        label,
        `BONUS_TYPE.${name} = "${type}" has no label — chart will show raw string`,
      ).toBeTruthy();
      expect(
        label,
        `BONUS_TYPE.${name} label should differ from raw value`,
      ).not.toBe(type);
    }
  });

  it("aggregation uses readable labels for boosted_ride_boost (campaign boost)", () => {
    const result = aggregateBonusByType([
      [{ type: BONUS_TYPE.BOOSTED_RIDE_BOOST, points: 10 }],
    ]);
    const entry = result.get(BONUS_TYPE.BOOSTED_RIDE_BOOST)!;
    expect(entry.label).toBe("Campaign Boost");
    expect(entry.label).not.toBe(BONUS_TYPE.BOOSTED_RIDE_BOOST); // would be the bug
  });

  it("aggregation uses readable labels for completion_quality_bonus", () => {
    const result = aggregateBonusByType([
      [{ type: BONUS_TYPE.COMPLETION_QUALITY_BONUS }],
    ]);
    const entry = result.get(BONUS_TYPE.COMPLETION_QUALITY_BONUS)!;
    expect(entry.label).toBe("Quality Bonus");
  });

  it("aggregation uses readable labels for manual_admin_adjustment", () => {
    const result = aggregateBonusByType([
      [{ type: BONUS_TYPE.MANUAL_ADMIN_ADJUSTMENT, points: -5 }],
    ]);
    const entry = result.get(BONUS_TYPE.MANUAL_ADMIN_ADJUSTMENT)!;
    expect(entry.label).toBe("Admin Adjustment");
  });
});

// ── Streak leaderboard integrity ──────────────────────────────────────────────

describe("Streak leaderboard — points-kind vs multiplier-kind bonuses", () => {
  // Mirrors the streak leaderboard aggregation in sessionAnalytics.ts
  function aggregateStreakPoints(txMetadataList: unknown[]): {
    count: number;
    points: number;
  } {
    let count = 0;
    let points = 0;
    for (const meta of txMetadataList) {
      const parsed = parseRewardMetadata(meta);
      const streakEntries = (parsed.bonusBreakdown ?? []).filter(
        (e) => e.type === BONUS_TYPE.STREAK_BONUS,
      );
      count += streakEntries.length;
      points += streakEntries.reduce((s, e) => s + (e.points ?? 0), 0);
    }
    return { count, points };
  }

  it("correctly sums points-kind streak bonuses", () => {
    const metadata = [
      {
        bonusBreakdown: [
          { type: BONUS_TYPE.STREAK_BONUS, points: 15 },
          { type: BONUS_TYPE.HOT_ZONE_BOOST, points: 5 },
        ],
      },
      {
        bonusBreakdown: [{ type: BONUS_TYPE.STREAK_BONUS, points: 10 }],
      },
    ];
    const result = aggregateStreakPoints(metadata);
    expect(result.count).toBe(2);
    expect(result.points).toBe(25);
  });

  it("multiplier-kind streak bonuses contribute 0 points to leaderboard (known limitation)", () => {
    // Mobile writes streak_bonus as kind:"multiplier" when the streak affects the
    // points multiplier. These entries have no `points` field. The leaderboard
    // sums `entry.points ?? 0`, so multiplier-kind streaks score 0 on the leaderboard.
    // This test DOCUMENTS the limitation — it does not assert it is correct behavior.
    const metadata = [
      {
        bonusBreakdown: [
          { type: BONUS_TYPE.STREAK_BONUS, multiplier: 1.1 }, // no points field
        ],
      },
    ];
    const result = aggregateStreakPoints(metadata);
    expect(result.count).toBe(1); // entry IS counted
    expect(result.points).toBe(0); // but contributes 0 points — known gap
  });

  it("ignores non-streak bonus types in leaderboard calculation", () => {
    const metadata = [
      {
        bonusBreakdown: [
          { type: BONUS_TYPE.HOT_ZONE_BOOST, points: 50 },
          { type: BONUS_TYPE.PEAK_HOUR_BOOST, points: 20 },
        ],
      },
    ];
    const result = aggregateStreakPoints(metadata);
    expect(result.count).toBe(0);
    expect(result.points).toBe(0);
  });

  it("handles missing bonusBreakdown gracefully (no crash)", () => {
    const metadata = [null, undefined, {}, { bonusBreakdown: null }];
    expect(() => aggregateStreakPoints(metadata)).not.toThrow();
    expect(aggregateStreakPoints(metadata).points).toBe(0);
  });
});

// ── Impression KPI source selection ──────────────────────────────────────────

describe("Campaign impressions KPI — live vs stale source selection", () => {
  // Mirrors the liveImpressions calculation in CampaignsOverview.tsx:
  //   liveImpressions = realAnalytics?.totalImpressions ?? totalImpressions
  function computeLiveImpressions(
    liveAnalyticsTotal: number | undefined,
    staleColumnTotal: number,
  ): number {
    return liveAnalyticsTotal ?? staleColumnTotal;
  }

  it("prefers live session aggregate over stale campaign.impressions column", () => {
    expect(computeLiveImpressions(1500, 200)).toBe(1500);
  });

  it("falls back to stale column when live analytics unavailable (loading state)", () => {
    expect(computeLiveImpressions(undefined, 200)).toBe(200);
  });

  it("prefers live value even when it is zero (e.g. new campaign with no sessions yet)", () => {
    expect(computeLiveImpressions(0, 200)).toBe(0);
  });

  it("does not fallback to stale when live is explicitly 0", () => {
    // ?? only triggers on null/undefined — 0 is a valid live value (new campaign, no sessions yet)
    const live: number | undefined = 0;
    expect(live ?? 200).toBe(0);
  });
});

// ── Reward provenance round-trip ──────────────────────────────────────────────

describe("Reward provenance — mobile output → parseRewardMetadata → correct display", () => {
  // A realistic payload for a boosted ride with campaign boost + hot zone
  const boostRidePayload = {
    rideSessionId: "sess-999",
    earningMode: "ad_enhanced_ride",
    bikeType: "standard_bike",
    basePoints: 14,
    multiplier: 1.8,
    campaignBoostMultiplier: 1.2,
    pointsBeforeBonuses: 25,
    fixedBonusPoints: 8,
    pointsBeforeCap: 33,
    cappedPoints: 0,
    wasCapped: false,
    verifiedMinutes: 14,
    bonusBreakdown: [
      {
        type: "boosted_ride_boost",
        label: "Campaign Boost",
        multiplier: 1.5,
        applied: true,
        kind: "multiplier",
      },
      {
        type: "hot_zone_boost",
        label: "Hot Zone Boost",
        points: 8,
        applied: true,
        kind: "points",
      },
    ],
    appliedModifiers: [
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
  };

  it("parses all payout chain fields", () => {
    const r = parseRewardMetadata(boostRidePayload);
    expect(r.basePoints).toBe(14);
    expect(r.multiplier).toBe(1.8);
    expect(r.campaignBoostMultiplier).toBe(1.2);
    expect(r.pointsBeforeBonuses).toBe(25);
    expect(r.fixedBonusPoints).toBe(8);
    expect(r.pointsBeforeCap).toBe(33);
    expect(r.wasCapped).toBe(false);
    expect(r.verifiedMinutes).toBe(14);
  });

  it("bonus breakdown entries resolve to human-readable labels", () => {
    const r = parseRewardMetadata(boostRidePayload);
    expect(r.bonusBreakdown).toHaveLength(2);
    for (const entry of r.bonusBreakdown!) {
      const label = BONUS_TYPE_LABELS[entry.type];
      expect(
        label,
        `Bonus type "${entry.type}" has no label — will display as raw string`,
      ).toBeTruthy();
    }
  });

  it("multiplier chain is accessible for payout reconstruction", () => {
    const r = parseRewardMetadata(boostRidePayload);
    expect(r.appliedModifiers).toHaveLength(2);
    const totalMultiplier = (r.appliedModifiers ?? [])
      .filter((m) => m.applied)
      .reduce((acc, m) => acc * (m.multiplier ?? 1), 1);
    expect(totalMultiplier).toBeCloseTo(1.5 * 1.2);
  });

  it("can reconstruct final points from chain: basePoints × multiplier + fixedBonus", () => {
    const r = parseRewardMetadata(boostRidePayload);
    const reconstructed =
      Math.round((r.basePoints ?? 0) * (r.multiplier ?? 1)) +
      (r.fixedBonusPoints ?? 0);
    expect(reconstructed).toBe(r.pointsBeforeCap);
  });

  it("REWARD_SOURCE_LABELS covers boosted_ride and standard_ride for source display", () => {
    expect(REWARD_SOURCE_LABELS[REWARD_SOURCE.BOOSTED_RIDE]).toBeTruthy();
    expect(REWARD_SOURCE_LABELS[REWARD_SOURCE.STANDARD_RIDE]).toBeTruthy();
  });
});

// ── Verification status in analytics context ──────────────────────────────────

describe("Analytics verification trend — status classification", () => {
  // Mirrors the trendMap accumulation in getSessionAnalytics()
  type TrendPoint = {
    verified: number;
    rejected: number;
    manual_review: number;
    pending: number;
  };

  function classifyStatus(status: string, point: TrendPoint): void {
    if (status === VERIFICATION_STATUS.VERIFIED) point.verified++;
    else if (status === VERIFICATION_STATUS.REJECTED) point.rejected++;
    else if (status === VERIFICATION_STATUS.MANUAL_REVIEW)
      point.manual_review++;
    else point.pending++;
  }

  it("classifies all 4 statuses correctly", () => {
    const point: TrendPoint = {
      verified: 0,
      rejected: 0,
      manual_review: 0,
      pending: 0,
    };
    classifyStatus(VERIFICATION_STATUS.VERIFIED, point);
    classifyStatus(VERIFICATION_STATUS.REJECTED, point);
    classifyStatus(VERIFICATION_STATUS.MANUAL_REVIEW, point);
    classifyStatus(VERIFICATION_STATUS.PENDING, point);
    expect(point).toEqual({
      verified: 1,
      rejected: 1,
      manual_review: 1,
      pending: 1,
    });
  });

  it("unknown statuses fall through to pending bucket", () => {
    const point: TrendPoint = {
      verified: 0,
      rejected: 0,
      manual_review: 0,
      pending: 0,
    };
    classifyStatus("approved", point); // typo / drift
    expect(point.pending).toBe(1);
    expect(point.verified).toBe(0);
  });
});
