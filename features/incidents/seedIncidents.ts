import type { Incident } from "./types";

/** Seed incidents used when no persisted store exists yet. */
export const SEED_INCIDENTS: Incident[] = [
  {
    id: "inc-001",
    title: "Elevated ride verification rejections",
    description:
      "Manual review queue grew after GPS quality threshold change in Amsterdam region.",
    severity: "medium",
    status: "investigating",
    createdAt: "2026-07-28T09:15:00.000Z",
    updatedAt: "2026-07-29T14:22:00.000Z",
    createdBy: "ops@movrr.nl",
  },
  {
    id: "inc-002",
    title: "Fulfilment retry backlog",
    description:
      "Partner webhook latency caused repeated retry attempts on redemption inc-8842.",
    severity: "low",
    status: "open",
    createdAt: "2026-07-30T07:40:00.000Z",
    updatedAt: "2026-07-30T07:40:00.000Z",
    createdBy: "ops@movrr.nl",
  },
];
