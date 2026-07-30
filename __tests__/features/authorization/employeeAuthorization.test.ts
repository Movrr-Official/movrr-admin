import {
  assertSameActorSod,
  capabilityRequiredToAssignRole,
  canApproveWorkflow,
} from "@/features/authorization/sod";
import { simulateAllEmployeeRoles } from "@/features/authorization/diagnostics";
import { assertCapability } from "@/features/organisations/application/commands/authorisationService";
import { describe, expect, it } from "vitest";
import {
  capabilitiesForEmployeeRole,
  CANONICAL_EMPLOYEE_ROLES,
  resolveCanonicalEmployeeRole,
  employeeHasCapability,
} from "@/features/organisations/domain/employeeRoleTemplates";
import { mapAdminRoleToCapabilities } from "@/features/organisations/application/adminCapabilityMapper";
import {
  canAccessPage,
  getSearchEntityCapability,
} from "@/features/authorization/dashboardRegistry";

describe("employee role templates", () => {
  it("maps legacy admin to operations_manager capabilities", () => {
    expect(resolveCanonicalEmployeeRole("admin")).toBe("operations_manager");
    const legacy = mapAdminRoleToCapabilities("admin");
    const canonical = capabilitiesForEmployeeRole("operations_manager");
    expect(legacy).toEqual(canonical);
  });

  it("maps legacy compliance_officer to compliance_analyst", () => {
    expect(resolveCanonicalEmployeeRole("compliance_officer")).toBe(
      "compliance_analyst",
    );
    expect(employeeHasCapability("compliance_officer", "programmes.read")).toBe(
      true,
    );
    expect(employeeHasCapability("compliance_officer", "settings.manage")).toBe(
      false,
    );
  });

  it("denies executive_viewer write capabilities", () => {
    expect(employeeHasCapability("executive_viewer", "campaigns.write")).toBe(
      false,
    );
    expect(employeeHasCapability("executive_viewer", "analytics.read")).toBe(
      true,
    );
  });

  it("grants fraud_analyst fraud.resolve but not settings.manage", () => {
    expect(employeeHasCapability("fraud_analyst", "fraud.resolve")).toBe(true);
    expect(employeeHasCapability("fraud_analyst", "settings.manage")).toBe(
      false,
    );
  });

  it("super_admin holds wildcard-equivalent full catalog", () => {
    expect(employeeHasCapability("super_admin", "users.role.approve")).toBe(
      true,
    );
    expect(employeeHasCapability("super_admin", "break_glass.use")).toBe(true);
  });
});

describe("page / search capability alignment", () => {
  it("allows compliance_analyst on programmes but not settings", () => {
    const caps = capabilitiesForEmployeeRole("compliance_analyst");
    expect(canAccessPage("/programmes", caps)).toBe(true);
    expect(canAccessPage("/settings", caps)).toBe(false);
  });

  it("gates /authorization on authz.inspect", () => {
    const security = capabilitiesForEmployeeRole("security_admin");
    const campaign = capabilitiesForEmployeeRole("campaign_manager");
    expect(canAccessPage("/authorization", security)).toBe(true);
    expect(canAccessPage("/authorization", campaign)).toBe(false);
  });

  it("maps search entities to capabilities", () => {
    expect(getSearchEntityCapability("campaign")).toBe("campaigns.read");
    expect(getSearchEntityCapability("rider")).toBe("riders.read");
  });
});

describe("separation of duties", () => {
  it("requires security approval capability for super_admin assignment", () => {
    expect(capabilityRequiredToAssignRole("super_admin")).toBe(
      "users.role.approve",
    );
    expect(capabilityRequiredToAssignRole("support_agent")).toBe(
      "users.role.assign",
    );
  });

  it("blocks same actor for campaign approval", () => {
    const result = assertSameActorSod({
      workflowId: "campaign_approval",
      initiatorUserId: "user-1",
      approverUserId: "user-1",
    });
    expect(result.ok).toBe(false);
  });

  it("allows distinct actors for campaign approval", () => {
    const result = assertSameActorSod({
      workflowId: "campaign_approval",
      initiatorUserId: "user-1",
      approverUserId: "user-2",
    });
    expect(result.ok).toBe(true);
  });

  it("operations_manager can initiate campaigns but SoD approve is also present", () => {
    const caps = capabilitiesForEmployeeRole("operations_manager");
    // Bundle may include both; same-actor checks enforce SoD at runtime
    expect(canApproveWorkflow("campaign_approval", caps)).toBe(true);
  });
});

describe("platform authorisationService integration", () => {
  it("assertCapability denies missing grants", () => {
    const result = assertCapability(
      {
        principal: {
          type: "admin",
          userId: "u1",
          email: "a@movrr.io",
          adminUserId: "a1",
          role: "support_agent",
        },
        correlationId: "c1",
        permissions: mapAdminRoleToCapabilities("support_agent"),
        audit: {
          actorUserId: "u1",
          actorEmail: "a@movrr.io",
          principalType: "admin",
        },
      },
      "settings.manage",
    );
    expect(result.ok).toBe(false);
  });

  it("assertCapability allows support notifications.send", () => {
    const permissions = mapAdminRoleToCapabilities("support_agent");
    const result = assertCapability(
      {
        principal: {
          type: "admin",
          userId: "u1",
          email: "a@movrr.io",
          adminUserId: "a1",
          role: "support_agent",
        },
        correlationId: "c1",
        permissions,
        audit: {
          actorUserId: "u1",
          actorEmail: "a@movrr.io",
          principalType: "admin",
        },
      },
      "notifications.send",
    );
    expect(result.ok).toBe(true);
  });
});

describe("role simulator coverage", () => {
  it("simulates every canonical employee role", () => {
    const results = simulateAllEmployeeRoles();
    expect(results).toHaveLength(CANONICAL_EMPLOYEE_ROLES.length);
    for (const result of results) {
      expect(result.capabilities.length).toBeGreaterThan(0);
      expect(result.navigationHrefs).toContain("/");
    }
  });
});
