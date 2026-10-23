import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { shopRpc } from "@/features/fulfilment/infrastructure/shopLifecycleApi";
import { fail } from "@/lib/result/ApplicationResult";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{id: string}> }) {
  const {id}=await context.params;
  return platformRoute({request,capability:"fulfilment.refund",authDeps:productionAuthDeps,handle:async(ctx,req)=>{
    if(ctx.principal.type!=="admin")return fail("permission_denied","Historical refunds require explicit staff reconciliation");
    const body=z.object({debitId:z.string().uuid(),expectedStatus:z.enum(["requested","approved","cancelled"]),expectedPoints:z.number().int().positive(),expectedRefunded:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(1000)}).strict().safeParse(await req.json().catch(()=>null));
    const operation=z.string().trim().min(1).max(200).safeParse(req.headers.get("Idempotency-Key"));
    if(!z.string().uuid().safeParse(id).success||!body.success||!operation.success)return fail("validation","Verified debit, amount, status, reason and operation required");
    return shopRpc("shop_reconcile_legacy_refund",{p_actor:ctx.principal.userId,p_id:id,p_debit:body.data.debitId,p_expected_status:body.data.expectedStatus,p_expected_points:body.data.expectedPoints,p_expected_refunded:body.data.expectedRefunded,p_operation:operation.data,p_reason:body.data.reason,p_correlation:ctx.correlationId});
  }});
}
