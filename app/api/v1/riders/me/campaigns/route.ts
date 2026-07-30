import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import {
  confirmCampaignParticipation,
  listRiderCampaigns,
  optInToCampaign,
  withdrawCampaignSignup,
} from "@/features/riders/application/riderCampaignService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return platformRoute({
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: (ctx) => listRiderCampaigns(ctx),
  });
}
