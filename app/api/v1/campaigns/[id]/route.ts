import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import {
  getCampaignById,
  updateCampaignForPrincipal,
} from "@/features/campaigns/application/campaignPlatformService";
import type { CampaignLifecycleStatus } from "@/features/platform/vocabulary";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return platformRoute({
    request,
    capability: "campaigns.read",
    authDeps: productionAuthDeps,
    handle: (ctx) => getCampaignById(ctx, id),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return platformRoute({
    request,
    capability: "campaigns.write",
    authDeps: productionAuthDeps,
    handle: async (ctx, req) => {
      const body = await readJsonBody(req);
      const status = body.status;
      return updateCampaignForPrincipal(ctx, {
        id,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        budget: body.budget !== undefined ? Number(body.budget) : undefined,
        startDate: typeof body.startDate === "string" ? body.startDate : undefined,
        endDate: typeof body.endDate === "string" ? body.endDate : undefined,
        campaignType:
          body.campaignType === "swarm" || body.campaignType === "destination_ride"
            ? body.campaignType
            : undefined,
        targetZones: Array.isArray(body.targetZones)
          ? body.targetZones.filter((z): z is string => typeof z === "string")
          : undefined,
        status:
          typeof status === "string"
            ? (status as CampaignLifecycleStatus)
            : undefined,
      });
    },
  });
}
