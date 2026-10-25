import { getProductionPlatformApi, productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { platformRoute } from "@/lib/http/platformRoute";
import { createPartnerCatalogItem, readPartnerCatalogRequest } from "@/features/rewards/application/partnerCatalogCommands";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return (await getProductionPlatformApi()).partners.rewards(request);
}
export async function POST(request: Request) {
  return platformRoute({ request, capability: "rewards.manage", authDeps: productionAuthDeps, handle: async ctx => { const { body, media } = await readPartnerCatalogRequest(request); return createPartnerCatalogItem(ctx, body, media); } });
}
