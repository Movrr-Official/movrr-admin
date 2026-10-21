import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import AccountSetupEmail, { accountSetupText } from "@/emails/account-setup";
import { APP_URL, CUSTOMER_APP_URL, FROM_EMAIL, RESEND_API_KEY } from "@/lib/env";
import { getPlatformOperationalPolicies } from "@/lib/platformSettings";

// Notification failure cannot roll back an already committed identity.
export async function notifyAccountSetup(client: SupabaseClient, account: { id: string; email: string; name: string; domain?: string; role?: string }) {
  try {
    const policy = await getPlatformOperationalPolicies();
    if (policy.security.allowAccountSetupLinks === false || policy.notifications.onboardingSetupNotificationsEnabled === false) {
      throw new Error("Setup notifications are disabled by policy.");
    }
    if (!RESEND_API_KEY) throw new Error("Setup email is not configured.");
    const origin = (account.domain && account.domain !== "staff") || account.role === "rider" || account.role === "advertiser" ? CUSTOMER_APP_URL : APP_URL;
    const { data, error } = await client.auth.admin.generateLink({ type: "recovery", email: account.email,
      options: { redirectTo: new URL("/auth/callback?next=/auth/reset-password", origin).toString() } });
    if (error || !data?.properties?.hashed_token) throw new Error(error?.message || "Setup link unavailable.");
    const url = new URL("/auth/confirm", origin);
    url.searchParams.set("token_hash", data.properties.hashed_token); url.searchParams.set("type", "recovery");
    const setupUrl = url.toString();
    const sent = await new Resend(RESEND_API_KEY).emails.send({
      from: FROM_EMAIL ? `MOVRR <${FROM_EMAIL}>` : "MOVRR <no-reply@movrr.nl>",
      to: account.email, subject: "Set up your MOVRR account",
      react: AccountSetupEmail({ name: account.name, setupUrl }), text: accountSetupText({ name: account.name, setupUrl }),
    });
    if (sent.error) throw new Error(sent.error.message);
  } catch (error) {
    return `Account created. Setup email needs retry: ${error instanceof Error ? error.message : "Delivery failed"}`;
  }
  return undefined;
}
