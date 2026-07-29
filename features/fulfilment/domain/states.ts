export const FULFILMENT_STATES = [
  "created",
  "reserved",
  "processing",
  "ready",
  "awaiting_collection",
  "collected",
  "dispatched",
  "delivered",
  "validated",
  "completed",
  "cancelled",
  "failed",
  "expired",
  "refunded",
  "reversed",
] as const;

export type FulfilmentState = (typeof FULFILMENT_STATES)[number];
