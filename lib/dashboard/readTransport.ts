import type { getUsers } from "@/app/actions/users";
import type { getRiders } from "@/app/actions/riders";
import type { getCampaigns } from "@/app/actions/campaigns";
import type { getRoutes } from "@/app/actions/routes";
import type { getRewardStats } from "@/app/actions/rewards";
import type { getDistanceStats, getRideSessions } from "@/app/actions/rideSessions";
import type { getSessionAnalytics } from "@/app/actions/sessionAnalytics";
import type { getDashboardCounts } from "@/app/actions/count";
import type { getCurrentAdminUser } from "@/app/actions/admin";
import type { getAdminSettings } from "@/app/actions/settings";
import type { getOpenIncidentCount } from "@/app/actions/incidents";
import type { getAccountDeletionMonitor } from "@/app/actions/accountDeletion";
import type { getDeletionIntakeControl } from "@/app/actions/accountDeletionIntake";
import type { AdminSettingsValues } from "@/schemas/settings";

type Readers = {
  counts: typeof getDashboardCounts;
  adminUser: typeof getCurrentAdminUser;
  settings: typeof getAdminSettings;
  openIncidents: typeof getOpenIncidentCount;
  deletionMonitor: typeof getAccountDeletionMonitor;
  deletionIntake: typeof getDeletionIntakeControl;
  maintenance: () => Promise<Pick<AdminSettingsValues["general"], "maintenanceMode" | "maintenanceScope" | "maintenanceMessage" | "appVersion">>;
  users: typeof getUsers;
  riders: typeof getRiders;
  campaigns: typeof getCampaigns;
  routes: typeof getRoutes;
  rewardStats: typeof getRewardStats;
  distanceStats: typeof getDistanceStats;
  rideSessions: typeof getRideSessions;
  sessionAnalytics: typeof getSessionAnalytics;
};

/** Read-only dashboard queries use GET so independent sections are not queued
 * behind the browser's Server Action mutation dispatcher. Never persist data. */
export async function dashboardRead<K extends keyof Readers>(
  resource: K,
  ...args: Parameters<Readers[K]>
): Promise<Awaited<ReturnType<Readers[K]>>> {
  const query = new URLSearchParams({ args: JSON.stringify(args) });
  const response = await fetch(`/api/dashboard/reads/${resource}?${query}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Dashboard data unavailable. Refresh and retry.");
  return response.json();
}
