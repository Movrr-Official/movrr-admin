import type { FulfilmentState } from "./states";

export const RIDER_PROGRESS = [
  "preparing",
  "ready",
  "awaiting_collection",
  "completed",
  "unavailable",
] as const;

export type RiderProgress = (typeof RIDER_PROGRESS)[number];

/** Presentation-only mapping from operational state — not authoritative. */
export function deriveProgress(state: FulfilmentState): RiderProgress {
  switch (state) {
    case "created":
    case "reserved":
    case "processing":
      return "preparing";
    case "ready":
      return "ready";
    case "awaiting_collection":
    case "validated":
    case "collected":
    case "dispatched":
    case "delivered":
      return "awaiting_collection";
    case "completed":
      return "completed";
    case "cancelled":
    case "failed":
    case "expired":
    case "refunded":
    case "reversed":
      return "unavailable";
  }
}
