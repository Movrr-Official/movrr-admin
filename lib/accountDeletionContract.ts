/** Presentation contract v1. Byte-identical in movrr-admin; policy logic lives in Supabase. */
export const ACCOUNT_DELETION_CONTRACT_VERSION = 1;
export const ACCOUNT_DELETION_STATUSES = [
  "accepted", "restricted", "obligations_review", "processing", "manual_review", "failed", "completed",
] as const;
export type AccountDeletionStatus = typeof ACCOUNT_DELETION_STATUSES[number];
export interface AccountDeletionReceipt {
  contractVersion: 1;
  policyVersion: number;
  requestId: string;
  status: AccountDeletionStatus;
}
export function isAccountDeletionReceipt(value: unknown): value is AccountDeletionReceipt {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AccountDeletionReceipt>;
  return row.contractVersion === 1 && Number.isInteger(row.policyVersion) &&
    (row.policyVersion ?? 0) > 0 && typeof row.requestId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.requestId) &&
    ACCOUNT_DELETION_STATUSES.includes(row.status as AccountDeletionStatus);
}
