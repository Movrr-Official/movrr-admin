import { z } from "zod";

export const rewardTransactionTypeSchema = z.enum([
  "awarded",
  "redeemed",
  "adjusted",
]);

/**
 * Earning source — mirrors the mobile app's RewardTransactionSource.
 * Using z.string() rather than a strict enum so the schema stays valid
 * even if the DB adds new source values before this schema is updated.
 */
export const rewardTransactionSourceSchema = z.enum([
  "standard_ride",
  "ad_boost",
  "boosted_ride",
  "bonus",
  // Suggested-route compliance bonus — written by mobile when a rider completes
  // a standard-mode suggested route above the compliance threshold.
  "standard_ride_bonus",
  "adjustment",
  "redemption",
]);

/**
 * Earning mode — maps to the mobile app's EarningMode.
 * standard_ride = Standard Ride (always available, 1× multiplier)
 * ad_enhanced_ride = Boosted Ride (premium, ad-boosted)
 */
export const earningModeSchema = z.enum(["standard_ride", "ad_enhanced_ride"]);

/** Breakdown of a single bonus or modifier entry — mirrors mobile's RewardBonusEntry */
export const rewardBonusEntrySchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  multiplier: z.number().optional(),
  points: z.number().optional(),
});

/** A single applied multiplier — mirrors mobile's RewardModifier */
export const appliedModifierSchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  multiplier: z.number().optional(),
  applied: z.boolean(),
});

export const rewardTransactionSchema = z.object({
  id: z.string(),
  riderId: z.string(),
  campaignId: z.string().optional(),
  routeId: z.string().optional(),
  /** Canonical ride session reference — preferred over routeId for non-boosted rides */
  rideSessionId: z.string().optional(),
  type: rewardTransactionTypeSchema,
  /** Earning source — standard_ride | ad_boost | boosted_ride | bonus | adjustment | redemption */
  source: rewardTransactionSourceSchema.or(z.string()).optional(),
  /** Earning mode at time of ride — standard_ride (Standard Ride) or ad_enhanced_ride (Boosted Ride) */
  earningMode: earningModeSchema.optional(),
  points: z.number(),
  /** Ride verification status at time of transaction — sourced from ride_verification.status */
  verificationStatus: z
    .enum(["pending", "verified", "rejected", "manual_review"])
    .optional(),
  description: z.string().optional(),
  balanceAfter: z.number(),
  createdAt: z.string().datetime(),
  createdBy: z.string().optional(), // Admin who created adjustment
  // --- Bonus + cap detail sourced from metadata ---
  /** Base points before multipliers */
  basePoints: z.number().optional(),
  /** Combined earning multiplier applied */
  multiplier: z.number().optional(),
  /** Campaign boost multiplier, if applicable */
  campaignBoostMultiplier: z.number().optional(),
  /** Whether the daily cap was hit for this transaction */
  wasCapped: z.boolean().optional(),
  /** Verified ride minutes that produced this transaction */
  verifiedMinutes: z.number().optional(),
  /** Itemised bonus entries */
  bonusBreakdown: z.array(rewardBonusEntrySchema).optional(),
  // ── Payout audit chain — full calculation trace from metadata ──────────────
  /** basePoints × totalMultiplier before flat bonuses are added */
  pointsBeforeBonuses: z.number().optional(),
  /** Sum of all flat-point bonus entries */
  fixedBonusPoints: z.number().optional(),
  /** pointsBeforeBonuses + fixedBonusPoints, before cap enforcement */
  pointsBeforeCap: z.number().optional(),
  /** Points removed by the per-ride or daily/weekly cap (0 when not capped) */
  cappedPoints: z.number().optional(),
  /** Full multiplier chain — one entry per modifier applied during calculation */
  appliedModifiers: z.array(appliedModifierSchema).optional(),
});

export const riderBalanceSchema = z.object({
  riderId: z.string(),
  riderName: z.string(),
  riderEmail: z.string(),
  totalPointsAwarded: z.number(),
  totalPointsRedeemed: z.number(),
  currentBalance: z.number(),
  lastTransactionDate: z.string().datetime().optional(),
});

export type RewardTransaction = z.infer<typeof rewardTransactionSchema>;
export type RewardTransactionType = z.infer<typeof rewardTransactionTypeSchema>;
export type RewardTransactionSource = z.infer<
  typeof rewardTransactionSourceSchema
>;
export type EarningMode = z.infer<typeof earningModeSchema>;
export type RiderBalance = z.infer<typeof riderBalanceSchema>;
export type RewardBonusEntry = z.infer<typeof rewardBonusEntrySchema>;
export type AppliedModifier = z.infer<typeof appliedModifierSchema>;
