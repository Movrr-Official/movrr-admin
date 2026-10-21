// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/schemas";
type MembershipFixture = NonNullable<User["memberships"]>[number];

const state = vi.hoisted(() => ({ allowed: true, organisations: vi.fn(async () => []), invitations: vi.fn(async () => []), retry: vi.fn(async () => {}), riderRead: vi.fn(async () => ({success:true,data:[]})), update: vi.fn(async (_input: unknown) => ({success:true})), rows: [] as MembershipFixture[], issue: vi.fn(async () => ({ url: "https://app.example.test/auth/accept-organisation-invitation?token=controlled-test-token" })) }));
vi.mock("@/hooks/useAdminUser", () => ({ useCapability: () => state.allowed }));
vi.mock("@/app/actions/accountMemberships", () => ({ getAccountOrganisations: state.organisations, getAccountInvitations: state.invitations,
  getAccountMemberships: async () => state.rows, changeAccountMembership: vi.fn(), issueAccountInvitation: state.issue, revokeAccountInvitation: vi.fn(), retryAccountAuthSynchronization: state.retry }));
vi.mock("@/app/actions/users", () => ({ updateUser: state.update, sendPasswordResetEmail: vi.fn(), exportUserData: vi.fn(),
  getUserActivityLogs: async () => ({success:true,data:[]}), getUserRoutes: state.riderRead, getUserCampaigns: state.riderRead, getUserRewardTransactions: state.riderRead, getUserPointsBalance: state.riderRead }));
