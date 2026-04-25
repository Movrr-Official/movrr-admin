/**
 * Cross-system contract layer — mobile app ↔ admin dashboard.
 *
 * Single source of truth for:
 *   - Supabase table names (reward/session domain)
 *   - reward_transactions.metadata key names written by mobile
 *   - Canonical enum values shared between mobile and admin
 *   - Typed metadata parser (reward_transactions.metadata)
 *   - Display label maps
 *
 * CONTRACT RULE: Any key name, table name, or enum value change requires a
 * coordinated mobile + admin deploy. Adding new keys is backwards-compatible;
 * renaming or removing is a breaking change.
 */

// ── Table name constants ──────────────────────────────────────────────────────

export const DB_TABLES = {
  REWARD_TRANSACTIONS: "reward_transactions",
  RIDE_SESSION: "ride_session",
  RIDE_VERIFICATION: "ride_verification",
  RIDER_REWARD_BALANCE: "rider_reward_balance",
  REWARD_REDEMPTIONS: "reward_redemptions",
} as const;

// ── Metadata key names ────────────────────────────────────────────────────────
// Keys written by the mobile app into reward_transactions.metadata (JSONB).
// All keys are camelCase — this is the mobile app's wire contract.

export const META_KEYS = {
  // Session linking
  RIDE_SESSION_ID: "rideSessionId",
  // Ride context
  EARNING_MODE: "earningMode",
  BIKE_TYPE: "bikeType",
  // Reward calculation chain (intermediate values for payout auditability)
  BASE_POINTS: "basePoints",
  MULTIPLIER: "multiplier",
  CAMPAIGN_BOOST_MULTIPLIER: "campaignBoostMultiplier",
  POINTS_BEFORE_BONUSES: "pointsBeforeBonuses",
  FIXED_BONUS_POINTS: "fixedBonusPoints",
  POINTS_BEFORE_CAP: "pointsBeforeCap",
  CAPPED_POINTS: "cappedPoints",
  WAS_CAPPED: "wasCapped",
  // Verification
  VERIFIED_MINUTES: "verifiedMinutes",
  // Breakdown arrays
  BONUS_BREAKDOWN: "bonusBreakdown",
  APPLIED_MODIFIERS: "appliedModifiers",
  // Adjustment / admin-written fields
  ADJUSTMENT_DIRECTION: "adjustment_direction",
  CREATED_BY: "created_by",
  DESCRIPTION: "description",
  // Audit trail
  REWARD_CONFIG_HASH: "rewardConfigHash",
} as const;

// ── Canonical enum values ─────────────────────────────────────────────────────
// These are the exact string values written to the database by the mobile app.
// Admin display layers must map FROM these — never invent new string literals.

/** reward_transactions.source values */
export const REWARD_SOURCE = {
  STANDARD_RIDE: "standard_ride",
  AD_BOOST: "ad_boost",
  BOOSTED_RIDE: "boosted_ride",
  BONUS: "bonus",
  STANDARD_RIDE_BONUS: "standard_ride_bonus",
  ADJUSTMENT: "adjustment",
  REDEMPTION: "redemption",
} as const;

/**
 * bonusBreakdown[].type values written by the mobile app.
 *
 * DRIFT HISTORY: Admin previously used "campaign_boost" and "quality_bonus"
 * which were never written by mobile. Mobile writes "boosted_ride_boost" and
 * "completion_quality_bonus" respectively. Legacy keys are kept in
 * BONUS_TYPE_LABELS for old DB records only — do not use them in new code.
 */
export const BONUS_TYPE = {
  STREAK_BONUS: "streak_bonus",
  PEAK_HOUR_BOOST: "peak_hour_boost",
  HOT_ZONE_BOOST: "hot_zone_boost",
  HIGH_DEMAND_ZONE_BOOST: "high_demand_zone_boost",
  SUGGESTED_ROUTE_BONUS: "suggested_route_bonus",
  COMPLETION_QUALITY_BONUS: "completion_quality_bonus",
  BOOSTED_RIDE_BOOST: "boosted_ride_boost",
  MANUAL_ADMIN_ADJUSTMENT: "manual_admin_adjustment",
} as const;

