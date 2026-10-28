import { beforeEach, expect, it, vi } from "vitest";
import { accessAction, type AccountAccessState } from "@/features/identity/domain/accountAccess";
const s = vi.hoisted(() => ({ enabled: true, denied: false, blocked: false, providerError: false, throwProvider: false, policyDisabled: false,
  event: "delivered", rpc: vi.fn(), generate: vi.fn(), send: vi.fn() }));
const target = "00000000-0000-4000-8000-000000000001", org = "00000000-0000-4000-8000-000000000002";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin", () => ({ requireCapability: async () => { if (s.denied) throw new Error("denied"); return { authUser: { id: "employee" } }; } }));
vi.mock("@/lib/env", () => ({ CUSTOMER_APP_URL: "https://app.example.test", FROM_EMAIL: "test@example.test", SUPPORT_EMAIL: "support@example.test", RESEND_API_KEY: "synthetic", get ACCOUNT_ACCESS_RECOVERY_ENABLED() { return s.enabled; } }));
vi.mock("@/lib/platformSettings", () => ({ isInviteDomainAllowed: () => true, getPlatformOperationalPolicies: async () => ({ security: { allowAccountSetupLinks: !s.policyDisabled }, notifications: {} }) }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc: s.rpc, auth: { admin: {
  getUserById: async () => ({ data: { user: { id: target, email: "synthetic@example.test" } } }), generateLink: s.generate,
} } }) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: s.send, get: async () => ({ data: { last_event: s.event } }) }; } }));
import { getAccountAccess, sendAccountAccess } from "@/app/actions/accountAccess";
const membership = { organisationId: org, organisationName: "Synthetic Org", membershipStatus: "active", invitationStatus: null,
  invitationExpiresAt: null, lastAttemptAt: null, deliveryState: "accepted", retryAt: null, canSend: true };
const state: AccountAccessState = { userId: target, eligible: true, hasPassword: false, lastSignInAt: null, memberships: [membership] };
beforeEach(() => {
  s.denied = s.blocked = s.providerError = s.throwProvider = s.policyDisabled = false; s.event = "delivered";
  s.enabled = true;
  s.rpc.mockReset().mockImplementation(async name => {
    if (name === "begin_account_access") return s.blocked ? { error: { code: "40001" } } : { data: { email: "synthetic@example.test", name: "Synthetic", organisationName: "Synthetic Org", action: "setup", invitationExpiresAt: null } };
    if (name === "account_access_state") return { data: { ...state, memberships: [{ ...membership, providerId: "provider-receipt" }] } };
    return { data: null, error: null };
  });
  s.generate.mockReset().mockResolvedValue({ data: { properties: { hashed_token: "secret-auth-token" }, user: { id: target } } });
  s.send.mockReset().mockImplementation(async () => { if (s.throwProvider) throw new Error("secret-auth-token"); return s.providerError ? { error: { name: "validation_error", message: "secret-auth-token" } } : { data: { id: "provider-receipt" } }; });
});
it("never exposes Auth or membership tokens to the caller or audit and uses provider idempotency", async () => {
  const result = await sendAccountAccess(target, org);
  expect(result).toEqual({ success: true, data: null });
  expect(JSON.stringify(result)).not.toContain("secret-auth-token");
  expect(s.generate.mock.calls[0][0]).toMatchObject({ type: "recovery", email: "synthetic@example.test" });
  expect(s.send.mock.calls[0][1].idempotencyKey).toMatch(/^account-access\//);
  const outcome = s.rpc.mock.calls.find(c => c[0] === "finish_account_access")![1];
  expect(outcome).toMatchObject({ p_state: "accepted", p_provider_id: "provider-receipt" });
  expect(JSON.stringify(outcome)).not.toContain("secret-auth-token");
});
it.each(["denied", "blocked", "policyDisabled"] as const)("rejects %s before generating a setup link or sending email", async reason => {
  s[reason] = true;
  expect((await sendAccountAccess(target, org)).success).toBe(false);
  expect(s.generate).not.toHaveBeenCalled(); expect(s.send).not.toHaveBeenCalled();
});
it.each(["PT429", "PT409"])("returns a retryable business response for %s without submitting email", async code => {
  s.rpc.mockResolvedValue({ error: { code } });
  const result = await sendAccountAccess(target, org);
  expect(result).toMatchObject({ success: false, error: expect.stringContaining("cooling down") });
  expect(s.generate).not.toHaveBeenCalled(); expect(s.send).not.toHaveBeenCalled();
});
it.each([[true, false, "failed"], [false, true, "unknown"]] as const)("records rejected and ambiguous submissions safely", async (rejected, ambiguous, outcome) => {
  s.providerError = rejected; s.throwProvider = ambiguous;
  const result = await sendAccountAccess(target, org);
  expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain("secret-auth-token");
  expect(s.rpc.mock.calls.find(c => c[0] === "finish_account_access")![1].p_state).toBe(outcome);
});
it.each(["delivered", "bounced", "delivery_delayed", "suppressed"])("reports provider evidence %s without returning email contents", async event => {
  s.event = event;
  const result = await getAccountAccess(target);
  expect(result.success && result.data.memberships[0].deliveryState).toBe(event);
  expect(JSON.stringify(result)).not.toContain("provider-receipt");
});
it("fails closed on identity mismatch from Auth", async () => {
  s.generate.mockResolvedValue({ data: { properties: { hashed_token: "secret-auth-token" }, user: { id: org } } });
  expect((await sendAccountAccess(target, org)).success).toBe(false); expect(s.send).not.toHaveBeenCalled();
});
it("cannot generate or send live links until the production expiry release gate is enabled", async () => {
  s.enabled = false;
  expect((await sendAccountAccess(target, org)).success).toBe(false);
  expect(s.rpc).not.toHaveBeenCalled(); expect(s.generate).not.toHaveBeenCalled(); expect(s.send).not.toHaveBeenCalled();
  const result = await getAccountAccess(target);
  expect(result.success && result.data.memberships[0].canSend).toBe(false);
});
it("logs only fixed provider diagnostic categories without email contents or setup tokens", async () => {
  s.providerError = true;
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await sendAccountAccess(target, org);
    expect(warning).toHaveBeenCalledWith("Account access email submission rejected", { category: "validation_error", reason: "provider" });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("secret-auth-token");
  } finally { warning.mockRestore(); }
});
it("offers only contextual actions and does not mistake a provisioned random password for finished setup", () => {
  expect(accessAction(state, membership)).toBe("Send Setup Link");
  expect(accessAction({ ...state, hasPassword: true }, membership)).toBe("Send Setup Link");
  expect(accessAction({ ...state, hasPassword: true, lastSignInAt: new Date().toISOString() }, membership)).toBe("Reset Password");
  expect(accessAction(state, { ...membership, membershipStatus: "invited" })).toBe("Send Invitation");
  expect(accessAction(state, { ...membership, membershipStatus: "invited", invitationStatus: "expired" })).toBe("Resend Invitation");
  expect(accessAction(state, { ...membership, membershipStatus: "revoked" })).toBeNull();
  expect(accessAction({ ...state, eligible: false }, membership)).toBeNull();
});
