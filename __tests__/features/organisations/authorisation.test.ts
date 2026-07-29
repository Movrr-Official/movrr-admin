import { describe, it, expect } from "vitest";
import type {
  AdminPrincipal,
  OrganisationPrincipal,
  RiderPrincipal,
  RequestContext,
} from "@/features/identity/domain/Principal";
import {
  assertCapability,
  resolvePermissions,
  withPermissions,
} from "@/features/organisations/application/commands/authorisationService";
import {
  ORG_ROLE_BUNDLE_KEYS,
  type MembershipRole,
} from "@/features/organisations/domain/CapabilityCatalog";

function orgPrincipal(role: MembershipRole): OrganisationPrincipal {
  return {
    type: "organisation",
    userId: "user-org-1",
    email: "staff@partner.test",
    organisationId: "org-1",
    membershipId: "mem-1",
    role,
  };
}

function adminPrincipal(role: string): AdminPrincipal {
  return {
    type: "admin",
    userId: "user-admin-1",
    email: "admin@movrr.io",
    adminUserId: "admin-1",
    role,
  };
}

function riderPrincipal(): RiderPrincipal {
  return {
    type: "rider",
    userId: "user-rider-1",
    email: "rider@example.com",
    riderId: "rider-1",
  };
}

function ctxFor(
  principal: RequestContext["principal"],
  permissions: string[] = [],
): RequestContext {
  return {
    principal,
    correlationId: "corr-1",
    permissions,
    audit: {
      actorUserId: principal.userId,
      actorEmail: principal.email,
      principalType: principal.type,
    },
  };
}

describe("organisation role → permission bundles", () => {
  it("maps owner/manager/staff/viewer to distinct bundle keys", () => {
    expect(ORG_ROLE_BUNDLE_KEYS.owner).toBe("org.owner");
    expect(ORG_ROLE_BUNDLE_KEYS.manager).toBe("org.manager");
    expect(ORG_ROLE_BUNDLE_KEYS.staff).toBe("org.staff");
    expect(ORG_ROLE_BUNDLE_KEYS.viewer).toBe("org.viewer");
  });

  it("staff can fulfilment.validate", () => {
    const permissions = resolvePermissions(orgPrincipal("staff"));
    const result = assertCapability(
      ctxFor(orgPrincipal("staff"), permissions),
      "fulfilment.validate",
    );
    expect(result.ok).toBe(true);
  });

  it("staff can fulfilment.confirm", () => {
    const permissions = resolvePermissions(orgPrincipal("staff"));
    const result = assertCapability(
      ctxFor(orgPrincipal("staff"), permissions),
      "fulfilment.confirm",
    );
    expect(result.ok).toBe(true);
  });

  it("viewer cannot manage resources", () => {
    const permissions = resolvePermissions(orgPrincipal("viewer"));
    const result = assertCapability(
      ctxFor(orgPrincipal("viewer"), permissions),
      "resources.manage",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("permission_denied");
  });

  it("viewer cannot fulfilment.confirm", () => {
    const permissions = resolvePermissions(orgPrincipal("viewer"));
    const result = assertCapability(
      ctxFor(orgPrincipal("viewer"), permissions),
      "fulfilment.confirm",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("permission_denied");
  });

  it("owner can staff.manage", () => {
    const permissions = resolvePermissions(orgPrincipal("owner"));
    const result = assertCapability(
      ctxFor(orgPrincipal("owner"), permissions),
      "staff.manage",
    );
    expect(result.ok).toBe(true);
  });

  it("manager can resources.manage but not staff.manage", () => {
    const permissions = resolvePermissions(orgPrincipal("manager"));
    expect(
      assertCapability(
        ctxFor(orgPrincipal("manager"), permissions),
        "resources.manage",
      ).ok,
    ).toBe(true);
    expect(
      assertCapability(
        ctxFor(orgPrincipal("manager"), permissions),
        "staff.manage",
      ).ok,
    ).toBe(false);
  });
});

describe("AuthorisationService default-deny", () => {
  it("denies an unresolved capability even when principal has other grants", () => {
    const permissions = resolvePermissions(orgPrincipal("owner"));
    const result = assertCapability(
      ctxFor(orgPrincipal("owner"), permissions),
      "not.a.real.capability",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("permission_denied");
  });

  it("denies when RequestContext.permissions is empty", () => {
    const result = assertCapability(
      ctxFor(orgPrincipal("staff"), []),
      "fulfilment.validate",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("permission_denied");
  });
});

describe("rider and admin capability mapping", () => {
  it("grants rider bundle capabilities", () => {
    const permissions = resolvePermissions(riderPrincipal());
    const ctx = ctxFor(riderPrincipal(), permissions);

    expect(assertCapability(ctx, "rewards.redeem").ok).toBe(true);
    expect(assertCapability(ctx, "rewards.catalog.read").ok).toBe(true);
    expect(assertCapability(ctx, "fulfilment.read").ok).toBe(true);
    expect(assertCapability(ctx, "wallet.read").ok).toBe(true);
    expect(assertCapability(ctx, "staff.manage").ok).toBe(false);
  });

  it("maps admin role to platform capabilities", () => {
    const permissions = resolvePermissions(adminPrincipal("admin"));
    const ctx = ctxFor(adminPrincipal("admin"), permissions);

    expect(assertCapability(ctx, "fulfilment.override").ok).toBe(true);
    expect(assertCapability(ctx, "staff.manage").ok).toBe(true);
    expect(assertCapability(ctx, "rewards.manage").ok).toBe(true);
  });

  it("maps read-only admin roles without write capabilities", () => {
    const permissions = resolvePermissions(
      adminPrincipal("compliance_officer"),
    );
    const ctx = ctxFor(adminPrincipal("compliance_officer"), permissions);

    expect(assertCapability(ctx, "fulfilment.read").ok).toBe(true);
    expect(assertCapability(ctx, "analytics.view").ok).toBe(true);
    expect(assertCapability(ctx, "resources.manage").ok).toBe(false);
    expect(assertCapability(ctx, "fulfilment.override").ok).toBe(false);
  });
});

describe("withPermissions", () => {
  it("attaches resolved capabilities onto RequestContext", () => {
    const bare = ctxFor(orgPrincipal("staff"), []);
    const hydrated = withPermissions(bare);

    expect(hydrated.permissions).toContain("fulfilment.validate");
    expect(hydrated.permissions).not.toContain("resources.manage");
    expect(assertCapability(hydrated, "fulfilment.validate").ok).toBe(true);
  });
});
