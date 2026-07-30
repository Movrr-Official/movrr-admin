/**
 * Canonical platform vocabulary — single source of truth for status labels and enums.
 * Mirror read-only constants in movrr-app and movrr-mobile for chip/display parity.
 */

export const CAMPAIGN_LIFECYCLE_STATUSES = [
  "draft",
  "open_for_signup",
  "selection_in_progress",
  "confirmed",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;

export type CampaignLifecycleStatus = (typeof CAMPAIGN_LIFECYCLE_STATUSES)[number];

export const CAMPAIGN_TYPES = ["destination_ride", "swarm"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const REWARD_REDEMPTION_STATES = [
  "requested",
  "approved",
  "issued",
  "fulfilled",
  "cancelled",
  "rejected",
] as const;

export type RewardRedemptionState = (typeof REWARD_REDEMPTION_STATES)[number];

export const RIDER_FULFILMENT_PROGRESS = [
  "preparing",
  "ready",
  "awaiting_collection",
  "completed",
  "unavailable",
] as const;

export type RiderFulfilmentProgress = (typeof RIDER_FULFILMENT_PROGRESS)[number];

export const FULFILMENT_OUTCOMES = [
  "success",
  "cancelled",
  "failed",
  "expired",
  "refunded",
  "reversed",
] as const;

export type FulfilmentOutcome = (typeof FULFILMENT_OUTCOMES)[number];

/** Unified billing connection vocabulary across admin + product web. */
export const BILLING_CONNECTION_STATES = [
  "not_connected",
  "handoff",
  "connected",
  "degraded",
] as const;

export type BillingConnectionState = (typeof BILLING_CONNECTION_STATES)[number];

export const USER_STATUSES = ["active", "inactive", "suspended", "pending"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const RIDE_SESSION_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
  "rejected",
] as const;

export type RideSessionStatus = (typeof RIDE_SESSION_STATUSES)[number];

export const RIDE_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "manual_review",
] as const;

export type RideVerificationStatus = (typeof RIDE_VERIFICATION_STATUSES)[number];

export const COMMUNITY_RIDE_STATUSES = [
  "upcoming",
  "active",
  "completed",
  "cancelled",
] as const;

export type CommunityRideStatus = (typeof COMMUNITY_RIDE_STATUSES)[number];

export const CAMPAIGN_LIFECYCLE_LABELS: Record<CampaignLifecycleStatus, string> = {
  draft: "Draft",
  open_for_signup: "Open for signup",
  selection_in_progress: "Selection in progress",
  confirmed: "Confirmed",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const BILLING_CONNECTION_LABELS: Record<BillingConnectionState, string> = {
  not_connected: "Not connected",
  handoff: "Portal handoff",
  connected: "Connected",
  degraded: "Degraded",
};

export function campaignLifecycleLabel(status: CampaignLifecycleStatus): string {
  return CAMPAIGN_LIFECYCLE_LABELS[status] ?? status;
}

export function billingConnectionLabel(state: BillingConnectionState): string {
  return BILLING_CONNECTION_LABELS[state] ?? state;
}
