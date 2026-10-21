import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const state = vi.hoisted(() => ({ employeeRole: null as string | null, failDelivery: false, sent: [] as { subject: string; text: string }[], redirects: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/env", () => ({ APP_URL: "https://admin.example.test", CUSTOMER_APP_URL: "https://app.example.test", FROM_EMAIL: "test@example.test", RESEND_API_KEY: "isolated-test-key" }));
vi.mock("@/lib/admin", () => ({ requireCapability: async () => ({ authUser: { id: "actor" } }) }));
vi.mock("@/lib/platformSettings", () => ({ getPlatformOperationalPolicies: async () => ({ security: {}, notifications: {} }), getPlatformSecurityPolicy: async () => ({}), getPlatformPrivacyPolicy: async () => ({}) }));
vi.mock("@/lib/userActivity", () => ({ writeUserActivity: async () => {} }));
vi.mock("resend", () => ({ Resend: class { emails = { send: async (payload: { subject: string; text: string }) => { state.sent.push(payload); return { error: state.failDelivery ? { message: "Provider unavailable" } : null }; } }; } }));
const client = {
  from: (table: string) => ({ select() { return this; }, eq() { return this; },
    single: async () => ({ data: { id: "target", name: "Target" }, error: null }),
    maybeSingle: async () => ({ data: table === "admin_users" ? { role: state.employeeRole } : { id: "target", name: "Target" }, error: null }),
  }),
  auth: { admin: { generateLink: async (input: { options: { redirectTo: string } }) => { state.redirects.push(input.options.redirectTo); return { data: { properties: { hashed_token: "test-hash" } }, error: null }; } } },
};
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => client }));
import { notifyAccountSetup } from "@/lib/services/accountSetupNotification";
import { sendPasswordResetEmail } from "@/app/actions/users";
beforeEach(() => { state.employeeRole = null; state.failDelivery = false; state.sent = []; state.redirects = []; });
it.each(["rider", "partner", "advertiser", "government", "staff"])("routes %s account setup to its valid authentication surface", async domain => {
  const warning = await notifyAccountSetup(client as unknown as SupabaseClient, { id: "target", name: "Target", email: "target@example.test", domain, role: domain === "staff" ? "partner_operations_manager" : domain });
  expect(warning).toBeUndefined();
  expect(new URL(state.redirects[0]).origin).toBe(domain === "staff" ? "https://admin.example.test" : "https://app.example.test");
});
it.each([null, "partner_operations_manager"])("routes password recovery from the explicit staff grant %s", async employeeRole => {
  state.employeeRole = employeeRole;
  expect((await sendPasswordResetEmail("target@example.test")).success).toBe(true);
  expect(new URL(state.redirects[0]).origin).toBe(employeeRole ? "https://admin.example.test" : "https://app.example.test");
  expect(state.sent[0].subject).toBe(employeeRole ? "Reset your MOVRR Admin password" : "Reset your MOVRR password");
});
it("reports a provider rejection as failure instead of claiming a delivered reset", async () => {
  state.failDelivery = true;
  expect(await sendPasswordResetEmail("target@example.test")).toMatchObject({ success: false, error: "Provider unavailable" });
});
