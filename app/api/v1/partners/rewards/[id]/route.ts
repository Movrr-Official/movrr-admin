import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { updatePartnerCatalogItem, readPartnerCatalogRequest } from "@/features/rewards/application/partnerCatalogCommands";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return platformRoute({ request, capability: "rewards.manage", authDeps: productionAuthDeps, handle: async ctx => { const { body, media } = await readPartnerCatalogRequest(request); return updatePartnerCatalogItem(ctx, id, body, media); } });
}