/** ride_verification.status and ride_session.verification_result.status */
export const VERIFICATION_STATUS = {
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
  MANUAL_REVIEW: "manual_review",
} as const;

/**
 * Reason codes written by mobile into ride_session.verification_result.reasonCodes[].
 * Kept as constants so admin UI can display structured messages per code.
 */
export const VERIFICATION_REASON_CODES = {
  INSUFFICIENT_LOCATION_POINTS: "insufficient_location_points",
  INSUFFICIENT_MOVING_TIME: "insufficient_moving_time",
  INSUFFICIENT_DISTANCE: "insufficient_distance",
  AVERAGE_SPEED_TOO_HIGH: "average_speed_too_high",
  PEAK_SPEED_TOO_HIGH: "peak_speed_too_high",
  GPS_TRACE_TOO_SPARSE: "gps_trace_too_sparse",
  NO_VERIFIED_MOVING_TIME: "no_verified_moving_time",
} as const;

// ── Typed metadata parser ─────────────────────────────────────────────────────

export interface ParsedBonusEntry {
  type: string;
  label: string | undefined;
  multiplier: number | undefined;
  points: number | undefined;
}

export interface ParsedAppliedModifier {
  type: string;
  label: string | undefined;
  multiplier: number | undefined;
  applied: boolean;
}

export interface ParsedRewardMetadata {
  // Session linking
  rideSessionId: string | undefined;
  // Ride context
  earningMode: string | undefined;
  bikeType: string | undefined;
  // Reward calculation chain
  basePoints: number | undefined;
  multiplier: number | undefined;
  campaignBoostMultiplier: number | undefined;
  pointsBeforeBonuses: number | undefined;
  fixedBonusPoints: number | undefined;
  pointsBeforeCap: number | undefined;
  cappedPoints: number | undefined;
  wasCapped: boolean | undefined;
  verifiedMinutes: number | undefined;
  // Breakdown arrays
  bonusBreakdown: ParsedBonusEntry[] | undefined;
  appliedModifiers: ParsedAppliedModifier[] | undefined;
  // Adjustment / admin fields
  adjustmentDirection: string | undefined;
  createdBy: string | undefined;
  description: string | undefined;
  // Audit
  rewardConfigHash: string | undefined;
}

/**
 * Safely parses reward_transactions.metadata (JSONB) into a typed struct.
 * Never throws — all fields are optional and default to undefined for missing
 * or malformed values.
 */
