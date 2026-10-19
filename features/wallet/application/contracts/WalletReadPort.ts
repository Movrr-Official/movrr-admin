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

/** Read-only wallet projection. Financial writes are owned by the existing SQL kernel. */
export type LedgerRepository = {
  getBalance: (riderId: string) => Promise<number>;
  listEntries: (riderId: string) => Promise<LedgerEntry[]>;
};
