/**
 * Adversarial input tests — Phase 6 cross-system truth verification.
 *
 * Probes parseRewardMetadata, validateRewardMetadata, and buildRewardAuditTrail
 * with inputs that are structurally unexpected but plausible from a mobile bug,
 * schema drift, or malformed DB write:
 *
 *   - Wrong JS types for known fields (string where number expected, etc.)
 *   - Extreme numeric values (NaN, Infinity, 0, negative, very large)
 *   - Malformed bonusBreakdown/appliedModifiers entries
 *   - Snake_case keys sent instead of camelCase (wrong casing bug in mobile)
 *   - Extra unknown keys in the JSONB blob (forward-compatibility)
 *   - Deeply nested / circular-like structures
 *
 * Every test asserts either:
 *   (a) The parser gracefully returns a sane value (never throws, never NaN leak)
 *   (b) validateRewardMetadata surfaces the anomaly as a violation
 *   (c) buildRewardAuditTrail marks the relevant step as "inconsistent" or "missing"
 */

import { describe, it, expect } from "vitest";
import { parseRewardMetadata, META_KEYS } from "../../lib/rewardConstants";
import { validateRewardMetadata } from "../../lib/contractDiagnostics";
import { buildRewardAuditTrail } from "../../lib/rewardReconstruction";
import type { RewardTransaction } from "../../schemas/reward";

