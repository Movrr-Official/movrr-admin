import { z } from "zod";

export const rideSessionEarningModeSchema = z.enum([
  "standard_ride",
  "ad_enhanced_ride",
]);

/**
 * Ride session lifecycle status — mirrors mobile's RideSessionStatus.
 * This is distinct from verificationStatus (which reflects the verification pipeline result).
 *
 * draft      → session object created but ride not yet started
 * active     → ride currently in progress
 * paused     → rider temporarily halted the ride
 * completed  → rider ended the ride; eligible for verification
 * cancelled  → ride abandoned before completion; not verified
 * rejected   → ride submitted but failed pre-verification (distance/time gate)
 */
export const rideSessionStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
  "rejected",
]);

export const rideVerificationStatusSchema = z.enum([
  "pending",
  "verified",
  "rejected",
  "manual_review",
]);

export const bikeTypeSchema = z.enum([
  "standard_bike",
  "e_bike",
  "fat_bike",
  "unknown",
]);

export const rideSessionSchema = z.object({
  id: z.string(),
  riderId: z.string(),
  riderName: z.string().optional(),
  /**
   * Ride lifecycle status — mirrors mobile's RideSessionStatus.
   * Separate from verificationStatus: a session can be completed (lifecycle)
   * but still pending (verification).
   */
  status: rideSessionStatusSchema.optional(),
  /** Earning mode — standard_ride (Standard Ride) or ad_enhanced_ride (Boosted Ride) */
  earningMode: rideSessionEarningModeSchema,
  /** Campaign linked to this session, only present for ad_enhanced_ride */
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  /** Campaign route FK — present for boosted rides */
  routeId: z.string().optional(),
  routeName: z.string().optional(),
  /** Rider–route assignment FK — sourced from ride_session.rider_route_id */
  routeAssignmentId: z.string().optional(),
  /** Suggested route chosen by rider in Standard Ride mode */
  suggestedRouteId: z.string().optional(),
  /** Fraction [0–1] of suggested route waypoints covered by GPS path */
  complianceScore: z.number().min(0).max(1).optional(),
  /** Bonus points awarded for suggested-route compliance */
  bonusApplied: z.number().optional(),
  /** Multiplier applied for suggested-route compliance */
  multiplierApplied: z.number().optional(),
  startedAt: z.string().datetime(),
  /** Session end time — sourced from ride_session.completed_at */
  endedAt: z.string().datetime().optional(),
  /** Verified ride duration in minutes — sourced from reward_transactions.metadata.verifiedMinutes */
  verifiedMinutes: z.number().default(0),
  /** Points awarded for this session — sourced from reward_transactions (canonical ledger) */
  pointsAwarded: z.number().default(0),
  /**
   * Effective verification status — precedence: admin manual override > machine auto-verdict.
   * Reflects what the admin UI should act on.
   */
  verificationStatus: rideVerificationStatusSchema,
  /**
   * Source of verificationStatus:
   * "admin"   = admin manually approved/rejected/escalated via ride_verification table
   * "machine" = auto-computed by mobile at ride completion, from ride_session.verification_result
   * undefined = no verdict available yet
   */
  verificationSource: z.enum(["machine", "admin"]).optional(),
  /** Reason codes for the effective verificationStatus (from admin override or machine verdict) */
  reasonCodes: z.array(z.string()).default([]),
  /**
   * Raw machine-computed verdict from ride_session.verification_result JSONB.
   * Always reflects the mobile app's original auto-verdict — not affected by admin overrides.
   * Use this for audit, diagnostic, and reviewer-context purposes.
   */
  machineVerification: z
    .object({
      status: rideVerificationStatusSchema,
      qualityScore: z.number().optional(),
      reasonCodes: z.array(z.string()).optional(),
      detectedMaxSpeedKmh: z.number().optional(),
      maxAllowedSpeedKmh: z.number().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  /** Bike type used for this session — sourced from ride_session.bike_type */
  bikeType: bikeTypeSchema.optional(),
  /** GPS/motion quality score 0–100 — sourced from ride_session.ride_quality_percent */
  rideQualityPercent: z.number().min(0).max(100).optional(),
  /** Active moving time in minutes (excl. pauses) — sourced from ride_session.moving_time_ms ÷ 60 000 */
  movingTime: z.number().min(0).optional(),
  /** Total GPS-calculated distance in meters — sourced from route_tracking.total_distance */
  totalDistanceMeters: z.number().min(0).optional(),
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
export type RideSessionStatus = z.infer<typeof rideSessionStatusSchema>;
export type RideVerificationStatus = z.infer<
  typeof rideVerificationStatusSchema
>;
export type RideSessionEarningMode = z.infer<
  typeof rideSessionEarningModeSchema
>;
export type BikeType = z.infer<typeof bikeTypeSchema>;
