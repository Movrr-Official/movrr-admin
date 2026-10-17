"use server";

import { requireCapability } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Approval controls only. No deployment, claim, execution or amount parameters.
// The database binds the actor to this real user's JWT and checks AAL2/session.
type RecoveryCapability = "rides.settlement.recovery.request" | "rides.settlement.recovery.review";
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validText = (value: string, min: number, max: number) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
async function approvalRpc(capability: RecoveryCapability, name: string, args: Record<string, string>) {
  try {
    const actor = await requireCapability(capability, { mutation: true });
    const client = await createSupabaseServerClient();
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== "aal2") return { success: false as const, error: "MFA verification required" };
    // No service-role client and no caller-selected actor identity.
    const { data: identity, error: identityError } = await client.auth.getUser();
    if (identityError || identity.user?.id !== actor.authUser.id) return { success: false as const, error: "Authenticated identity changed" };
    const { data, error } = await client.rpc(name, args);
    if (error) return { success: false as const, error: "Recovery approval unavailable or evidence changed" };
    return { success: true as const, approvalId: name === "propose_held_ride_recovery" && typeof data === "string" && validId(data) ? data : undefined };
  } catch { return { success: false as const, error: "Recovery approval unavailable or unauthorized" }; }
}
export async function proposeHeldRideRecovery(reason: string, authorizationReference: string) {
  if (!validText(reason, 10, 500) || !validText(authorizationReference, 3, 200)) return { success: false as const, error: "Recovery reason and authorization reference required" };
  return approvalRpc("rides.settlement.recovery.request", "propose_held_ride_recovery", { p_reason: reason, p_authorization_reference: authorizationReference });
}
export async function approveHeldRideRecovery(approvalId: string, reviewReference: string) {
  if (!validId(approvalId) || !validText(reviewReference, 3, 200)) return { success: false as const, error: "Valid approval and independent review reference required" };
  return approvalRpc("rides.settlement.recovery.review", "approve_held_ride_recovery", { p_approval: approvalId, p_review_reference: reviewReference });
}
export async function revokeHeldRideRecovery(approvalId: string, reason: string) {
  if (!validId(approvalId) || !validText(reason, 10, 500)) return { success: false as const, error: "Valid approval and revocation reason required" };
  return approvalRpc("rides.settlement.recovery.review", "revoke_held_ride_recovery", { p_approval: approvalId, p_reason: reason });
}
