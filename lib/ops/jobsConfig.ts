export type OpsJobDefinition = {
  id: string;
  name: string;
  path: string;
  schedule: string;
  scheduleLabel: string;
  provider: "qstash" | "vercel-cron";
  description: string;
};

export const OPS_JOB_DEFINITIONS: OpsJobDefinition[] = [
  {
    id: "fulfilment-expire",
    name: "Fulfilment expire",
    path: "/api/v1/internal/jobs/fulfilment-expire",
    schedule: "*/15 * * * *",
    scheduleLabel: "Every 15 minutes (UTC)",
    provider: "qstash",
    description: "Expires stale fulfilment reservations and tokens.",
  },
  {
    id: "fulfilment-release",
    name: "Fulfilment release",
    path: "/api/v1/internal/jobs/fulfilment-release",
    schedule: "*/15 * * * *",
    scheduleLabel: "Every 15 minutes (UTC)",
    provider: "qstash",
    description: "Releases held inventory back to partner pools.",
  },
  {
    id: "fulfilment-retry",
    name: "Fulfilment retry",
    path: "/api/v1/internal/jobs/fulfilment-retry",
    schedule: "*/30 * * * *",
    scheduleLabel: "Every 30 minutes (UTC)",
    provider: "qstash",
    description: "Retries failed partner fulfilment callbacks.",
  },
  {
    id: "privacy-retention",
    name: "Privacy retention",
    path: "/api/internal/privacy-retention",
    schedule: "0 3 * * *",
    scheduleLabel: "Daily at 03:00 UTC",
    provider: "vercel-cron",
    description: "Applies data retention policies for waitlist and audit data.",
  },
];
