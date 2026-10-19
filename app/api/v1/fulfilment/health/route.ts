import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { ok } from "@/lib/result/ApplicationResult";
import { shopRpc } from "@/features/fulfilment/infrastructure/shopLifecycleApi";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return platformRoute({ request, capability: "fulfilment.read", authDeps: productionAuthDeps,
    handle: async ctx => {
      const health = await shopRpc("shop_health", { p_actor: ctx.principal.userId, p_org: ctx.principal.type === "organisation" ? ctx.principal.organisationId : null });
      if (!health.ok || ctx.principal.type !== "admin") return health;
      const scheduler = await shopRpc("shop_scheduler_health", { p_actor: ctx.principal.userId });
      return scheduler.ok ? ok({ ...health.value, scheduler: scheduler.value }) : scheduler;
    } });
}
