import { getProductionPlatformApi, productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { platformRoute } from "@/lib/http/platformRoute";
import { createPartnerCatalogItem } from "@/features/rewards/application/partnerCatalogCommands";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return (await getProductionPlatformApi()).partners.rewards(request);
}
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  return platformRoute({ request, capability: "rewards.manage", authDeps: productionAuthDeps, handle: ctx => createPartnerCatalogItem(ctx, body) });
}