import { UserRelationships } from "@/components/users/UserRelationships";
import { AccountMemberships } from "@/components/users/AccountMemberships";
import { AccountStatusRecovery } from "@/components/users/AccountStatusRecovery";
import { UserDetailsDrawer } from "@/components/users/UserDetailsDrawer";
import { getUsersTableColumns } from "@/components/users/UsersTableColumns";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  state.allowed = true; state.rows = []; vi.clearAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const user = (extra: Partial<User> = {}) => ({ id: "user", name: "Independent account", email: "user@example.test", createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", role: "unassigned", status: "active", memberships: [], ...extra }) as User;
const member = { id: "membership", organisationId: "partner", organisationName: "Actual Partner", domain: "partner" as const, role: "partner_operations_manager" as const, status: "active" as const, updatedAt: "2026-10-21T00:00:00Z" };
async function show(element: React.ReactElement) { await act(async () => root.render(element)); }

describe("actual relationship presentation", () => {
  it("shows an independent User without a missing-membership or status label", async () => {
    await show(React.createElement(UserRelationships, { user: user() }));
    expect(host.textContent).toBe("User");
  });
  it("shows Rider information without redundant active membership/account status", async () => {
    await show(React.createElement(UserRelationships, { user: user({ role: "rider", riderStatus: "active" }) }));
    expect(host.textContent).toBe("Rider");
  });
  it("shows internal Staff without inventing a Rider", async () => {
    await show(React.createElement(UserRelationships, { user: user({ employeeRole: "support_agent" }) }));
    expect(host.textContent).toBe("MOVRR Staff · Support Agent");
  });
  it("shows each independently assigned relationship and its actual organisation role", async () => {
    await show(React.createElement(UserRelationships, { user: user({ riderStatus: "active", employeeRole: "support_agent", memberships: [member] }) }));
    expect(host.textContent).toContain("Rider"); expect(host.textContent).toContain("MOVRR Staff · Support Agent");
    expect(host.textContent).toContain("Actual Partner · Partner Operations Manager"); expect(host.textContent).not.toContain("active");
  });
  it("does not present a revoked relationship as active access", async () => {
    await show(React.createElement(UserRelationships, { user: user({ memberships: [{ ...member, status: "revoked" }] }) }));
    expect(host.textContent).toBe("User");
  });
});
describe("optional organisation controls and real pending recovery", () => {
  it("reloads relationships and recovery independently of the account timestamp", async () => {
    const original = user({ authSyncPending: true });
    await show(React.createElement(UserDetailsDrawer, { user: original, open: true, onOpenChange: () => {} }));
    expect(document.body.textContent).toContain("Retry account activation");
    await show(React.createElement(UserDetailsDrawer, { user: { ...original, memberships: [member], authSyncPending: false }, open: true, onOpenChange: () => {} }));
    expect(document.body.textContent).toContain("Actual Partner · Partner Operations Manager");
    expect(document.body.textContent).not.toContain("Retry account activation");
  });
  it("keeps a newly created invitation link through membership readback", async () => {
    const invited = { ...member, status: "invited" as const };
    state.rows = [invited];
    await show(React.createElement(AccountMemberships, { userId: "user", initialMemberships: [invited] }));
    const invite = [...host.querySelectorAll("button")].find(button => button.textContent === "Create invitation link")!;
    await act(async () => invite.click());
    expect(state.issue).toHaveBeenCalledOnce();
    expect(host.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("controlled-test-token");
    await show(React.createElement(AccountMemberships, { userId: "user", initialMemberships: [{ ...invited }] }));
    expect(host.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("controlled-test-token");
  });
  it("edits a User-only account without selecting or writing any relationship", async () => {
    const onChange = vi.fn();
    await show(React.createElement(UserDetailsDrawer, { user: user(), open: true, onOpenChange: () => {}, onUserUpdate: onChange }));
    expect(document.body.textContent).not.toContain("Select organisation");
    expect([...document.body.querySelectorAll('[data-slot="badge"]')].filter(node => node.textContent === "Active")).toHaveLength(1);
    await act(async () => [...document.body.querySelectorAll("button")].find(button => button.textContent?.trim() === "Edit")!.click());
    expect(document.body.textContent).not.toContain("No employee access");
    expect(document.body.textContent).toContain("Add internal staff access");
    await act(async () => [...document.body.querySelectorAll("button")].find(button => button.textContent?.trim() === "Save")!.click());
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ id: "user", name: "Independent account" }));
    expect(state.update.mock.calls[0]?.[0]).not.toHaveProperty("employeeRole");
    expect(state.update.mock.calls[0]?.[0]).not.toHaveProperty("organisationId");
    expect(onChange).toHaveBeenCalledOnce();
  });
  it("renders the actual Staff-only details without Rider operations, membership forms or healthy recovery", async () => {
    await show(React.createElement(UserDetailsDrawer, { user: user({ employeeRole: "support_agent" }), open: true, onOpenChange: () => {} }));
    const content = document.body.textContent ?? "";
    expect(content).toContain("MOVRR Staff · Support Agent"); expect(content).not.toContain("Rider membership");
    expect(content).not.toContain("Select organisation"); expect(content).not.toContain("Retry account activation");
    expect(content).not.toContain("Routes (0)"); expect(state.riderRead).not.toHaveBeenCalled();
  });
  it("keeps account status in the existing Status column, independent of Rider/membership state", async () => {
    const column = getUsersTableColumns().find(item => "accessorKey" in item && item.accessorKey === "status")!;
    const render = column.cell as (props: unknown) => React.ReactElement;
    await show(render({ row: { getValue: () => "inactive", original: user({ riderStatus: "active", memberships: [member], status: "inactive" }) } }));
    expect(host.textContent).toBe("Inactive");
  });
  it("does not render/load organisation forms until adding access is explicitly requested", async () => {
    await show(React.createElement(AccountMemberships, { userId: "user", initialMemberships: [] }));
    expect(host.textContent).not.toContain("Select organisation"); expect(state.organisations).not.toHaveBeenCalled(); expect(state.invitations).not.toHaveBeenCalled();
    const add = [...host.querySelectorAll("button")].find(button => button.textContent === "Add organisation access")!;
    await act(async () => add.click());
    expect(host.textContent).toContain("Select organisation"); expect(state.organisations).toHaveBeenCalledOnce();
    const cancel = [...host.querySelectorAll("button")].find(button => button.textContent === "Cancel")!;
    await act(async () => cancel.click()); expect(host.textContent).not.toContain("Select organisation");
  });
  it("keeps actual organisation access visible to read-only operators without granting controls", async () => {
    state.allowed = false;
    await show(React.createElement(AccountMemberships, { userId: "user", initialMemberships: [member] }));
    expect(host.textContent).toContain("Actual Partner · Partner Operations Manager");
    expect(host.textContent).not.toContain("Add organisation access"); expect(host.textContent).not.toContain("Revoke membership");
  });
  it("hides recovery for healthy accounts and shows it only for an authorized pending receipt", async () => {
    await show(React.createElement(AccountStatusRecovery, { userId: "user", pending: false })); expect(host.textContent).toBe("");
    expect(state.retry).not.toHaveBeenCalled();
    await show(React.createElement(AccountStatusRecovery, { userId: "user", pending: true }));
    expect(host.textContent).toContain("Retry account activation or suspension");
    await act(async () => host.querySelector("button")!.click()); expect(state.retry).toHaveBeenCalledExactlyOnceWith("user");
    state.allowed = false;
    await show(React.createElement(AccountStatusRecovery, { userId: "user", pending: true })); expect(host.textContent).toBe("");
  });
});
