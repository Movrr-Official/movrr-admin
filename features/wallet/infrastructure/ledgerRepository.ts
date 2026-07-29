import { randomUUID } from "crypto";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  LedgerCreditInput,
  LedgerDebitInput,
  LedgerEntry,
  LedgerMutationResult,
  LedgerRepository,
} from "@/features/wallet/application/contracts/SettlementService";

type InMemoryLedger = LedgerRepository & {
  seedBalance: (riderId: string, points: number) => Promise<void>;
};

/**
 * In-memory append-only ledger for unit tests.
 * Serialises mutations per rider to model FOR UPDATE concurrency protection.
 */
export function createInMemoryLedgerRepository(): InMemoryLedger {
  const balances = new Map<string, number>();
  const entries: LedgerEntry[] = [];
  const riderQueues = new Map<string, Promise<void>>();

  async function withRiderLock<T>(
    riderId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = riderQueues.get(riderId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    riderQueues.set(
      riderId,
      previous.then(() => gate).catch(() => gate),
    );
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return {
    async seedBalance(riderId: string, points: number): Promise<void> {
      balances.set(riderId, points);
    },

    async getBalance(riderId: string): Promise<number> {
      return balances.get(riderId) ?? 0;
    },

    async listEntries(riderId: string): Promise<LedgerEntry[]> {
      return entries.filter((e) => e.riderId === riderId);
    },

    async debit(
      input: LedgerDebitInput,
    ): Promise<ApplicationResult<LedgerMutationResult>> {
      return withRiderLock(input.riderId, async () => {
        const balance = balances.get(input.riderId) ?? 0;
        if (balance < input.points) {
          return fail(
            "BusinessFailure",
            "Insufficient balance for debit",
          );
        }

        const entry: LedgerEntry = {
          id: randomUUID(),
          riderId: input.riderId,
          points: input.points,
          direction: "debit",
          referenceType: "redemption",
          referenceId: input.redemptionId,
          correlationId: input.correlationId,
          createdAt: new Date().toISOString(),
        };
        entries.push(entry);
        const balanceAfter = balance - input.points;
        balances.set(input.riderId, balanceAfter);
        return ok({ transactionId: entry.id, balanceAfter });
      });
    },

    async credit(
      input: LedgerCreditInput,
    ): Promise<ApplicationResult<LedgerMutationResult>> {
      return withRiderLock(input.riderId, async () => {
        const balance = balances.get(input.riderId) ?? 0;
        const entry: LedgerEntry = {
          id: randomUUID(),
          riderId: input.riderId,
          points: input.points,
          direction: "credit",
          referenceType: "fulfilment",
          referenceId: input.fulfilmentId,
          reason: input.reason,
          correlationId: input.correlationId,
          createdAt: new Date().toISOString(),
        };
        // Append-only: never mutate prior debit rows.
        entries.push(entry);
        const balanceAfter = balance + input.points;
        balances.set(input.riderId, balanceAfter);
        return ok({ transactionId: entry.id, balanceAfter });
      });
    },
  };
}
