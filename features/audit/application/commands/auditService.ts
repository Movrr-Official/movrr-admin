import { randomUUID } from "crypto";
import type {
  AuditService,
  AuditStore,
} from "@/features/audit/application/contracts/AuditService";
import type {
  AuditRecord,
  AuditRecordInput,
} from "@/features/audit/domain/AuditRecord";
import { ok, type ApplicationResult } from "@/lib/result/ApplicationResult";

export function createAuditService(store: AuditStore): AuditService {
  return {
    async append(
      input: AuditRecordInput,
    ): Promise<ApplicationResult<AuditRecord>> {
      const record: AuditRecord = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      return ok(await store.insert(record));
    },
  };
}
