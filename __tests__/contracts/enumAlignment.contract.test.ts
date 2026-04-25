/**
 * Contract tests for enum alignment between mobile and admin.
 *
 * These tests verify that every value the mobile app can write to the database
 * has a corresponding label in the admin display maps. A failure here means
 * admin dashboards display raw DB strings (e.g. "boosted_ride_boost") instead
 * of human-readable labels (e.g. "Campaign Boost").
 *
 * Drift history documented in lib/rewardConstants.ts under BONUS_TYPE.
 */

import { describe, it, expect } from "vitest";
import {
  BONUS_TYPE,
  BONUS_TYPE_LABELS,
  REWARD_SOURCE,
  REWARD_SOURCE_LABELS,
  BIKE_TYPE_LABELS,
  VERIFICATION_STATUS,
  VERIFICATION_REASON_CODES,
  DB_TABLES,
} from "../../lib/rewardConstants";

// ── BONUS_TYPE_LABELS completeness ───────────────────────────────────────────

describe("BONUS_TYPE_LABELS — completeness against mobile-written types", () => {
  it("has a label for every BONUS_TYPE value", () => {
    const missing: string[] = [];
    for (const [name, value] of Object.entries(BONUS_TYPE)) {
      if (!BONUS_TYPE_LABELS[value]) {
        missing.push(`BONUS_TYPE.${name} = "${value}"`);
      }
    }
    expect(
      missing,
      `These bonus types written by mobile have no admin label — dashboards will show raw strings:\n  ${missing.join("\n  ")}`,
    ).toHaveLength(0);
  });

  it("labels are non-empty strings", () => {
    for (const [key, label] of Object.entries(BONUS_TYPE_LABELS)) {
      expect(typeof label, `BONUS_TYPE_LABELS["${key}"]`).toBe("string");
      expect(
        label.trim().length,
        `BONUS_TYPE_LABELS["${key}"] is blank`,
      ).toBeGreaterThan(0);
    }
  });

  it("streak_bonus maps to a non-empty label", () => {
    expect(BONUS_TYPE_LABELS[BONUS_TYPE.STREAK_BONUS]).toBeTruthy();
  });

  it("boosted_ride_boost (campaign multiplier) maps to a label", () => {
    // This was the primary drift point — mobile writes "boosted_ride_boost",
    // admin previously only had "campaign_boost" which was never written
    expect(BONUS_TYPE_LABELS[BONUS_TYPE.BOOSTED_RIDE_BOOST]).toBeTruthy();
  });

  it("completion_quality_bonus maps to a label", () => {
    // mobile writes "completion_quality_bonus", admin previously had "quality_bonus"
    expect(BONUS_TYPE_LABELS[BONUS_TYPE.COMPLETION_QUALITY_BONUS]).toBeTruthy();
  });

  it("manual_admin_adjustment maps to a label", () => {
    expect(BONUS_TYPE_LABELS[BONUS_TYPE.MANUAL_ADMIN_ADJUSTMENT]).toBeTruthy();
  });
});

// ── REWARD_SOURCE_LABELS completeness ───────────────────────────────────────

describe("REWARD_SOURCE_LABELS — completeness against mobile-written sources", () => {
  it("has a label for every REWARD_SOURCE value", () => {
    const missing: string[] = [];
    for (const [name, value] of Object.entries(REWARD_SOURCE)) {
      if (!REWARD_SOURCE_LABELS[value]) {
        missing.push(`REWARD_SOURCE.${name} = "${value}"`);
      }
    }
    expect(
      missing,
      `These reward sources have no admin label:\n  ${missing.join("\n  ")}`,
    ).toHaveLength(0);
  });

  it("labels are non-empty strings", () => {
    for (const [key, label] of Object.entries(REWARD_SOURCE_LABELS)) {
      expect(
        label.trim().length,
        `REWARD_SOURCE_LABELS["${key}"] is blank`,
      ).toBeGreaterThan(0);
    }
  });

  it("all 7 standard source types are present", () => {
    const expected = [
      REWARD_SOURCE.STANDARD_RIDE,
      REWARD_SOURCE.AD_BOOST,
      REWARD_SOURCE.BOOSTED_RIDE,
      REWARD_SOURCE.BONUS,
      REWARD_SOURCE.STANDARD_RIDE_BONUS,
      REWARD_SOURCE.ADJUSTMENT,
      REWARD_SOURCE.REDEMPTION,
    ];
    for (const src of expected) {
      expect(
        REWARD_SOURCE_LABELS[src],
        `Missing label for source "${src}"`,
      ).toBeTruthy();
    }
  });
});

// ── BIKE_TYPE_LABELS completeness ────────────────────────────────────────────

describe("BIKE_TYPE_LABELS", () => {
  it("covers all mobile-written bike types", () => {
    const mobileTypes = ["standard_bike", "e_bike", "fat_bike", "unknown"];
    for (const bt of mobileTypes) {
      expect(
        BIKE_TYPE_LABELS[bt],
        `Missing label for bike type "${bt}"`,
      ).toBeTruthy();
    }
  });
});

// ── VERIFICATION_STATUS completeness ─────────────────────────────────────────

describe("VERIFICATION_STATUS", () => {
  it("covers all 4 mobile-written statuses", () => {
    const expected = ["pending", "verified", "rejected", "manual_review"];
    const values = Object.values(VERIFICATION_STATUS);
    for (const s of expected) {
      expect(values, `VERIFICATION_STATUS missing "${s}"`).toContain(s);
    }
  });

  it("has exactly 4 values (no undocumented statuses)", () => {
    expect(Object.values(VERIFICATION_STATUS)).toHaveLength(4);
  });

  it("all values are lowercase strings", () => {
    for (const v of Object.values(VERIFICATION_STATUS)) {
      expect(v).toBe(v.toLowerCase());
    }
  });
});

// ── VERIFICATION_REASON_CODES ─────────────────────────────────────────────────

describe("VERIFICATION_REASON_CODES", () => {
  it("has exactly 7 reason codes matching mobile rejection/review conditions", () => {
    expect(Object.values(VERIFICATION_REASON_CODES)).toHaveLength(7);
  });

  it("all reason codes are lowercase snake_case strings", () => {
    for (const [name, code] of Object.entries(VERIFICATION_REASON_CODES)) {
      expect(typeof code, `VERIFICATION_REASON_CODES.${name}`).toBe("string");
      expect(code, `${name} should be lowercase`).toBe(code.toLowerCase());
      expect(code, `${name} should use underscores not hyphens`).not.toContain(
        "-",
      );
    }
  });

  it("reason codes are all unique", () => {
    const values = Object.values(VERIFICATION_REASON_CODES);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ── DB_TABLES ─────────────────────────────────────────────────────────────────

describe("DB_TABLES", () => {
  it("all table names are non-empty strings", () => {
    for (const [k, v] of Object.entries(DB_TABLES)) {
      expect(typeof v, `DB_TABLES.${k}`).toBe("string");
      expect(v.length, `DB_TABLES.${k} is empty`).toBeGreaterThan(0);
    }
  });

  it("all table names are unique (no two constants point to same table)", () => {
    const values = Object.values(DB_TABLES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("reward_transactions is the canonical reward ledger table name", () => {
    expect(DB_TABLES.REWARD_TRANSACTIONS).toBe("reward_transactions");
  });

  it("ride_session is the canonical session table name (not ride_sessions)", () => {
    // Mobile writes to singular "ride_session", not "ride_sessions"
    expect(DB_TABLES.RIDE_SESSION).toBe("ride_session");
  });
});
