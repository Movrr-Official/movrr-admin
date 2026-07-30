import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { withdrawCampaignSignup } from "@/features/riders/application/riderCampaignService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const campaignId = String(body.campaignId ?? "");
  return platformRoute({
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: (ctx) => withdrawCampaignSignup(ctx, campaignId),
  });
}