export function parseRewardMetadata(raw: unknown): ParsedRewardMetadata {
  const meta =
    raw != null && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};

  const rawBreakdown = meta[META_KEYS.BONUS_BREAKDOWN];
  const bonusBreakdown = Array.isArray(rawBreakdown)
    ? (rawBreakdown as unknown[]).map((entry) => {
        const e =
          entry != null && typeof entry === "object"
            ? (entry as Record<string, unknown>)
            : {};
        return {
          type: String(e.type ?? ""),
          label: e.label != null ? String(e.label) : undefined,
          multiplier: e.multiplier != null ? Number(e.multiplier) : undefined,
          points: e.points != null ? Number(e.points) : undefined,
        };
      })
    : undefined;

  const rawModifiers = meta[META_KEYS.APPLIED_MODIFIERS];
  const appliedModifiers = Array.isArray(rawModifiers)
    ? (rawModifiers as unknown[]).map((entry) => {
        const e =
          entry != null && typeof entry === "object"
            ? (entry as Record<string, unknown>)
            : {};
        return {
          type: String(e.type ?? ""),
          label: e.label != null ? String(e.label) : undefined,
          multiplier: e.multiplier != null ? Number(e.multiplier) : undefined,
          applied: Boolean(e.applied ?? true),
        };
      })
    : undefined;

  return {
    rideSessionId: asMaybeString(meta[META_KEYS.RIDE_SESSION_ID]),
    earningMode: asMaybeString(meta[META_KEYS.EARNING_MODE]),
    bikeType: asMaybeString(meta[META_KEYS.BIKE_TYPE]),
    basePoints: asMaybeNumber(meta[META_KEYS.BASE_POINTS]),
    multiplier: asMaybeNumber(meta[META_KEYS.MULTIPLIER]),
    campaignBoostMultiplier: asMaybeNumber(
      meta[META_KEYS.CAMPAIGN_BOOST_MULTIPLIER],
    ),
    pointsBeforeBonuses: asMaybeNumber(meta[META_KEYS.POINTS_BEFORE_BONUSES]),
    fixedBonusPoints: asMaybeNumber(meta[META_KEYS.FIXED_BONUS_POINTS]),
    pointsBeforeCap: asMaybeNumber(meta[META_KEYS.POINTS_BEFORE_CAP]),
    cappedPoints: asMaybeNumber(meta[META_KEYS.CAPPED_POINTS]),
    wasCapped:
      meta[META_KEYS.WAS_CAPPED] != null
        ? Boolean(meta[META_KEYS.WAS_CAPPED])
        : undefined,
    verifiedMinutes: asMaybeNumber(meta[META_KEYS.VERIFIED_MINUTES]),
    bonusBreakdown,
    appliedModifiers,
    adjustmentDirection: asMaybeString(meta[META_KEYS.ADJUSTMENT_DIRECTION]),
    createdBy: asMaybeString(meta[META_KEYS.CREATED_BY]),
    description: asMaybeString(meta[META_KEYS.DESCRIPTION]),
    rewardConfigHash: asMaybeString(meta[META_KEYS.REWARD_CONFIG_HASH]),
  };
}

function asMaybeString(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

function asMaybeNumber(val: unknown): number | undefined {
  return val != null ? Number(val) : undefined;
}

// ── Display label maps ────────────────────────────────────────────────────────

export const BONUS_TYPE_LABELS: Record<string, string> = {
  [BONUS_TYPE.STREAK_BONUS]: "Streak Bonus",
  [BONUS_TYPE.PEAK_HOUR_BOOST]: "Peak Hour Boost",
  [BONUS_TYPE.HOT_ZONE_BOOST]: "Hot Zone Boost",
  [BONUS_TYPE.HIGH_DEMAND_ZONE_BOOST]: "Hot Zone Boost",
  [BONUS_TYPE.SUGGESTED_ROUTE_BONUS]: "Route Compliance",
  [BONUS_TYPE.COMPLETION_QUALITY_BONUS]: "Quality Bonus",
  [BONUS_TYPE.BOOSTED_RIDE_BOOST]: "Campaign Boost",
  [BONUS_TYPE.MANUAL_ADMIN_ADJUSTMENT]: "Admin Adjustment",
  // Legacy keys retained for DB records written before contract alignment
  quality_bonus: "Quality Bonus",
  campaign_boost: "Campaign Boost",
};

export const REWARD_SOURCE_LABELS: Record<string, string> = {
  [REWARD_SOURCE.STANDARD_RIDE]: "Standard Ride",
  [REWARD_SOURCE.AD_BOOST]: "Ad Boost",
  [REWARD_SOURCE.BOOSTED_RIDE]: "Boosted Ride",
  [REWARD_SOURCE.BONUS]: "Bonus",
  [REWARD_SOURCE.STANDARD_RIDE_BONUS]: "Route Compliance Bonus",
  [REWARD_SOURCE.ADJUSTMENT]: "Adjustment",
  [REWARD_SOURCE.REDEMPTION]: "Redemption",
};

export const BIKE_TYPE_LABELS: Record<string, string> = {
  standard_bike: "Standard Bike",
  e_bike: "E-Bike",
  fat_bike: "Fat Bike",
  unknown: "Unknown",
};
