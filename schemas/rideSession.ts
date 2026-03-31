import { z } from "zod";

export const rideSessionEarningModeSchema = z.enum([
  "standard_ride",
  "ad_enhanced_ride",
]);

export const rideVerificationStatusSchema = z.enum([
  "pending",
  "verified",
  "rejected",
  "manual_review",
]);

export const rideSessionSchema = z.object({
  id: z.string(),
  riderId: z.string(),
  riderName: z.string().optional(),
  /** Earning mode — standard_ride (Free Ride) or ad_enhanced_ride (Campaign Ride) */
  earningMode: rideSessionEarningModeSchema,
  /** Campaign linked to this session, only present for ad_enhanced_ride */
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  /** Verified ride duration in minutes */
  verifiedMinutes: z.number().default(0),
  /** Points awarded for this session */
  pointsAwarded: z.number().default(0),
  /** Verification result */
  verificationStatus: rideVerificationStatusSchema,
  /** Array of reason codes from ride_verification */
  reasonCodes: z.array(z.string()).default([]),
  city: z.string().optional(),
  country: z.string().optional(),
  createdAt: z.string().datetime(),
});

export const rideSessionFiltersSchema = z.object({
  earningMode: z.enum(["all", "standard_ride", "ad_enhanced_ride"]).optional(),
  verificationStatus: z
    .enum(["all", "pending", "verified", "rejected", "manual_review"])
    .optional(),
  riderId: z.string().optional(),
  searchQuery: z.string().optional(),
});

export type RideSession = z.infer<typeof rideSessionSchema>;
export type RideSessionFilters = z.infer<typeof rideSessionFiltersSchema>;
export type RideVerificationStatus = z.infer<typeof rideVerificationStatusSchema>;
export type RideSessionEarningMode = z.infer<typeof rideSessionEarningModeSchema>;
