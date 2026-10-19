import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { shopRpc } from "@/features/fulfilment/infrastructure/shopLifecycleApi";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return platformRoute({ request, capability: "fulfilment.read", authDeps: productionAuthDeps,
    handle: ctx => shopRpc("shop_health", { p_actor: ctx.principal.userId,
      p_org: ctx.principal.type === "organisation" ? ctx.principal.organisationId : null }) });
}
