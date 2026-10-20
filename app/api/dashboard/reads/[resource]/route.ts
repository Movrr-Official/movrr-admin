import { NextResponse } from "next/server";
import { z } from "zod";
import { getUsers } from "@/app/actions/users";
import { getRiders } from "@/app/actions/riders";
import { getCampaigns } from "@/app/actions/campaigns";
import { getRoutes } from "@/app/actions/routes";
import { getRewardStats } from "@/app/actions/rewards";
import { getDistanceStats, getRideSessions } from "@/app/actions/rideSessions";
import { getSessionAnalytics } from "@/app/actions/sessionAnalytics";
import { getDashboardCounts } from "@/app/actions/count";
import { getCurrentAdminUser } from "@/app/actions/admin";
import { getAdminSettings } from "@/app/actions/settings";
import { getOpenIncidentCount } from "@/app/actions/incidents";
import { getAccountDeletionMonitor } from "@/app/actions/accountDeletion";
import { getDeletionIntakeControl } from "@/app/actions/accountDeletionIntake";
import { requireCapability } from "@/lib/admin";
import { loadSettingsRows, mergeSettingsRows } from "@/lib/platformSettings";
import { userFiltersSchema, riderFiltersSchema, campaignFiltersSchema, rideSessionFiltersSchema } from "@/schemas";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const ids = z.array(z.string().uuid()).max(500).optional();
const dates = z.object({ from: z.date().optional(), to: z.date().optional() }).optional();

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  const raw = new URL(request.url).searchParams.get("args") ?? "[]";
  if (raw.length > 16384) return NextResponse.json({ error: "Invalid filters" }, { status: 400, headers });
  let args: unknown[];
  try {
    const parsed: unknown = JSON.parse(raw, (key, value) =>
      (key === "from" || key === "to") && typeof value === "string" ? new Date(value) : value,
    );
    args = z.array(z.unknown()).max(2).parse(parsed).map(value => value === null ? undefined : value);
  } catch {
    return NextResponse.json({ error: "Invalid filters" }, { status: 400, headers });
  }
  try {
    // These existing readers retain their capability, MFA, trusted-session and
    // suspension checks. No service-role data is accessed before those checks.
    let result: unknown;
    switch (resource) {
      case "counts": result = await getDashboardCounts(); break;
      case "adminUser": result = await getCurrentAdminUser(); break;
      case "settings": result = await getAdminSettings(); break;
      case "openIncidents": result = await getOpenIncidentCount(); break;
      case "deletionMonitor": result = await getAccountDeletionMonitor(); break;
      case "deletionIntake": result = await getDeletionIntakeControl(); break;
      case "maintenance": {
        // Same permission as settings; no audits, provider probes or metadata.
        await requireCapability("settings.manage");
        const { maintenanceMode, maintenanceScope, maintenanceMessage } = mergeSettingsRows(await loadSettingsRows()).general;
        result = { maintenanceMode, maintenanceScope, maintenanceMessage };
        break;
      }
      case "users": result = await getUsers(userFiltersSchema.optional().parse(args[0]), ids.parse(args[1])); break;
      case "riders": result = await getRiders(riderFiltersSchema.optional().parse(args[0])); break;
      case "campaigns": result = await getCampaigns(campaignFiltersSchema.optional().parse(args[0]), ids.parse(args[1])); break;
      case "routes": result = await getRoutes(); break;
      case "rewardStats": result = await getRewardStats(dates.parse(args[0])); break;
      case "distanceStats": result = await getDistanceStats(); break;
      case "rideSessions": result = await getRideSessions(rideSessionFiltersSchema.optional().parse(args[0])); break;
      case "sessionAnalytics": result = await getSessionAnalytics(z.number().int().min(1).max(366).optional().parse(args[0])); break;
      default: return NextResponse.json({ error: "Unknown dashboard read" }, { status: 404, headers });
    }
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid filters" : "Dashboard data unavailable" }, { status: error instanceof z.ZodError ? 400 : 503, headers });
  }
}
