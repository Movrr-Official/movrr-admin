import { z } from "zod";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { shopRpc } from "@/features/fulfilment/infrastructure/shopLifecycleApi";
import { fail } from "@/lib/result/ApplicationResult";
import { createSupabaseRateLimitStore } from "@/features/fraud/infrastructure/supabaseRateLimitStore";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return platformRoute({ request, capability: "fulfilment.read", authDeps: productionAuthDeps, handle: async ctx => {
    const after = new URL(request.url).searchParams.get("after");
    if (after && !z.string().uuid().safeParse(after).success) return fail("validation", "Invalid cursor");
    return shopRpc("shop_exception_cases", { p_actor: ctx.principal.userId, p_org: ctx.principal.type === "organisation" ? ctx.principal.organisationId : null, p_after: after, p_limit: 50 });
  } });
}
const command = z.object({ id: z.string().uuid(), kind: z.enum(["recovery", "delivery"]), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(1000) }).strict();
export async function POST(request: Request) {
  return platformRoute({ request, capability: "fulfilment.cancel", authDeps: productionAuthDeps, handle: async ctx => {
    const parsed = command.safeParse(await request.json().catch(() => null));
    const operation = z.string().uuid().safeParse(request.headers.get("Idempotency-Key"));
    if (!parsed.success || !operation.success) return fail("validation", "Case, current revision, reason and operation required");
    const limiter = createSupabaseRateLimitStore({ max: 60, windowMs: 60_000, requireAtomic: true });
    if (!await limiter.hit(`shop.case:${ctx.principal.userId}`)) return fail("rate_limited", "Please retry shortly using the same operation");
    return shopRpc("shop_retry_case", { p_actor: ctx.principal.userId, p_id: parsed.data.id, p_kind: parsed.data.kind, p_version: parsed.data.expectedVersion, p_reason: parsed.data.reason, p_operation: operation.data });
  } });
}
