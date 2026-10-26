import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createResendTransactionalEmailPort } from "@/features/notifications/infrastructure/resendTransactionalEmailPort";
import { REWARD_EMAIL_KINDS, type RewardEmailKind } from "@/features/notifications/application/contracts/TransactionalEmailPort";

/** Database locks/receipts own retries. A worker never repeats a financial effect. */
export async function runShopRecovery() {
  const startedAt = Date.now();
  const db = createSupabaseAdminClient();
  const { data: recovery, error } = await db.rpc("shop_recover", { p_limit: 50 });
  if (error) throw new Error("Shop recovery unavailable");
  const { data: intents, error: claimError } = await db.rpc("shop_claim_outbox", { p_limit: 50 });
  if (claimError) throw new Error("Shop notification queue unavailable");
  let delivered = 0;
  let failed = 0;
  for (const intent of intents ?? []) {
    if (Date.now() - startedAt > 40_000) break; // Unprocessed leases expire safely.
    let deliveryError: { code?: string } | null = null;
    try {
      if (intent.kind === "email") {
        const payload = intent.payload;
        const kind: RewardEmailKind = payload.state === "awaiting_collection" ? "ready" : payload.state;
        if (!REWARD_EMAIL_KINDS.includes(kind)) throw new Error("Unknown reward notification state");
        {
          await createResendTransactionalEmailPort().sendRewardLifecycle({ kind, idempotencyKey: `shop:${intent.id}`,
            occurredAt: payload.occurredAt, correlationId: payload.correlationId, riderId: payload.riderId,
            fulfilmentId: intent.fulfilment_id, redemptionId: payload.redemptionId,
            catalogItemId: payload.catalogItemId, pointsSpent: payload.pointsSpent, reason: payload.reason });
        }
        ({ error: deliveryError } = await db.rpc("shop_ack_email", { p_id: intent.id, p_lease: intent.lease_token }));
      } else ({ error: deliveryError } = await db.rpc("shop_deliver_notification", { p_id: intent.id, p_lease: intent.lease_token }));
    } catch { deliveryError = { code: "email_delivery_failed" }; }
    if (!deliveryError) { delivered++; continue; }
    failed++;
    const { error: retryError } = await db.rpc("shop_retry_outbox", { p_id: intent.id, p_lease: intent.lease_token, p_error: deliveryError.code || "delivery_failed" });
    if (retryError) throw new Error("Shop outbox retry persistence failed");
  }
  // Reuse the existing Edge sender and scheduler. Inbox delivery is distinct
  // from provider acceptance and from confirmed device delivery.
  const {data:pushDue,error:pushError}=await db.rpc("shop_pending_push");
  if(pushError)throw new Error("Push delivery queue unavailable");
  let pushDispatchFailures=0;
  const {error:receiptError}=await db.functions.invoke("send-push-notifications",{body:{type:"RECEIPTS",table:"notifications"}});
  if(receiptError)pushDispatchFailures++;
  for(const notification of pushDue ?? []) {
    if(Date.now()-startedAt>45_000)break;
    const {data,error}=await db.functions.invoke("send-push-notifications",{body:{type:"INSERT",table:"notifications",schema:"public",record:{id:notification.id},old_record:null}});
    if(error || data?.failed > 0 || data?.unknown > 0)pushDispatchFailures++;
  }
  const {data:pushHealth,error:healthError}=await db.rpc("notification_push_health");
  if(healthError || !pushHealth)throw new Error("Push health unavailable");
  const result = { ...recovery, delivered, notificationFailures: failed, pushDispatchFailures, pushHealth };
  const { error: heartbeatError } = await db.rpc("shop_finish_recovery", { p_result: result });
  if (heartbeatError) throw new Error("Shop worker outcome persistence failed");
  return result;
}
