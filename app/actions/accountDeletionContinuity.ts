"use server";
import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
export async function executeAccountDeletionContinuity(proposalId: string, sourceId: string, kind: "community_transfer" | "community_cancel" | "organisation_detach") {
  try {
    const actor = await requireCapability("privacy.deletion.operations.review", { mutation: true });
    const valid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!valid(proposalId) || !valid(sourceId) || !["community_transfer", "community_cancel", "organisation_detach"].includes(kind)) return { success: false as const, error: "Invalid continuity operation" };
    const result = await createSupabaseAdminClient().rpc("execute_account_deletion_continuity", { p_proposal: proposalId, p_actor: actor.authUser.id, p_kind: kind, p_source: sourceId });
    if (result.error || result.data?.state !== "confirmed") return { success: false as const, error: "Approved continuity and independent proof required" };
    return { success: true as const };
  } catch { return { success: false as const, error: "Continuity unavailable or unauthorized" }; }
}
export async function executeAccountDeletionBusinessContinuity(proposalId: string, sourceId: string, kind: "advertiser_transfer" | "export_stop", successorId?: string) {
  try {
    const actor = await requireCapability("privacy.deletion.operations.review", { mutation: true });
    const valid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!valid(proposalId) || !valid(sourceId) || !["advertiser_transfer", "export_stop"].includes(kind) || (kind === "advertiser_transfer" && (!successorId || !valid(successorId)))) return { success: false as const, error: "Invalid reviewed business disposition" };
    const result = kind === "advertiser_transfer"
      ? await createSupabaseAdminClient().rpc("execute_account_deletion_advertiser_transfer", { p_proposal: proposalId, p_actor: actor.authUser.id, p_advertiser: sourceId, p_successor: successorId })
      : await createSupabaseAdminClient().rpc("execute_account_deletion_export_stop", { p_proposal: proposalId, p_actor: actor.authUser.id, p_export: sourceId });
    if (result.error || result.data?.state !== "confirmed") return { success: false as const, error: "Independent consent and approved policy required" };
    return { success: true as const };
  } catch { return { success: false as const, error: "Business continuity unavailable or unauthorized" }; }
}
