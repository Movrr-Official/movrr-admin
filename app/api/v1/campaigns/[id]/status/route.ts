import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { updateCampaignStatusForPrincipal } from "@/features/campaigns/application/campaignPlatformService";
import type { CampaignLifecycleStatus } from "@/features/platform/vocabulary";
import { CAMPAIGN_LIFECYCLE_STATUSES } from "@/features/platform/vocabulary";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = String(body.status ?? "");
  const capability =
    status === "active" || status === "open_for_signup"
      ? "campaigns.launch"
      : status === "paused"
        ? "campaigns.pause"
        : "campaigns.write";

  if (!CAMPAIGN_LIFECYCLE_STATUSES.includes(status as CampaignLifecycleStatus)) {
    return platformRoute({
      request,
      capability: "campaigns.write",
      authDeps: productionAuthDeps,
      handle: async () => ({
        ok: false as const,
        kind: "validation" as const,
        message: "Invalid campaign status",
      }),
    });
  }

  return platformRoute({
    request,
    capability,
    authDeps: productionAuthDeps,
    handle: (ctx) =>
      updateCampaignStatusForPrincipal(ctx, id, status as CampaignLifecycleStatus),
  });
}
