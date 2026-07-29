import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import { fail, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  LedgerRepository,
  RefundCommand,
  SettlementReceipt,
} from "@/features/wallet/application/contracts/SettlementService";

export type SettleRefundDeps = {
  ledger: LedgerRepository;
  eventBus: DomainEventBus;
};

export async function settleRefund(
  deps: SettleRefundDeps,
  input: RefundCommand,
): Promise<ApplicationResult<SettlementReceipt>> {
  if (!input.riderId) {
    return fail("validation_failed", "riderId is required");
  }
  if (!Number.isInteger(input.points) || input.points <= 0) {
    return fail("validation_failed", "points must be a positive integer");
  }
  if (!input.fulfilmentId) {
    return fail("validation_failed", "fulfilmentId is required");
  }
  if (!input.reason) {
    return fail("validation_failed", "reason is required");
  }
  if (!input.correlationId) {
    return fail("validation_failed", "correlationId is required");
  }

  const result = await deps.ledger.credit({
    riderId: input.riderId,
    points: input.points,
    fulfilmentId: input.fulfilmentId,
    reason: input.reason,
    correlationId: input.correlationId,
  });

  if (!result.ok) {
    return result;
  }

  deps.eventBus.enqueue({
    name: "WalletRefunded",
    occurredAt: new Date().toISOString(),
    correlationId: input.correlationId,
    payload: {
      riderId: input.riderId,
      points: input.points,
      fulfilmentId: input.fulfilmentId,
      reason: input.reason,
      transactionId: result.value.transactionId,
      balanceAfter: result.value.balanceAfter,
    },
  });

  return {
    ok: true,
    value: {
      transactionId: result.value.transactionId,
      riderId: input.riderId,
      points: input.points,
      balanceAfter: result.value.balanceAfter,
      kind: "refund",
    },
  };
}
