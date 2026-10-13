"use server";

import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Signed suppression artifact contains keyed hashes, never raw aliases or keys. */
export async function exportAccountDeletionSuppression(requestId: string) {
  try {
    const actor = await requireCapability("privacy.deletion.recovery");
    if (!validId(requestId)) return { success: false as const, error: "Invalid request" };
    const result = await createSupabaseAdminClient().rpc("export_account_deletion_suppression_manifest", {
      p_job: requestId, p_actor: actor.authUser.id,
    });
    if (result.error) return { success: false as const, error: "Suppression export requires approved completion and hold review" };
    return { success: true as const, data: result.data };
  } catch { return { success: false as const, error: "Recovery unavailable or unauthorized" }; }
}

/** Independent proposal review and signature verification remain authoritative SQL. */
export async function importAccountDeletionSuppression(requestId: string, proposalId: string, artifact: unknown) {
  try {
    const actor = await requireCapability("privacy.deletion.recovery", { mutation: true });
    if (!validId(requestId) || !validId(proposalId) || !artifact || typeof artifact !== "object")
      return { success: false as const, error: "Invalid recovery artifact" };
    const value = artifact as { manifest?: unknown; signature?: unknown };
    if (typeof value.signature !== "string" || !/^[0-9a-f]{64}$/.test(value.signature) ||
        !value.manifest || typeof value.manifest !== "object" || JSON.stringify(value.manifest).length > 4_000_000)
      return { success: false as const, error: "Invalid recovery artifact" };
    const result = await createSupabaseAdminClient().rpc("import_account_deletion_suppression_manifest", {
      p_job: requestId, p_proposal: proposalId, p_actor: actor.authUser.id,
      p_manifest: value.manifest, p_signature: value.signature,
    });
    if (result.error || result.data?.state !== "confirmed")
      return { success: false as const, error: "Trusted artifact, approved policy and independent recovery review required" };
    return { success: true as const };
  } catch { return { success: false as const, error: "Recovery unavailable or unauthorized" }; }
}

/** Restrict a genuinely restored subject using signed erasure evidence. */
export async function prepareAccountDeletionRestoreRecovery(userId: string, artifact: unknown) {
  try {
    const actor = await requireCapability("privacy.deletion.recovery", { mutation: true });
    if (!validId(userId) || !artifact || typeof artifact !== "object") return { success: false as const, error: "Invalid recovery artifact" };
    const value = artifact as { manifest?: unknown; signature?: unknown };
    if (typeof value.signature !== "string" || !/^[0-9a-f]{64}$/.test(value.signature) ||
        !value.manifest || typeof value.manifest !== "object" || JSON.stringify(value.manifest).length > 4_000_000)
      return { success: false as const, error: "Invalid recovery artifact" };
    const result = await createSupabaseAdminClient().rpc("prepare_account_deletion_restore_recovery", {
      p_user: userId, p_actor: actor.authUser.id, p_manifest: value.manifest, p_signature: value.signature,
    });
    if (result.error || result.data?.state !== "quarantined" || !validId(result.data?.requestId ?? ""))
      return { success: false as const, error: "Trusted restored principal and approved recovery policy required" };
    return { success: true as const, data: { state: "quarantined" as const, requestId: result.data.requestId as string } };
  } catch { return { success: false as const, error: "Recovery unavailable or unauthorized" }; }
}

/** Existing worker obtains its own claim; operators receive no destructive token. */
export async function startAccountDeletionRestoreRecovery(requestId: string, proposalId: string) {
  return reviewedRestoreOperation("start_account_deletion_restore_recovery", requestId, proposalId, "queued");
}

export async function verifyAccountDeletionRestoreQuarantine(requestId: string) {
  return reviewedRestoreOperation("verify_account_deletion_restore_quarantine", requestId, undefined, "verified");
}

/** Authorizes a separately controlled gateway release; SQL grants no access. */
export async function authorizeAccountDeletionRestoreReactivation(requestId: string, proposalId: string) {
  return reviewedRestoreOperation("authorize_account_deletion_restore_reactivation", requestId, proposalId, "authorized");
}

async function reviewedRestoreOperation(operation: string, requestId: string, proposalId: string | undefined, expectedState: string) {
  try {
    const actor = await requireCapability("privacy.deletion.recovery", { mutation: true });
    if (!validId(requestId) || (proposalId !== undefined && !validId(proposalId)))
      return { success: false as const, error: "Invalid recovery reference" };
    const result = await createSupabaseAdminClient().rpc(operation, {
      p_job: requestId, p_actor: actor.authUser.id, ...(proposalId === undefined ? {} : { p_proposal: proposalId }),
    });
    if (result.error || result.data?.state !== expectedState)
      return { success: false as const, error: "Independent review, active suppression and verified erasure required" };
    return { success: true as const, data: { state: expectedState, requestId } };
  } catch { return { success: false as const, error: "Recovery unavailable or unauthorized" }; }
}
