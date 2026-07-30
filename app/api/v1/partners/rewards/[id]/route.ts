import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { updatePartnerCatalogItem } from "@/features/rewards/application/partnerCatalogCommands";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return platformRoute({
    request,
    capability: "rewards.manage",
    authDeps: productionAuthDeps,
    handle: (ctx) =>
      updatePartnerCatalogItem(ctx, id, {
        title: typeof body.title === "string" ? body.title : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        pointsCost: body.pointsCost !== undefined ? Number(body.pointsCost) : undefined,
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
