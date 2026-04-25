/**
 * Schema contract tests — verify admin queries use the correct column names.
 *
 * These tests read the actual source files and assert that the DB column names
 * admin queries are correct. They exist because PostgREST silently returns zero
 * rows (or nulls) when a query references a non-existent column name, meaning
 * bugs in column names are invisible at runtime until someone notices wrong data.
 *
 * Each test is annotated with the drift incident that motivated it.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

/** Source with single-line and block comments stripped — used for column-name assertions
 *  so that documentation comments like "// not route_assignment_id" don't cause false failures. */
function readSourceNoComments(relPath: string): string {
  return readSource(relPath)
    .replace(/\/\/[^\n]*/g, "") // strip // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // strip /* block comments */
}

// ── ride_session column contracts ────────────────────────────────────────────

describe("ride_session column names — rideSessions.ts", () => {
  const src = readSource("app/actions/rideSessions.ts");
  const srcNoComments = readSourceNoComments("app/actions/rideSessions.ts");

  it("uses completed_at (not ended_at) for ride completion timestamp", () => {
    // Drift incident: getCampaignAnalyticsData used ended_at, causing zero analytics rows
    expect(src).toContain("completed_at");
    expect(src).not.toMatch(/["'`]ended_at["'`]/);
  });

  it("uses rider_route_id (not route_assignment_id) for route assignment FK", () => {
    expect(srcNoComments).toContain("rider_route_id");
    // Comments may mention the old name for documentation; functional code must not use it
    expect(srcNoComments).not.toContain("route_assignment_id");
  });

  it("uses moving_time_ms (not moving_time) for raw millisecond field", () => {
    expect(src).toContain("moving_time_ms");
    expect(src).not.toMatch(/["'`]moving_time["'`]/);
  });

  it("primary select includes all critical ride_session columns", () => {
    const criticalColumns = [
      "completed_at",
      "rider_route_id",
      "moving_time_ms",
      "verification_result",
      "ride_quality_percent",
      "total_distance_meters",
      "earning_mode",
      "bike_type",
    ];
    for (const col of criticalColumns) {
      expect(src, `rideSessions.ts must select "${col}"`).toContain(col);
    }
  });

  it("uses DB_TABLES constants for all table references (no bare string literals)", () => {
    // Bare "ride_session" string literals (excluding the DB_TABLES definition itself)
    const bareRideSession = [
      ...src.matchAll(/from\s*\(\s*["'`]ride_session["'`]/g),
    ];
    expect(
      bareRideSession.length,
      "rideSessions.ts should use DB_TABLES.RIDE_SESSION not a bare string",
    ).toBe(0);

    const bareRideVerification = [
      ...src.matchAll(/from\s*\(\s*["'`]ride_verification["'`]/g),
    ];
    expect(
      bareRideVerification.length,
      "rideSessions.ts should use DB_TABLES.RIDE_VERIFICATION not a bare string",
    ).toBe(0);

    const bareRewardTransactions = [
      ...src.matchAll(/from\s*\(\s*["'`]reward_transactions["'`]/g),
    ];
    expect(
      bareRewardTransactions.length,
      "rideSessions.ts should use DB_TABLES.REWARD_TRANSACTIONS not a bare string",
    ).toBe(0);
  });

  it("uses VERIFICATION_STATUS constants (not string literals) for verification status checks", () => {
    // Critical: prevents "verified" → "approved" or similar rename going undetected
    expect(src).toContain("VERIFICATION_STATUS.VERIFIED");
    expect(src).toContain("VERIFICATION_STATUS.REJECTED");
    expect(src).toContain("VERIFICATION_STATUS.PENDING");
    expect(src).toContain("VERIFICATION_STATUS.MANUAL_REVIEW");
  });
});

// ── campaign analytics column contracts ──────────────────────────────────────

describe("ride_session column names — campaigns.ts", () => {
  const src = readSource("app/actions/campaigns.ts");

  it("uses completed_at (not ended_at) in getCampaignAnalyticsData", () => {
    // Drift incident: this was the primary bug causing zero live analytics.
    // ended_at does not exist on ride_session; PostgREST returned zero rows silently.
    expect(src).toContain("completed_at");
    expect(src).not.toMatch(/["'`]ended_at["'`]/);
  });

  it("queries campaign_impact_impressions from ride_session", () => {
    expect(src).toContain("campaign_impact_impressions");
  });
});

// ── reward_transactions column contracts ─────────────────────────────────────

describe("reward_transactions column names — rewards.ts", () => {
  const src = readSource("app/actions/rewards.ts");

  it("selects points_earned (the actual DB column name)", () => {
    expect(src).toContain("points_earned");
  });

  it("uses DB_TABLES constant for reward_transactions", () => {
    const bare = [
      ...src.matchAll(/from\s*\(\s*["'`]reward_transactions["'`]/g),
    ];
    expect(
      bare.length,
      "rewards.ts should use DB_TABLES.REWARD_TRANSACTIONS not a bare string",
    ).toBe(0);
  });

  it("filters by rideSessionId (camelCase) in getSessionRewardTransactions", () => {
    // The .contains() filter must use the exact camelCase key mobile writes
    expect(src).toContain("rideSessionId");
  });
});

// ── sessionAnalytics column contracts ────────────────────────────────────────

describe("sessionAnalytics.ts — column and constant usage", () => {
  const src = readSource("app/actions/sessionAnalytics.ts");

  it("uses DB_TABLES constant for all table references", () => {
    const bareRideSession = [
      ...src.matchAll(/from\s*\(\s*["'`]ride_session["'`]/g),
    ];
    expect(bareRideSession.length, "should use DB_TABLES.RIDE_SESSION").toBe(0);

    const bareRideVerification = [
      ...src.matchAll(/from\s*\(\s*["'`]ride_verification["'`]/g),
    ];
    expect(
      bareRideVerification.length,
      "should use DB_TABLES.RIDE_VERIFICATION",
    ).toBe(0);

    const bareRewardTx = [
      ...src.matchAll(/from\s*\(\s*["'`]reward_transactions["'`]/g),
    ];
    expect(
      bareRewardTx.length,
      "should use DB_TABLES.REWARD_TRANSACTIONS",
    ).toBe(0);
  });

  it("uses BONUS_TYPE constant for streak_bonus comparison (not magic string)", () => {
    expect(src).toContain("BONUS_TYPE.STREAK_BONUS");
    expect(src).not.toMatch(/=== ["'`]streak_bonus["'`]/);
  });

  it("uses VERIFICATION_STATUS constants for status comparisons", () => {
    expect(src).toContain("VERIFICATION_STATUS.VERIFIED");
    expect(src).toContain("VERIFICATION_STATUS.REJECTED");
    expect(src).toContain("VERIFICATION_STATUS.MANUAL_REVIEW");
  });

  it("reads bonusBreakdown via camelCase key", () => {
    expect(src).toContain("bonusBreakdown");
    expect(src).not.toContain("bonus_breakdown");
  });
});

// ── riderPerformance column contracts ────────────────────────────────────────

describe("riderPerformance.ts — constants usage", () => {
  const src = readSource("app/actions/riderPerformance.ts");

  it("uses DB_TABLES.RIDE_VERIFICATION (not bare string)", () => {
    const bare = [...src.matchAll(/from\s*\(\s*["'`]ride_verification["'`]/g)];
    expect(bare.length, "should use DB_TABLES.RIDE_VERIFICATION").toBe(0);
    expect(src).toContain("DB_TABLES.RIDE_VERIFICATION");
  });

  it("uses VERIFICATION_STATUS constants for comparisons", () => {
    expect(src).toContain("VERIFICATION_STATUS.VERIFIED");
    expect(src).not.toMatch(/=== ["'`]verified["'`]/);
  });
});

// ── rewardConstants.ts internal structure ────────────────────────────────────

describe("lib/rewardConstants.ts — structural integrity", () => {
  const src = readSource("lib/rewardConstants.ts");

  it("exports DB_TABLES, META_KEYS, BONUS_TYPE, REWARD_SOURCE, VERIFICATION_STATUS, VERIFICATION_REASON_CODES", () => {
    const constExports = [
      "DB_TABLES",
      "META_KEYS",
      "BONUS_TYPE",
      "REWARD_SOURCE",
      "VERIFICATION_STATUS",
      "VERIFICATION_REASON_CODES",
      "BONUS_TYPE_LABELS",
      "REWARD_SOURCE_LABELS",
    ];
    for (const name of constExports) {
      expect(src, `rewardConstants.ts must export const "${name}"`).toContain(
        `export const ${name}`,
      );
    }
    // parseRewardMetadata is exported as a function, not a const
    expect(
      src,
      `rewardConstants.ts must export function "parseRewardMetadata"`,
    ).toContain("export function parseRewardMetadata");
  });

  it("does not use any hardcoded table name strings outside the DB_TABLES definition", () => {
    // Remove the DB_TABLES block itself, then check for bare strings
    const withoutDefinition = src.replace(
      /export const DB_TABLES[\s\S]*?} as const;/,
      "",
    );
    const bareTableStrings = [
      '"reward_transactions"',
      '"ride_session"',
      '"ride_verification"',
      '"rider_reward_balance"',
      '"reward_redemptions"',
    ];
    for (const str of bareTableStrings) {
      expect(
        withoutDefinition,
        `rewardConstants.ts contains bare table string ${str} outside DB_TABLES`,
      ).not.toContain(str);
    }
  });
});
