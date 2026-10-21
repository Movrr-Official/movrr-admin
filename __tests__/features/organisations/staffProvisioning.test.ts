import { describe, expect, it } from "vitest";
import { createOrganisationOpsCommands, createOrganisationOpsQueries, createOrganisationOpsStore } from "@/features/organisations/application/organisationOps";
import { authorisationService, withPermissions } from "@/features/organisations/application/commands/authorisationService";
import type { RequestContext, AuthenticatedPrincipal } from "@/features/identity/domain/Principal";

const context = (principal: AuthenticatedPrincipal): RequestContext => withPermissions({ principal, correlationId: "staff-test", permissions: [], audit: { actorUserId: principal.userId, actorEmail: null, principalType: principal.type } });
describe("organisation staff creation boundaries", () => {
  it("denies cross-organisation staff creation, ownership assignment and reads before persistence", async () => {
    const store = createOrganisationOpsStore();
    const a = await store.createOrganisation({ name: "A", type: "reward_partner" });
    const b = await store.createOrganisation({ name: "B", type: "reward_partner" });
    const ctx = context({ type: "organisation", userId: "owner-a", email: null, organisationId: a.id, membershipId: "owner-membership", role: "owner", organisationType: "reward_partner" });
    const commands = createOrganisationOpsCommands({ store, authorisation: authorisationService });
    const queries = createOrganisationOpsQueries({ store, authorisation: authorisationService });
    expect((await commands.addStaff(ctx, { organisationId: b.id, userId: "existing-user", role: "staff" })).ok).toBe(false);
    expect((await commands.addStaff(ctx, { organisationId: a.id, userId: "existing-user", role: "owner" })).ok).toBe(false);
    expect((await queries.listStaff(ctx, b.id)).ok).toBe(false);
    expect(await store.listMembersByOrganisation(a.id)).toHaveLength(0);
    expect(await store.listMembersByOrganisation(b.id)).toHaveLength(0);
    expect((await commands.create(ctx, { name: "Unauthorized tenant", type: "movrr" })).ok).toBe(false);
  });
  it("replays an existing-user staff invitation without creating duplicate memberships or changing access", async () => {
    const store = createOrganisationOpsStore();
    const org = await store.createOrganisation({ name: "Partner", type: "reward_partner" });
    const ctx = context({ type: "admin", userId: "operator", email: null, adminUserId: "admin", role: "operations_manager" });
    const commands = createOrganisationOpsCommands({ store, authorisation: authorisationService });
    const input = { organisationId: org.id, userId: "existing-user", role: "staff" as const };
    const first = await commands.addStaff(ctx, input), second = await commands.addStaff(ctx, input);
    expect(first.ok).toBe(true); expect(second).toEqual(first);
    expect(await store.listMembersByOrganisation(org.id)).toHaveLength(1);
    await expect(commands.addStaff(ctx, { ...input, role: "owner" })).rejects.toThrow("different access");
    expect((await store.listMembersByOrganisation(org.id))[0]).toMatchObject({ role: "staff", bundleKey: "org.staff" });
    expect((await commands.addStaff(ctx, { ...input, userId: "another-user", role: "security_admin" as never })).ok).toBe(false);
    expect(await store.listMembersByOrganisation(org.id)).toHaveLength(1);
  });
  it("preserves the employee role capability boundary and prevents owner demotion by tenant staff", async () => {
    const store = createOrganisationOpsStore();
    const org = await store.createOrganisation({ name: "Partner", type: "reward_partner" });
    const owner = await store.addMember({ organisationId: org.id, userId: "owner", role: "owner" });
    const commands = createOrganisationOpsCommands({ store, authorisation: authorisationService });
    const employee = context({ type: "admin", userId: "partner-ops", email: null, adminUserId: "admin", role: "partner_operations_manager" });
    expect(employee.permissions).toContain("partners.approve");
    expect(employee.permissions).not.toContain("users.role.assign");
    expect((await commands.addStaff(employee, { organisationId: org.id, userId: "target", role: "owner" })).ok).toBe(false);
    const tenant = context({ type: "organisation", userId: "owner", email: null, organisationId: org.id, membershipId: owner.id, role: "owner", organisationType: "reward_partner" });
    expect((await commands.updateStaffRole(tenant, { organisationId: org.id, membershipId: owner.id, role: "viewer" })).ok).toBe(false);
    expect((await store.findMembershipById(owner.id))?.role).toBe("owner");
  });
});
