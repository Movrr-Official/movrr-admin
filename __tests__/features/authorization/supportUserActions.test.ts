import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { employeeHasCapability } from "@/features/organisations/domain/employeeRoleTemplates";
const state = vi.hoisted(() => ({ role: "support", requireCapability: vi.fn(), client: vi.fn(), from: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: (...args: unknown[]) => state.requireCapability(...args) }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => state.client() }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => state.revalidate(...args) }));
vi.mock("@/lib/env", () => ({ APP_URL: "https://example.test", FROM_EMAIL: "test@example.test", RESEND_API_KEY: "test-only" }));
vi.mock("@/lib/platformSettings", () => ({}));
vi.mock("@/lib/activitySignals", () => ({ fetchLatestUserActivitySignalMap: vi.fn(async () => new Map()), resolveLatestIsoTimestamp: () => undefined }));
vi.mock("@/lib/userActivity", () => ({ fetchUserActivityFeed: vi.fn(), writeUserActivity: vi.fn(), writeUserActivities: vi.fn() }));
vi.mock("@/emails/account-setup", () => ({ default: () => null, accountSetupText: () => "" }));
vi.mock("@/emails/password-reset", () => ({ default: () => null, passwordResetText: () => "" }));
import { getUsers, createUser, updateUser, toggleUserStatus, bulkUpdateUserStatus, deleteUser, sendPasswordResetEmail, updateUserRole, exportUserData } from "@/app/actions/users";
import { getRiders, updateRiderProfile, bulkUpdateRiderStatus, setCommunityRideCreatorAccess } from "@/app/actions/riders";
beforeEach(() => {
  vi.clearAllMocks(); state.role = "support";
  state.requireCapability.mockImplementation(async (capability: string) => {
    if (!employeeHasCapability(state.role, capability)) throw new Error("Missing capability: " + capability);
    return { authUser: { id: "operator", email: "operator@example.test" }, adminUser: { role: state.role } };
  });
  const result = { data: [], error: null }; const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "single", "maybeSingle"]) builder[method] = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  state.from.mockReturnValue(builder); state.client.mockReturnValue({ from: state.from });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("Users/Riders direct server-action authorization", () => {
  it.each(["support", "support_agent"])("%s may read Users/Riders without mutation", async (role) => {
    state.role = role;
    expect((await getUsers()).success).toBe(true);
    expect((await getRiders()).success).toBe(true);
    expect(state.requireCapability).toHaveBeenCalledWith("users.read");
    expect(state.requireCapability).toHaveBeenCalledWith("riders.read");
    expect(state.revalidate).not.toHaveBeenCalled();
  });
  it.each(["executive_viewer", "unknown", "rider"])("%s cannot bypass entity read gates with direct calls", async (role) => {
    state.role = role;
    expect((await getUsers()).success).toBe(false);
    expect((await getRiders()).success).toBe(false);
    expect(state.from).not.toHaveBeenCalled();
  });
  const attempts = [
    ["create account", () => createUser({} as never)],
    ["update account", () => updateUser({} as never)],
    ["suspend account", () => toggleUserStatus({ userId: "target", status: "inactive" })],
    ["bulk suspend accounts", () => bulkUpdateUserStatus(["target"], "inactive")],
    ["delete account", () => deleteUser({ userId: "target" })],
    ["reset password", () => sendPasswordResetEmail("target")],
    ["assign employee role", () => updateUserRole({ userId: "target", role: "support_agent" })],
    ["approve privileged role", () => updateUserRole({ userId: "target", role: "super_admin" })],
    ["edit rider", () => updateRiderProfile({} as never)],
    ["suspend riders", () => bulkUpdateRiderStatus(["target"], "inactive")],
    ["grant ride creator", () => setCommunityRideCreatorAccess({} as never)],
    ["export full account data", () => exportUserData("target")],
  ] as const;
  describe.each(["support", "support_agent"])("%s read does not authorize writes or sensitive exports", (role) => {
    it.each(attempts)("denies %s before any database operation", async (_name, attempt) => {
      state.role = role;
      expect((await attempt()).success).toBe(false);
      expect(state.from).not.toHaveBeenCalled();
      expect(state.revalidate).not.toHaveBeenCalled();
    });
  });
});
