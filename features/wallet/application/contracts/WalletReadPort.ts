export type LedgerEntry = {
  id: string;
  riderId: string;
  /** Signed committed points, exactly as recorded in the ledger. */
  points: number;
  source: string;
  category:
    | "campaign"
    | "route"
    | "adjustment"
    | "redemption"
    | "refund"
    | "other";
  description: string;
  createdAt: string;
};
export type WalletBalance = {
  financialTotals?: import("@/lib/contracts/rideRewardLifecycle").WalletFinancialTotals;
  riderId: string;
  pointsBalance: number;
  lifetimePointsEarned: number;
  transactionCount: number;
  asOf: string;
};
export type LedgerPage = {
  entries: LedgerEntry[];
  nextCursor: string | null;
  asOf: string;
};
export type LedgerPageInput = {
  cursor?: string;
  asOf?: string;
  limit?: number;
};
export type LedgerRepository = {
  getBalance: (riderId: string) => Promise<WalletBalance>;
  listEntries: (
    riderId: string,
    input?: LedgerPageInput,
  ) => Promise<LedgerPage>;
};
