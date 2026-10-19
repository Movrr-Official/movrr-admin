import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { shopRpc } from "@/features/fulfilment/infrastructure/shopLifecycleApi";
import { fail } from "@/lib/result/ApplicationResult";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{id: string}> }) {
  const { id } = await context.params;
  return platformRoute({ request, capability: "fulfilment.cancel", authDeps: productionAuthDeps, handle: async (ctx, req) => {
    if (ctx.principal.type !== "admin") return fail("permission_denied", "Historical reservations require staff review");
    const body = z.object({ expectedStatus: z.enum(["requested", "approved"]), reason: z.string().trim().min(1).max(1000) }).safeParse(await req.json().catch(() => null));
    const key = req.headers.get("Idempotency-Key");
    if (!z.string().uuid().safeParse(id).success || !body.success || !key || key.length>200) return fail("validation", "Reservation, status, reason and operation required");
    return shopRpc("shop_cancel_legacy_reservation", { p_actor: ctx.principal.userId, p_id: id, p_expected_status: body.data.expectedStatus, p_operation: key, p_reason: body.data.reason, p_correlation: ctx.correlationId });
  }});
}
