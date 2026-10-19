import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { updatePartnerCatalogItem } from "@/features/rewards/application/partnerCatalogCommands";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  return platformRoute({ request, capability: "rewards.manage", authDeps: productionAuthDeps, handle: ctx => updatePartnerCatalogItem(ctx, id, body) });
}
