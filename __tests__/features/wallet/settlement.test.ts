import { describe, it, expect, vi } from "vitest";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { createInMemoryLedgerRepository } from "@/features/wallet/infrastructure/ledgerRepository";
import { createImmediateDebitCompensatingRefundStrategy } from "@/features/wallet/application/strategies/ImmediateDebitCompensatingRefundStrategy";

describe("SettlementService — ImmediateDebitCompensatingRefundStrategy", () => {
  it("debit reduces balance and appends a ledger entry", async () => {
    const ledger = createInMemoryLedgerRepository();
    await ledger.seedBalance("rider-1", 100);
    const bus = new DomainEventBus();
    const settlement = createImmediateDebitCompensatingRefundStrategy({
      ledger,
      eventBus: bus,
    });

    const result = await settlement.debit({
      riderId: "rider-1",
      points: 40,
      redemptionId: "red-1",
      correlationId: "corr-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.balanceAfter).toBe(60);
    expect(result.value.transactionId).toBeTruthy();
    expect(await ledger.getBalance("rider-1")).toBe(60);

    const entries = await ledger.listEntries("rider-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.direction).toBe("debit");
    expect(entries[0]?.points).toBe(40);
    expect(entries[0]?.referenceId).toBe("red-1");
  });

  it("refund credits without deleting the prior debit row", async () => {
    const ledger = createInMemoryLedgerRepository();
    await ledger.seedBalance("rider-1", 100);
    const bus = new DomainEventBus();
    const settlement = createImmediateDebitCompensatingRefundStrategy({
      ledger,
      eventBus: bus,
    });

    const debit = await settlement.debit({
      riderId: "rider-1",
      points: 50,
      redemptionId: "red-2",
      correlationId: "corr-2",
    });
    expect(debit.ok).toBe(true);
    if (!debit.ok) return;
    const debitTxnId = debit.value.transactionId;

    const refund = await settlement.refund({
      riderId: "rider-1",
      points: 50,
      fulfilmentId: "ful-1",
      reason: "fulfilment_failed",
      correlationId: "corr-2b",
    });

    expect(refund.ok).toBe(true);
    if (!refund.ok) return;
    expect(refund.value.balanceAfter).toBe(100);
    expect(refund.value.transactionId).not.toBe(debitTxnId);

    const entries = await ledger.listEntries("rider-1");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe(debitTxnId);
    expect(entries[0]?.direction).toBe("debit");
    expect(entries[1]?.direction).toBe("credit");
    expect(entries[1]?.referenceId).toBe("ful-1");
    expect(await ledger.getBalance("rider-1")).toBe(100);
  });

  it("overdraft returns BusinessFailure and leaves ledger unchanged", async () => {
    const ledger = createInMemoryLedgerRepository();
    await ledger.seedBalance("rider-1", 30);
    const bus = new DomainEventBus();
    const settlement = createImmediateDebitCompensatingRefundStrategy({
      ledger,
      eventBus: bus,
    });

    const result = await settlement.debit({
      riderId: "rider-1",
      points: 50,
      redemptionId: "red-3",
      correlationId: "corr-3",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("BusinessFailure");
    expect(await ledger.getBalance("rider-1")).toBe(30);
    expect(await ledger.listEntries("rider-1")).toHaveLength(0);
  });

  it("protects concurrent debits from overdraft", async () => {
    const ledger = createInMemoryLedgerRepository();
    await ledger.seedBalance("rider-1", 100);
    const bus = new DomainEventBus();
    const settlement = createImmediateDebitCompensatingRefundStrategy({
      ledger,
      eventBus: bus,
    });

    const [a, b] = await Promise.all([
      settlement.debit({
        riderId: "rider-1",
        points: 100,
        redemptionId: "red-a",
        correlationId: "corr-a",
      }),
      settlement.debit({
        riderId: "rider-1",
        points: 100,
        redemptionId: "red-b",
        correlationId: "corr-b",
      }),
    ]);

    const outcomes = [a, b];
    const successes = outcomes.filter((r) => r.ok);
    const failures = outcomes.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (!failures[0] || failures[0].ok) return;
    expect(failures[0].kind).toBe("BusinessFailure");

    expect(await ledger.getBalance("rider-1")).toBe(0);
    expect(await ledger.listEntries("rider-1")).toHaveLength(1);
  });

  it("enqueues WalletDebited / WalletRefunded without flushing", async () => {
    const ledger = createInMemoryLedgerRepository();
    await ledger.seedBalance("rider-1", 80);
    const bus = new DomainEventBus();
    const debitSpy = vi.fn();
    const refundSpy = vi.fn();
    bus.subscribe("WalletDebited", debitSpy);
    bus.subscribe("WalletRefunded", refundSpy);

    const settlement = createImmediateDebitCompensatingRefundStrategy({
      ledger,
      eventBus: bus,
    });

    const debit = await settlement.debit({
      riderId: "rider-1",
      points: 20,
      redemptionId: "red-evt",
      correlationId: "corr-evt",
    });
    expect(debit.ok).toBe(true);
    expect(debitSpy).not.toHaveBeenCalled();

    const refund = await settlement.refund({
      riderId: "rider-1",
      points: 20,
      fulfilmentId: "ful-evt",
      reason: "cancelled",
      correlationId: "corr-evt-2",
    });
    expect(refund.ok).toBe(true);
    expect(refundSpy).not.toHaveBeenCalled();

    await bus.flushAfterCommit();
    expect(debitSpy).toHaveBeenCalledTimes(1);
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(debitSpy.mock.calls[0]?.[0]?.name).toBe("WalletDebited");
    expect(refundSpy.mock.calls[0]?.[0]?.name).toBe("WalletRefunded");
  });
});
