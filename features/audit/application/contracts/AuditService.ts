import type { ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  AuditRecord,
  AuditRecordInput,
} from "@/features/audit/domain/AuditRecord";

/**
 * First-class immutable audit capability.
 * Append-only — update/delete must not exist on the service surface.
 */
export type AuditService = {
  append: (input: AuditRecordInput) => Promise<ApplicationResult<AuditRecord>>;
};

export type AuditStore = {
  insert: (record: AuditRecord) => Promise<AuditRecord>;
  list: () => Promise<AuditRecord[]>;
  /** Must fail — audit rows are never editable. */
  update: (
    id: string,
    patch: Partial<AuditRecordInput>,
  ) => Promise<ApplicationResult<never>>;
};
