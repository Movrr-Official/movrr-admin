export const FULFILMENT_OUTCOMES = [
  "success",
  "cancelled",
  "failed",
  "expired",
  "refunded",
  "reversed",
] as const;

export type FulfilmentOutcome = (typeof FULFILMENT_OUTCOMES)[number];