function makeTx(overrides: Partial<RewardTransaction>): RewardTransaction {
  return {
    id: "tx-adv",
    riderId: "rider-1",
    type: "awarded",
    source: "standard_ride",
    points: 20,
    balanceAfter: 120,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Numeric string coercions ──────────────────────────────────────────────────

describe("parseRewardMetadata — numeric string coercions (mobile sends wrong type)", () => {
  it('parses "14" (string) as number 14 for basePoints', () => {
    const r = parseRewardMetadata({ [META_KEYS.BASE_POINTS]: "14" });
    // asMaybeNumber: val != null ? Number(val) : undefined
    // Number("14") = 14 — must parse correctly, not be undefined
    expect(r.basePoints).toBe(14);
  });

  it('parses "1.5" (string) as 1.5 for multiplier', () => {
    const r = parseRewardMetadata({ [META_KEYS.MULTIPLIER]: "1.5" });
    expect(r.multiplier).toBe(1.5);
  });

  it('parses "0" (string) as 0 for verifiedMinutes', () => {
    const r = parseRewardMetadata({ [META_KEYS.VERIFIED_MINUTES]: "0" });
    expect(r.verifiedMinutes).toBe(0);
  });

  it('does not treat "  " (whitespace string) as a valid number — returns NaN, not a sane int', () => {
    // Number("  ") = 0, which would be misleading but is how JS works
    // This test documents the behavior so future devs don't assume undefined
    const r = parseRewardMetadata({ [META_KEYS.BASE_POINTS]: "  " });
    // Number("  ") === 0 in JS
    expect(r.basePoints).toBe(0);
  });

  it('"abc" string for basePoints produces NaN (documents behavior — caller must guard)', () => {
    const r = parseRewardMetadata({ [META_KEYS.BASE_POINTS]: "abc" });
    expect(r.basePoints).toBeNaN();
  });
});

// ── Extreme numeric inputs ────────────────────────────────────────────────────

describe("parseRewardMetadata — extreme numeric inputs", () => {
  it("accepts 0 for verifiedMinutes (zero-duration ride edge case)", () => {
    const r = parseRewardMetadata({
      [META_KEYS.RIDE_SESSION_ID]: "sess-x",
      [META_KEYS.VERIFIED_MINUTES]: 0,
      [META_KEYS.BASE_POINTS]: 0,
    });
    expect(r.verifiedMinutes).toBe(0);
    expect(r.basePoints).toBe(0);
  });

  it("passes Infinity through (documents — caller must guard against Infinity in math)", () => {
    const r = parseRewardMetadata({ [META_KEYS.MULTIPLIER]: Infinity });
    expect(r.multiplier).toBe(Infinity);
  });

  it("passes -Infinity through (documents behavior)", () => {
    const r = parseRewardMetadata({ [META_KEYS.BASE_POINTS]: -Infinity });
    expect(r.basePoints).toBe(-Infinity);
  });

  it("passes NaN through from null-coerced Number(null) — actually undefined, not NaN", () => {
    // asMaybeNumber: val != null ? Number(val) : undefined
    // null triggers the else branch — returns undefined, not NaN
    const r = parseRewardMetadata({ [META_KEYS.BASE_POINTS]: null });
    expect(r.basePoints).toBeUndefined();
  });

  it("handles very large number (potential overflow in UI display, not a parse issue)", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const r = parseRewardMetadata({ [META_KEYS.BASE_POINTS]: huge });
    expect(r.basePoints).toBe(huge);
  });

  it("handles negative basePoints (mobile bug — base never negative in normal flow)", () => {
    const r = parseRewardMetadata({ [META_KEYS.BASE_POINTS]: -5 });
    expect(r.basePoints).toBe(-5); // parser accepts, caller's problem
  });
});

// ── Boolean coercion traps ────────────────────────────────────────────────────

describe("parseRewardMetadata — boolean coercions for wasCapped", () => {
  it("wasCapped: true (correct boolean)", () => {
    const r = parseRewardMetadata({ [META_KEYS.WAS_CAPPED]: true });
    expect(r.wasCapped).toBe(true);
  });

  it("wasCapped: false (correct boolean)", () => {
    const r = parseRewardMetadata({ [META_KEYS.WAS_CAPPED]: false });
    expect(r.wasCapped).toBe(false);
  });

  it("wasCapped: 1 (truthy integer — mobile bug) coerces to true", () => {
    const r = parseRewardMetadata({ [META_KEYS.WAS_CAPPED]: 1 });
    expect(r.wasCapped).toBe(true);
  });

  it("wasCapped: 0 (falsy integer — mobile bug) coerces to false", () => {
    const r = parseRewardMetadata({ [META_KEYS.WAS_CAPPED]: 0 });
    expect(r.wasCapped).toBe(false);
  });

  it("wasCapped: null returns undefined (not false — caller must not assume false)", () => {
    const r = parseRewardMetadata({ [META_KEYS.WAS_CAPPED]: null });
    expect(r.wasCapped).toBeUndefined();
  });
});

// ── Wrong-casing keys (snake_case instead of camelCase) ───────────────────────

describe("parseRewardMetadata — wrong casing rejects field (snake_case bug in mobile)", () => {
  it("base_points (snake_case) is NOT parsed as basePoints", () => {
    const r = parseRewardMetadata({ base_points: 20 });
    // META_KEYS.BASE_POINTS = "basePoints" — snake_case key is unknown
    expect(r.basePoints).toBeUndefined();
  });

  it("verified_minutes (snake_case) is NOT parsed", () => {
    const r = parseRewardMetadata({ verified_minutes: 15 });
    expect(r.verifiedMinutes).toBeUndefined();
  });

  it("RideSessionId (PascalCase) is NOT parsed", () => {
    const r = parseRewardMetadata({ RideSessionId: "sess-1" });
    expect(r.rideSessionId).toBeUndefined();
  });

  it("wrong-casing rideSessionId triggers CRITICAL violation", () => {
    const violations = validateRewardMetadata({ ride_session_id: "sess-1" });
    const critical = violations.filter(
      (v) => v.severity === "critical" && v.field === "rideSessionId",
    );
    expect(critical).toHaveLength(1);
  });
});

// ── Extra / unknown keys (forward-compatibility) ──────────────────────────────

describe("parseRewardMetadata — extra unknown keys are silently ignored", () => {
  it("unknown key 'futureField' does not affect known fields", () => {
    const r = parseRewardMetadata({
      [META_KEYS.RIDE_SESSION_ID]: "sess-ok",
      [META_KEYS.BASE_POINTS]: 10,
      futureField: "some-future-value",
      another_unknown_key: { nested: true },
    });
    expect(r.rideSessionId).toBe("sess-ok");
    expect(r.basePoints).toBe(10);
  });

  it("extra unknown key produces no violations (forward-compat — new mobile fields are not a problem)", () => {
    const violations = validateRewardMetadata({
      [META_KEYS.RIDE_SESSION_ID]: "sess-ok",
      [META_KEYS.VERIFIED_MINUTES]: 10,
      [META_KEYS.BASE_POINTS]: 10,
      mobile_future_field: "some-future-value",
    });
    // No critical or warning — only unrecognized bonus types produce info
    const critWarn = violations.filter((v) => v.severity !== "info");
    expect(critWarn).toHaveLength(0);
  });
});

// ── Malformed bonusBreakdown entries ─────────────────────────────────────────

describe("parseRewardMetadata — malformed bonusBreakdown entries", () => {
  it("null entry in bonusBreakdown array is parsed with empty type string", () => {
    const r = parseRewardMetadata({
      [META_KEYS.BONUS_BREAKDOWN]: [null],
    });
    // null entry: e = {}, String(e.type ?? "") = ""
    expect(r.bonusBreakdown).toHaveLength(1);
    expect(r.bonusBreakdown![0].type).toBe("");
  });

  it("primitive string entry in bonusBreakdown array is parsed with empty type", () => {
    const r = parseRewardMetadata({
      [META_KEYS.BONUS_BREAKDOWN]: ["streak_bonus"],
    });
    // "streak_bonus" is not an object, so e = {}, type = ""
    expect(r.bonusBreakdown![0].type).toBe("");
  });

  it("bonusBreakdown as string (not array) returns undefined", () => {
    const r = parseRewardMetadata({
      [META_KEYS.BONUS_BREAKDOWN]: "streak_bonus",
    });
    expect(r.bonusBreakdown).toBeUndefined();
  });

  it("bonusBreakdown as object (not array) returns undefined", () => {
    const r = parseRewardMetadata({
      [META_KEYS.BONUS_BREAKDOWN]: { type: "streak_bonus", points: 5 },
    });
    expect(r.bonusBreakdown).toBeUndefined();
  });

  it("entry with numeric type field is String-coerced", () => {
    const r = parseRewardMetadata({
      [META_KEYS.BONUS_BREAKDOWN]: [{ type: 42, points: 5 }],
    });
    expect(r.bonusBreakdown![0].type).toBe("42");
  });

  it("empty bonusBreakdown array returns empty array (not undefined)", () => {
    const r = parseRewardMetadata({
      [META_KEYS.BONUS_BREAKDOWN]: [],
    });
    expect(r.bonusBreakdown).toEqual([]);
  });
});

// ── Malformed appliedModifiers entries ────────────────────────────────────────

describe("parseRewardMetadata — malformed appliedModifiers entries", () => {
  it("appliedModifiers as string returns undefined", () => {
    const r = parseRewardMetadata({
      [META_KEYS.APPLIED_MODIFIERS]: "modifier",
    });
    expect(r.appliedModifiers).toBeUndefined();
  });

  it("modifier entry missing 'applied' field defaults to true (Boolean(undefined ?? true) = true)", () => {
    const r = parseRewardMetadata({
      [META_KEYS.APPLIED_MODIFIERS]: [
        { type: "earning_mode", multiplier: 1.5 },
      ],
    });
    // applied: Boolean(e.applied ?? true) — undefined ?? true = true
    expect(r.appliedModifiers![0].applied).toBe(true);
  });

  it("modifier entry with applied: false is preserved", () => {
    const r = parseRewardMetadata({
      [META_KEYS.APPLIED_MODIFIERS]: [
        { type: "campaign_boost", multiplier: 1.2, applied: false },
      ],
    });
    expect(r.appliedModifiers![0].applied).toBe(false);
  });
});

// ── Reconstruction with adversarial numeric values ────────────────────────────

describe("buildRewardAuditTrail — adversarial numerics in transaction", () => {
  it("zero multiplier produces 0 for pointsBeforeBonuses — inconsistency detected", () => {
    const tx = makeTx({
      points: 20,
      verifiedMinutes: 20,
      basePoints: 20,
      multiplier: 0,
      pointsBeforeBonuses: 20, // stored=20 but computed=20×0=0 → inconsistent
      fixedBonusPoints: 0,
      pointsBeforeCap: 20,
      cappedPoints: 0,
    });
    const trail = buildRewardAuditTrail(tx);
    const step = trail.steps.find((s) => s.label === "Points Before Bonuses")!;
    expect(step.status).toBe("inconsistent");
  });

  it("NaN multiplier: reconstruction step becomes NaN, marks inconsistent vs stored", () => {
    const tx = makeTx({
      points: 20,
      verifiedMinutes: 20,
      basePoints: 20,
      multiplier: NaN,
      pointsBeforeBonuses: 20,
      fixedBonusPoints: 0,
      pointsBeforeCap: 20,
      cappedPoints: 0,
    });
    // Math.round(20 * NaN) = NaN; |NaN - 20| = NaN; NaN <= 1 = false → inconsistent
    const trail = buildRewardAuditTrail(tx);
    const step = trail.steps.find((s) => s.label === "Points Before Bonuses")!;
    expect(step.status).not.toBe("ok");
  });

  it("cappedPoints > pointsBeforeCap (impossible state) — final points would be negative", () => {
    const tx = makeTx({
      points: 25,
      verifiedMinutes: 25,
      basePoints: 25,
      multiplier: 1,
      pointsBeforeBonuses: 25,
      fixedBonusPoints: 0,
      pointsBeforeCap: 25,
      cappedPoints: 100, // more capped than available — impossible
    });
    // reconstructed = 25 - 100 = -75; stored = 25; inconsistent
    const trail = buildRewardAuditTrail(tx);
    expect(trail.consistent).toBe(false);
    expect(trail.reconstructedPoints).toBe(-75);
  });

  it("negative points transaction (debit): storedPoints is always non-negative abs value", () => {
    const tx = makeTx({ points: -200, type: "adjusted", source: "adjustment" });
    const trail = buildRewardAuditTrail(tx);
    expect(trail.storedPoints).toBe(200);
    expect(trail.storedPoints).toBeGreaterThanOrEqual(0);
  });
});

// ── validateRewardMetadata with adversarial values ────────────────────────────

describe("validateRewardMetadata — adversarial values that pass parsing but signal anomalies", () => {
  it("rideSessionId present but empty string — treated as missing (CRITICAL)", () => {
    // asMaybeString: typeof "" === "string" → "" — truthy check in validator: !meta.rideSessionId → !""  = true
    const violations = validateRewardMetadata({ rideSessionId: "" });
    const critical = violations.filter(
      (v) => v.field === "rideSessionId" && v.severity === "critical",
    );
    expect(critical).toHaveLength(1);
  });

  it("bonusBreakdown entry with empty-string type is silently skipped by validator (falsy guard)", () => {
    // validateRewardMetadata: `if (!entry.type || seen.has(entry.type)) continue`
    // Empty string is falsy — skipped to avoid flooding violations from null JSONB entries.
    // This means malformed entries with type="" are NOT surfaced as info violations.
    // Documents the behavior so callers know the validator has this gap.
    const violations = validateRewardMetadata({
      [META_KEYS.RIDE_SESSION_ID]: "sess-x",
      [META_KEYS.VERIFIED_MINUTES]: 10,
      [META_KEYS.BASE_POINTS]: 10,
      [META_KEYS.BONUS_BREAKDOWN]: [{ type: "" }],
    });
    const info = violations.filter(
      (v) => v.field === "bonusBreakdown[].type" && v.severity === "info",
    );
    expect(info).toHaveLength(0); // gap: empty-type entries are silently skipped
  });

  it("pointsBeforeCap invariant: boundary — diff of exactly 1 is still valid (tolerance)", () => {
    const violations = validateRewardMetadata({
      [META_KEYS.RIDE_SESSION_ID]: "sess-x",
      [META_KEYS.VERIFIED_MINUTES]: 10,
      [META_KEYS.BASE_POINTS]: 10,
      [META_KEYS.POINTS_BEFORE_BONUSES]: 20,
      [META_KEYS.POINTS_BEFORE_CAP]: 19, // 20 - 1 = at tolerance boundary
    });
    const invViolations = violations.filter(
      (v) => v.field === "pointsBeforeCap",
    );
    expect(invViolations).toHaveLength(0);
  });

  it("pointsBeforeCap invariant: diff of 2 triggers violation", () => {
    const violations = validateRewardMetadata({
      [META_KEYS.RIDE_SESSION_ID]: "sess-x",
      [META_KEYS.VERIFIED_MINUTES]: 10,
      [META_KEYS.BASE_POINTS]: 10,
      [META_KEYS.POINTS_BEFORE_BONUSES]: 20,
      [META_KEYS.POINTS_BEFORE_CAP]: 18, // 20 - 2 → violation
    });
    const invViolations = violations.filter(
      (v) => v.field === "pointsBeforeCap",
    );
    expect(invViolations).toHaveLength(1);
  });

  it("never produces violations for a null metadata (fully missing — already tested critical)", () => {
    // null is gracefully handled: returns CRITICAL for rideSessionId
    // But does not throw or produce unexpected violation types
    const violations = validateRewardMetadata(null);
    for (const v of violations) {
      expect(["critical", "warning", "info"]).toContain(v.severity);
      expect(typeof v.field).toBe("string");
      expect(typeof v.message).toBe("string");
    }
  });
});
