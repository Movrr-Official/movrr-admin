import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { RequestContext } from "@/features/identity/domain/Principal";

export type PlatformAuditWriteInput = {
  ctx: RequestContext;
  capability: string;
  targetEntityType: string;
  targetEntityId: string;
  reason?: string | null;
  previousState?: Record<string, unknown> | null;
  resultingState?: Record<string, unknown> | null;
};

/**
 * Append-only write to platform_audit_record (041). Best-effort — never throws
 * into the command path; failures are logged via thrown Error only when insert fails
 * and callers choose to await without catch. Prefer fire-and-forget with catch.
 */
export async function appendPlatformAuditRecord(
  input: PlatformAuditWriteInput,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const principal = input.ctx.principal;
  const { error } = await supabase.from("platform_audit_record").insert({
    actor_user_id: principal.userId,
    actor_email: principal.email ?? null,
    principal_type: principal.type,
    capability: input.capability,
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId,
    previous_state: input.previousState ?? null,
    resulting_state: input.resultingState ?? null,
    correlation_id: input.ctx.correlationId,
    reason: input.reason ?? null,
  });
  if (error) {
    throw new Error(`platform_audit_record.insert: ${error.message}`);
  }
}

export async function appendPlatformAuditRecordSafe(
  input: PlatformAuditWriteInput,
): Promise<void> {
  try {
    await appendPlatformAuditRecord(input);
  } catch {
    // Audit must not break command success; durable path is best-effort.
  }
}
