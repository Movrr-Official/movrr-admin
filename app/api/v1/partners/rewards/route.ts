import { getProductionPlatformApi } from "@/features/platform/infrastructure/productionPlatformApi";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { createPartnerCatalogItem } from "@/features/rewards/application/partnerCatalogCommands";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const api = await getProductionPlatformApi();
  return api.partners.rewards(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return platformRoute({
    request,
    capability: "rewards.manage",
    authDeps: productionAuthDeps,
    handle: (ctx) =>
      createPartnerCatalogItem(ctx, {
        title: String(body.title ?? ""),
        description: typeof body.description === "string" ? body.description : undefined,
        pointsCost: Number(body.pointsCost ?? 0),
        status:
          body.status === "draft" ||
          body.status === "active" ||
          body.status === "paused" ||
          body.status === "archived"
            ? body.status
            : undefined,
        sku: typeof body.sku === "string" ? body.sku : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
        stockAvailable:
          body.stockAvailable !== undefined ? Number(body.stockAvailable) : undefined,
      }),
  });
}

