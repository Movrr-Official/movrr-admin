import type {
  AuditRecord,
  AuditRecordInput,
} from "@/features/audit/domain/AuditRecord";
import type { AuditStore } from "@/features/audit/application/contracts/AuditService";
import { fail, type ApplicationResult } from "@/lib/result/ApplicationResult";

/** In-memory append-only audit store for unit tests. */
export function createInMemoryAuditStore(): AuditStore {
  const records: AuditRecord[] = [];

  return {
    async insert(record: AuditRecord): Promise<AuditRecord> {
      records.push(record);
      return record;
    },

    async list(): Promise<AuditRecord[]> {
      return [...records];
    },

    async update(
      _id: string,
      _patch: Partial<AuditRecordInput>,
    ): Promise<ApplicationResult<never>> {
      return fail(
        "immutable_audit",
        "Audit records are append-only and cannot be updated",
      );
    },
  };
}
