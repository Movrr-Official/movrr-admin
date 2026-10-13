"use server";

import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const REVIEW_CAPABILITIES = {
  finance: "privacy.deletion.finance.review",
  operations: "privacy.deletion.operations.review",
  compliance: "privacy.deletion.compliance.review",
  recovery: "privacy.deletion.recovery",
} as const;
export type DeletionReviewCategory = keyof typeof REVIEW_CAPABILITIES;
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function getAccountDeletionCampaignReport(requestId: string, campaignId: string) {
  try {
    const actor = await requireCapability("privacy.deletion.compliance.review");
    if (!validId(requestId) || !validId(campaignId)) return { success: false as const, error: "Invalid campaign review" };
    const result = await createSupabaseAdminClient().rpc("account_deletion_campaign_review", { p_job: requestId, p_campaign: campaignId, p_actor: actor.authUser.id });
    const data = result.data;
    if (result.error || data?.contractVersion !== 1 || !["confirmed", "review"].includes(data.state)) return { success: false as const, error: "Campaign review unavailable" };
    // Rebuild the DTO; never forward an unexpected evidence/identity field.
    const fields = ["total_impressions", "verified_impressions", "impressions_earned", "total_distance_km", "total_points_awarded"];
    const totals: Record<string, number> = {};
    if (data.state === "confirmed") for (const field of fields) {
      if (typeof data.totals?.[field] !== "number" || !Number.isFinite(data.totals[field])) return { success: false as const, error: "Campaign review unavailable" };
      totals[field] = data.totals[field];
    }
    return { success: true as const, data: { state: data.state as "confirmed" | "review", totals } };
  } catch { return { success: false as const, error: "Campaign review unavailable or unauthorized" }; }
}
function reviewCapability(category: DeletionReviewCategory) {
  if (!Object.prototype.hasOwnProperty.call(REVIEW_CAPABILITIES, category)) throw new Error("Invalid review category");
  return REVIEW_CAPABILITIES[category];
}

export async function getAccountDeletionReview(requestId: string, category: DeletionReviewCategory) {
  try {
    const actor = await requireCapability(reviewCapability(category));
    if (!validId(requestId)) return { success: false as const, error: "Invalid request" };
    const result = await createSupabaseAdminClient().rpc("account_deletion_review_cases", {
      p_job_id: requestId, p_actor: actor.authUser.id, p_category: category,
    });
    if (result.error) return { success: false as const, error: "Review unavailable" };
    return { success: true as const, data: result.data };
  } catch { return { success: false as const, error: "Review unavailable or unauthorized" }; }
}

export async function proposeAccountDeletionReview(requestId: string, category: DeletionReviewCategory, action: string, reference: string) {
  try {
    const actor = await requireCapability(reviewCapability(category), { mutation: true });
    if (!validId(requestId) || !/^[a-zA-Z0-9:/._# -]{1,200}$/.test(reference))
      return { success: false as const, error: "Use a request ID and an internal approval reference" };
    const result = await createSupabaseAdminClient().rpc("propose_account_deletion_review", {
      p_job_id: requestId, p_actor: actor.authUser.id, p_category: category, p_action: action, p_reference: reference,
    });
    if (result.error) return { success: false as const, error: "Proposal unavailable or policy restricted" };
    return { success: true as const };
  } catch { return { success: false as const, error: "Proposal unavailable or unauthorized" }; }
}

export async function reviewAccountDeletionProposal(proposalId: string, category: DeletionReviewCategory, decision: "approved" | "rejected") {
  try {
    const actor = await requireCapability(reviewCapability(category), { mutation: true });
    if (!validId(proposalId) || !["approved", "rejected"].includes(decision))
      return { success: false as const, error: "Invalid proposal decision" };
    const result = await createSupabaseAdminClient().rpc("review_account_deletion_proposal", {
      p_proposal: proposalId, p_actor: actor.authUser.id, p_category: category, p_decision: decision,
    });
    if (result.error) return { success: false as const, error: "Independent review required or proposal unavailable" };
    return { success: true as const };
  } catch { return { success: false as const, error: "Review unavailable or unauthorized" }; }
}

/** Resolves only a confirmed disposition with independent, policy-approved review. */
export async function resolveAccountDeletionCase(caseId: string, proposalId: string, category: DeletionReviewCategory, operationKey: string) {
  try {
    const actor = await requireCapability(reviewCapability(category), { mutation: true });
    if (!validId(caseId) || !validId(proposalId) || !validId(operationKey))
      return { success: false as const, error: "Invalid case resolution" };
    const result = await createSupabaseAdminClient().rpc("resolve_account_deletion_case", {
      p_case: caseId, p_proposal: proposalId, p_actor: actor.authUser.id, p_category: category, p_operation: operationKey,
    });
    if (result.error || result.data?.state !== "resolved") return { success: false as const, error: "Confirmed disposition and independent approval required" };
    return { success: true as const };
  } catch { return { success: false as const, error: "Resolution unavailable or unauthorized" }; }
}

/** Metadata only. Backend allowlist excludes rider IDs, contact data and credentials. */
export async function getAccountDeletionMonitor() {
  try {
    const actor = await requireCapability("privacy.deletion.monitor");
    const result = await createSupabaseAdminClient().rpc("account_deletion_monitor", {
      p_actor_user_id: actor.authUser.id,
    });
    if (result.error) return { success: false as const, error: "Deletion contract unavailable" };
    return { success: true as const, data: result.data };
  } catch {
    return { success: false as const, error: "Deletion monitoring unavailable or unauthorized" };
  }
}

/** Incident escalation only; cannot reset leases or approve dispositions. */
export async function escalateAccountDeletion(requestId: string) {
  try {
    const actor = await requireCapability("privacy.deletion.escalate", { mutation: true });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
      return { success: false as const, error: "Invalid request" };
    const result = await createSupabaseAdminClient().rpc("escalate_account_deletion", {
      p_job_id: requestId, p_actor_user_id: actor.authUser.id,
    });
    if (result.error || result.data !== true)
      return { success: false as const, error: "Escalation unavailable" };
    return { success: true as const };
  } catch {
    return { success: false as const, error: "Escalation unavailable or unauthorized" };
  }
}
