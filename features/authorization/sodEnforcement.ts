/**
 * Server-side SoD enforcement helpers.
 * Looks up entity initiator from admin_audit_log when created_by is unavailable.
 */

import "server-only";
import { randomUUID } from "node:crypto";

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
  const { error } = await supabase.from("platform_audit_record").insert({
    actor_user_id: input.adminId,
    principal_type: "admin",
    target_entity_type: input.entityType,
    target_entity_id: input.entityId,
    resulting_state: { ...input.metadata, action: input.action },
    correlation_id: randomUUID(),
    reason: "entity_initiator",
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Creation audit failed: ${error.message}`);
}

export async function resolveEntityInitiator(
  supabase: AdminClient,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("platform_audit_record")
    .select("actor_user_id")
    .eq("target_entity_type", entityType)
    .eq("target_entity_id", entityId)
    .eq("reason", "entity_initiator")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Creation audit unavailable: ${error.message}`);
  return typeof data?.actor_user_id === "string" ? data.actor_user_id : null;
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
