/**
 * Server-side SoD enforcement helpers.
 * Looks up entity initiator from admin_audit_log when created_by is unavailable.
 */

import "server-only";

import {
  assertSameActorSod,
  type SodWorkflowId,
} from "@/features/authorization/sod";
import type { createSupabaseAdminClient } from "@/lib/supabase-admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function recordEntityInitiator(
  supabase: AdminClient,
  input: {
    adminId: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("admin_audit_log").insert({
    admin_id: input.adminId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
  });
}

export async function resolveEntityInitiator(
  supabase: AdminClient,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("admin_audit_log")
    .select("admin_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return typeof data?.admin_id === "string" ? data.admin_id : null;
}

/**
 * Enforce same-actor SoD for an approval workflow.
 * Returns an error message when blocked; null when allowed.
 */
export async function enforceApprovalSod(input: {
  supabase: AdminClient;
  workflowId: SodWorkflowId;
  entityType: string;
  entityId: string;
  approverUserId: string;
}): Promise<string | null> {
  const initiatorUserId = await resolveEntityInitiator(
    input.supabase,
    input.entityType,
    input.entityId,
  );

  const result = assertSameActorSod({
    workflowId: input.workflowId,
    initiatorUserId,
    approverUserId: input.approverUserId,
  });

  if (!result.ok) return result.reason;
  return null;
}
