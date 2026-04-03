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
  "campaign_ride",
  "bonus",
  "adjustment",
  "redemption",
]);

/**
 * Earning mode — maps to the mobile app's EarningMode.
 * standard_ride = Free Ride (always available, 1× multiplier)
 * ad_enhanced_ride = Campaign Ride (premium, ad-boosted)
 */
export const earningModeSchema = z.enum(["standard_ride", "ad_enhanced_ride"]);

/** Breakdown of a single bonus or modifier entry — mirrors mobile's RewardBonusEntry */
export const rewardBonusEntrySchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  multiplier: z.number().optional(),
  addedPoints: z.number().optional(),
});

export const rewardTransactionSchema = z.object({
  id: z.string(),
  riderId: z.string(),
  campaignId: z.string().optional(),
  routeId: z.string().optional(),
  /** Canonical ride session reference — preferred over routeId for non-campaign rides */
  rideSessionId: z.string().optional(),
  type: rewardTransactionTypeSchema,
  /** Earning source — standard_ride | ad_boost | campaign_ride | bonus | adjustment | redemption */
  source: rewardTransactionSourceSchema.or(z.string()).optional(),
  /** Earning mode at time of ride — standard_ride (Free Ride) or ad_enhanced_ride (Campaign Ride) */
  earningMode: earningModeSchema.optional(),
  points: z.number(),
  /** Ride verification status at time of transaction — sourced from ride_verification.status */
  verificationStatus: z.enum(["pending", "verified", "rejected", "manual_review"]).optional(),
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
export type RewardTransactionSource = z.infer<typeof rewardTransactionSourceSchema>;
export type EarningMode = z.infer<typeof earningModeSchema>;
export type RiderBalance = z.infer<typeof riderBalanceSchema>;
export type RewardBonusEntry = z.infer<typeof rewardBonusEntrySchema>;
