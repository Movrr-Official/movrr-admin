import type { ApplicationResult } from "@/lib/result/ApplicationResult";

export type DebitCommand = {
  riderId: string;
  points: number;
  redemptionId: string;
  correlationId: string;
};

export type RefundCommand = {
  riderId: string;
  points: number;
  fulfilmentId: string;
  reason: string;
  correlationId: string;
};

export type SettlementReceipt = {
  transactionId: string;
  riderId: string;
  points: number;
  balanceAfter: number;
  kind: "debit" | "refund";
};

/**
 * Wallet settlement public contract.
 * Fulfilment requests settlement; Wallet owns how it occurs.
 */
export type SettlementService = {
  debit: (
    input: DebitCommand,
  ) => Promise<ApplicationResult<SettlementReceipt>>;
  refund: (
    input: RefundCommand,
  ) => Promise<ApplicationResult<SettlementReceipt>>;
};

export type LedgerDirection = "debit" | "credit";

export type LedgerEntry = {
  id: string;
  riderId: string;
  /** Always a positive magnitude. */
  points: number;
  direction: LedgerDirection;
  referenceType: "redemption" | "fulfilment";
  referenceId: string;
  reason?: string;
  correlationId: string;
  createdAt: string;
};

export type LedgerDebitInput = {
  riderId: string;
  points: number;
  redemptionId: string;
  correlationId: string;
};

export type LedgerCreditInput = {
  riderId: string;
  points: number;
  fulfilmentId: string;
  reason: string;
  correlationId: string;
};

export type LedgerMutationResult = {
  transactionId: string;
  balanceAfter: number;
};

/**
 * Port for append-only wallet ledger + balance.
 * Production adapter wraps atomic SQL/RPC; tests use in-memory.
 */
export type LedgerRepository = {
  debit: (
    input: LedgerDebitInput,
  ) => Promise<ApplicationResult<LedgerMutationResult>>;
  credit: (
    input: LedgerCreditInput,
  ) => Promise<ApplicationResult<LedgerMutationResult>>;
  getBalance: (riderId: string) => Promise<number>;
  listEntries: (riderId: string) => Promise<LedgerEntry[]>;
};
