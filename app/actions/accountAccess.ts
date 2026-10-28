"use server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Resend } from "resend";
import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CUSTOMER_APP_URL, FROM_EMAIL, RESEND_API_KEY, SUPPORT_EMAIL, ACCOUNT_ACCESS_RECOVERY_ENABLED } from "@/lib/env";
import { getPlatformOperationalPolicies, isInviteDomainAllowed } from "@/lib/platformSettings";
import AccountSetupEmail, { accountSetupText } from "@/emails/account-setup";
import type { AccountAccessState } from "@/features/identity/domain/accountAccess";

type Result<T> = { success: true; data: T } | { success: false; error: string };
function failure(error: unknown): { success: false; error: string } {
  unstable_rethrow(error);
  // Provider/Auth errors can include payloads or credentials: never serialize or log them.
  return { success: false, error: "Account access unavailable. Check your permissions, reload, and try again." };
}

export async function getAccountAccess(userId: string): Promise<Result<AccountAccessState>> {
  try {
    z.string().uuid().parse(userId);
    const actor = await requireCapability("users.read");
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("account_access_state", { p_actor: actor.authUser.id, p_user: userId });
    if (error || !data) return failure(error);
    const state = data as Omit<AccountAccessState, "memberships"> & { memberships: (AccountAccessState["memberships"][number] & { providerId?: string })[] };
    const provider = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
    const memberships = await Promise.all(state.memberships.map(async ({ providerId, ...membership }) => {
      if (provider && providerId && ["accepted", "delivered", "delivery_delayed"].includes(membership.deliveryState)) {
        try {
          const receipt = await provider.emails.get(providerId);
          const event = receipt.data?.last_event;
          if (!receipt.error && event && ["delivered", "bounced", "complained", "delivery_delayed", "failed", "suppressed"].includes(event)) {
            membership.deliveryState = event;
            await client.rpc("record_account_access_delivery", { p_actor: actor.authUser.id, p_user: userId, p_provider_id: providerId, p_state: event });
          }
        } catch { /* Keep accepted (delivery unconfirmed) on provider read failure. */ }
      }
      return membership;
    }));
    return { success: true, data: { ...state, recoveryEnabled: ACCOUNT_ACCESS_RECOVERY_ENABLED,
      memberships: memberships.map(member => ({ ...member, canSend: member.canSend && ACCOUNT_ACCESS_RECOVERY_ENABLED })) } };
  } catch (error) { return failure(error); }
}

export async function sendAccountAccess(userId: string, organisationId: string): Promise<Result<null>> {
  let finish: ((state: string, providerId?: string) => Promise<boolean>) | undefined;
  try {
    z.string().uuid().parse(userId); z.string().uuid().parse(organisationId);
    const actor = await requireCapability("users.manage", { mutation: true });
    if (!ACCOUNT_ACCESS_RECOVERY_ENABLED) return { success: false, error: "Recovery is disabled pending production Auth expiry verification." };
    const policy = await getPlatformOperationalPolicies();
    if (!RESEND_API_KEY || policy.security.allowAccountSetupLinks === false || policy.security.allowPasswordResetLinks === false || policy.notifications.onboardingSetupNotificationsEnabled === false) {
      return { success: false, error: "Account access email is disabled or not configured." };
    }
    const client = createSupabaseAdminClient();
    // Preflight policy before claiming an attempt or generating a token.
    const target = await client.auth.admin.getUserById(userId);
    if (target.error || !target.data.user?.email || !isInviteDomainAllowed(target.data.user.email, policy.security.inviteDomainAllowlist)) return failure(null);
    const attempt = randomUUID(), token = randomBytes(32).toString("hex");
    const claimed = await client.rpc("begin_account_access", { p_actor: actor.authUser.id, p_user: userId, p_organisation: organisationId,
      p_attempt: attempt, p_token_hash: createHash("sha256").update(token).digest("hex") });
    if (claimed.error || !claimed.data) {
      return { success: false, error: ["40001", "PT429", "PT409"].includes(claimed.error?.code ?? "") ? "An access email is pending, cooling down, or rate limited. Reload and retry later; review membership if the invitation was superseded." : "This account or organisation is not eligible for this action." };
    }
    finish = async (state, providerId) => {
      const receipt = await client.rpc("finish_account_access", { p_actor: actor.authUser.id, p_user: userId, p_attempt: attempt, p_state: state, p_provider_id: providerId ?? null });
      return !receipt.error;
    };
    const recipient = claimed.data as { email: string; name: string; organisationName: string; action: string; invitationExpiresAt: string | null };
    // Only recovery: cannot create an identity, assign access, or replace a password.
    const generated = await client.auth.admin.generateLink({ type: "recovery", email: recipient.email,
      options: { redirectTo: new URL("/auth/callback?next=/auth/reset-password", CUSTOMER_APP_URL).toString() } });
    if (generated.error || !generated.data.properties?.hashed_token || generated.data.user.id !== userId) {
      await finish("failed"); return { success: false, error: "Setup link could not be generated. Reload before retrying." };
    }
    const setup = new URL("/auth/confirm", CUSTOMER_APP_URL);
    setup.searchParams.set("token_hash", generated.data.properties.hashed_token);
    const acceptance = new URL("/auth/accept-organisation-invitation", CUSTOMER_APP_URL);
    acceptance.searchParams.set("token", token);
    const props = { name: recipient.name || "there", setupUrl: setup.toString(), organisationName: recipient.organisationName,
      acceptanceUrl: recipient.invitationExpiresAt ? acceptance.toString() : undefined,
      invitationExpiresAt: recipient.invitationExpiresAt ?? undefined, supportEmail: SUPPORT_EMAIL, setupExpiryMinutes: 60 };
    const sent = await new Resend(RESEND_API_KEY).emails.send({ from: `MOVRR <${FROM_EMAIL}>`, to: recipient.email, replyTo: SUPPORT_EMAIL,
      subject: recipient.action === "reset" ? "Recover your MOVRR account access" : "Your MOVRR organisation account access",
      react: AccountSetupEmail(props), text: accountSetupText(props) }, { idempotencyKey: `account-access/${attempt}` });
    if (sent.error || !sent.data?.id) {
      const message = sent.error?.message ?? "";
      const reason = /api.?key|unauthori[sz]ed/i.test(message) ? "credentials" : /from|sender|domain.*verif/i.test(message) ? "sender" : /recipient|\bto\b/i.test(message) ? "recipient" : /rate|quota/i.test(message) ? "rate_limit" : "provider";
      console.warn("Account access email submission rejected", { category: sent.error?.name ?? "missing_receipt", reason });
      const rejected = sent.error && ["validation_error", "missing_required_field", "invalid_access", "invalid_from_address", "restricted_api_key"].includes(sent.error.name);
      await finish(rejected ? "failed" : "unknown"); return { success: false, error: "Email submission failed or could not be confirmed. Check Account Access before retrying after the cooldown." };
    }
    if (!await finish("accepted", sent.data.id)) return { success: false, error: "Provider accepted the email, but the audit receipt needs reconciliation. Do not immediately resend." };
    return { success: true, data: null };
  } catch (error) {
    if (finish) { try { await finish("unknown"); } catch { /* Durable attempt remains visibly unresolved. */ } }
    return failure(error);
  }
}
