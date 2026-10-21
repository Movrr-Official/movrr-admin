import { describe, expect, it, vi } from "vitest";
import { externalAccountSchema, rolesForDomain, accountRoleLabel } from "@/features/identity/domain/accountDomains";
import { capabilitiesForMembership } from "@/features/organisations/domain/CapabilityCatalog";
import { authenticateRequest } from "@/features/identity/application/commands/authenticateRequest";
describe("canonical account domain contracts", () => {
  it("keeps Partner operations tenant-scoped and reserves staff/ownership/platform authority", () => {
    const capabilities = capabilitiesForMembership("reward_partner", "manager");
    expect(capabilities).toEqual(expect.arrayContaining(["rewards.manage", "resources.manage", "fulfilment.validate", "fulfilment.confirm", "fulfilment.cancel", "fulfilment.refund"]));
    expect(capabilities).not.toEqual(expect.arrayContaining(["staff.manage", "users.role.assign"]));
    expect(capabilities).not.toContain("partners.approve");
    expect(capabilities).not.toContain("billing.manage");
    expect(accountRoleLabel("partner", "manager")).toBe("Manager");
    expect(accountRoleLabel("partner", "partner_operations_manager")).toBe("Partner Operations Manager");
    expect(capabilitiesForMembership("reward_partner", "partner_operations_manager")).toContain("staff.manage");
    expect(rolesForDomain("staff")).toContain("partner_operations_manager");
    expect(rolesForDomain("partner")).toContain("partner_operations_manager");
    expect(rolesForDomain("advertiser")).not.toContain("partner_operations_manager");
  });
  it("restricts advertisers by role and government administration to owners", () => {
    expect(capabilitiesForMembership("advertiser", "viewer")).not.toContain("campaigns.write");
    expect(capabilitiesForMembership("advertiser", "staff")).not.toContain("campaigns.launch");
    expect(capabilitiesForMembership("advertiser", "manager")).not.toContain("billing.read");
    expect(capabilitiesForMembership("advertiser", "owner")).toContain("billing.read");
    expect(rolesForDomain("government")).toEqual(["owner", "viewer"]);
    expect(capabilitiesForMembership("government", "viewer")).not.toContain("org.settings");
    expect(capabilitiesForMembership("government", "owner")).toContain("org.settings");
    expect(capabilitiesForMembership("government", "manager")).toEqual([]);
    expect(capabilitiesForMembership(undefined, "owner")).toEqual([]);
    expect(capabilitiesForMembership("movrr", "owner")).toEqual([]);
  });
  it("rejects domain/role and employee payloads before side effects", () => {
    expect(externalAccountSchema.safeParse({ domain: "partner", role: "partner_operations_manager" }).success).toBe(false);
    expect(externalAccountSchema.safeParse({ domain: "government", role: "manager" }).success).toBe(false);
  });
  it("does not fall back to employee authority when a requested tenant is unauthorized", async () => {
    const admin = vi.fn(async () => ({ id: "admin", userId: "user", role: "super_admin", email: null }));
    const result = await authenticateRequest({ accessToken: "token", organisationId: "another-tenant" }, {
      verifyAccessToken: async () => ({ userId: "user", email: null }), findAdminUser: admin,
      findOrganisationMembership: async () => null, findRiderProfile: async () => null,
    });
    expect(result.ok).toBe(false); expect(admin).not.toHaveBeenCalled();
  });
});
