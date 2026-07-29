import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import { fail, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  DebitCommand,
  LedgerRepository,
  SettlementReceipt,
} from "@/features/wallet/application/contracts/SettlementService";

export type SettleDebitDeps = {
  ledger: LedgerRepository;
  eventBus: DomainEventBus;
};

export async function settleDebit(
  deps: SettleDebitDeps,
  input: DebitCommand,
): Promise<ApplicationResult<SettlementReceipt>> {
  if (!input.riderId) {
    return fail("validation_failed", "riderId is required");
  }
  if (!Number.isInteger(input.points) || input.points <= 0) {
    return fail("validation_failed", "points must be a positive integer");
  }
  if (!input.redemptionId) {
    return fail("validation_failed", "redemptionId is required");
  }
  if (!input.correlationId) {
    return fail("validation_failed", "correlationId is required");
  }

  const result = await deps.ledger.debit({
    riderId: input.riderId,
    points: input.points,
    redemptionId: input.redemptionId,
    correlationId: input.correlationId,
  });

  if (!result.ok) {
    return result;
  }

  deps.eventBus.enqueue({
    name: "WalletDebited",
    occurredAt: new Date().toISOString(),
    correlationId: input.correlationId,
    payload: {
      riderId: input.riderId,
      points: input.points,
      redemptionId: input.redemptionId,
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
      kind: "debit",
    },
  };
}
