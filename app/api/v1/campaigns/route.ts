import { NextResponse } from "next/server";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import {
  createCampaignForPrincipal,
  listCampaignsForPrincipal,
} from "@/features/campaigns/application/campaignPlatformService";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  return platformRoute({
    request,
    capability: "campaigns.read",
    authDeps: productionAuthDeps,
    handle: (ctx) => listCampaignsForPrincipal(ctx),
  });
}

export async function POST(request: Request) {
  return platformRoute({
    request,
    capability: "campaigns.write",
    authDeps: productionAuthDeps,
    handle: async (ctx, req) => {
      const body = await readJsonBody(req);
      return createCampaignForPrincipal(ctx, {
        name: String(body.name ?? ""),
        description: typeof body.description === "string" ? body.description : undefined,
        budget: Number(body.budget ?? 0),
        startDate: String(body.startDate ?? ""),
        endDate: String(body.endDate ?? ""),
        routeIds: Array.isArray(body.routeIds)
          ? body.routeIds.filter((id): id is string => typeof id === "string")
          : undefined,
        campaignType:
          body.campaignType === "swarm" || body.campaignType === "destination_ride"
            ? body.campaignType
            : undefined,
        targetZones: Array.isArray(body.targetZones)
          ? body.targetZones.filter((z): z is string => typeof z === "string")
          : undefined,
        vehicleTypeRequired:
          body.vehicleTypeRequired === "bike" ||
          body.vehicleTypeRequired === "e-bike" ||
          body.vehicleTypeRequired === "cargo-bike"
            ? body.vehicleTypeRequired
            : undefined,
        deliveryMode:
          body.deliveryMode === "manual" || body.deliveryMode === "automated"
            ? body.deliveryMode
            : undefined,
        impressionGoal:
          body.impressionGoal !== undefined ? Number(body.impressionGoal) : undefined,
        advertiserId:
          typeof body.advertiserId === "string" ? body.advertiserId : undefined,
      });
    },
  });
}
