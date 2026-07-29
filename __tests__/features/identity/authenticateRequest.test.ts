import { describe, it, expect, vi } from "vitest";
import { authenticateRequest } from "@/features/identity/application/commands/authenticateRequest";
import type {
  AuthenticateRequestDeps,
  AdminUserRecord,
  OrganisationMembershipRecord,
  RiderProfileRecord,
  VerifiedAccessToken,
} from "@/features/identity/application/contracts/AuthenticateRequest";
import { getOrCreateCorrelationId } from "@/lib/http/correlationId";

const USER_ID = "user-111";
const EMAIL = "rider@example.com";

const verified: VerifiedAccessToken = {
  userId: USER_ID,
  email: EMAIL,
};

const adminRow: AdminUserRecord = {
  id: "admin-row-1",
  userId: USER_ID,
  email: "admin@movrr.io",
  role: "admin",
};

const riderRow: RiderProfileRecord = {
  id: "rider-1",
  userId: USER_ID,
};

const membershipRow: OrganisationMembershipRecord = {
  id: "mem-1",
  organisationId: "org-1",
  userId: USER_ID,
  role: "staff",
};

function createDeps(
  overrides: Partial<AuthenticateRequestDeps> = {},
): AuthenticateRequestDeps {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue(verified),
    findAdminUser: vi.fn().mockResolvedValue(null),
    findOrganisationMembership: vi.fn().mockResolvedValue(null),
    findRiderProfile: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("getOrCreateCorrelationId", () => {
  it("returns a non-empty incoming header when provided", () => {
    expect(getOrCreateCorrelationId("corr-from-client")).toBe("corr-from-client");
  });

  it("generates a new id when header is missing or blank", () => {
    const generated = getOrCreateCorrelationId(null);
    expect(generated.length).toBeGreaterThan(0);
    expect(getOrCreateCorrelationId("   ").length).toBeGreaterThan(0);
  });
});

describe("authenticateRequest", () => {
  it("resolves a valid rider JWT to RiderPrincipal", async () => {
    const deps = createDeps({
      findRiderProfile: vi.fn().mockResolvedValue(riderRow),
    });

    const result = await authenticateRequest(
      { accessToken: "valid-jwt", correlationIdHeader: "c-rider" },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.principal).toEqual({
      type: "rider",
      userId: USER_ID,
      email: EMAIL,
      riderId: "rider-1",
    });
    expect(result.value.correlationId).toBe("c-rider");
    expect(result.value.permissions).toEqual([]);
    expect(result.value.audit).toEqual({
      actorUserId: USER_ID,
      actorEmail: EMAIL,
      principalType: "rider",
    });
  });

  it("resolves admin_users row to AdminPrincipal", async () => {
    const deps = createDeps({
      findAdminUser: vi.fn().mockResolvedValue(adminRow),
      findRiderProfile: vi.fn().mockResolvedValue(riderRow),
      findOrganisationMembership: vi.fn().mockResolvedValue(membershipRow),
    });

    const result = await authenticateRequest(
      { accessToken: "valid-jwt", correlationIdHeader: "c-admin" },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.principal).toEqual({
      type: "admin",
      userId: USER_ID,
      email: EMAIL,
      adminUserId: "admin-row-1",
      role: "admin",
    });
    expect(result.value.correlationId).toBe("c-admin");
    expect(result.value.permissions).toEqual([]);
  });

  it("resolves organisation membership to OrganisationPrincipal", async () => {
    const deps = createDeps({
      findOrganisationMembership: vi.fn().mockResolvedValue(membershipRow),
      findRiderProfile: vi.fn().mockResolvedValue(riderRow),
    });

    const result = await authenticateRequest(
      { accessToken: "valid-jwt", correlationIdHeader: "c-org" },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.principal).toEqual({
      type: "organisation",
      userId: USER_ID,
      email: EMAIL,
      organisationId: "org-1",
      membershipId: "mem-1",
      role: "staff",
    });
    expect(result.value.correlationId).toBe("c-org");
    expect(result.value.permissions).toEqual([]);
  });

  it("fails on missing JWT", async () => {
    const deps = createDeps();

    const result = await authenticateRequest({ accessToken: null }, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unauthenticated");
    expect(deps.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("fails on invalid JWT", async () => {
    const deps = createDeps({
      verifyAccessToken: vi.fn().mockResolvedValue(null),
    });

    const result = await authenticateRequest(
      { accessToken: "bad-token" },
      deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unauthenticated");
  });

  it("fails when user has no recognised principal records", async () => {
    const deps = createDeps();

    const result = await authenticateRequest(
      { accessToken: "valid-jwt" },
      deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unrecognised_principal");
  });

  it("ignores client-declared principal type and resolves from DB only", async () => {
    const deps = createDeps({
      findRiderProfile: vi.fn().mockResolvedValue(riderRow),
    });

    const result = await authenticateRequest(
      {
        accessToken: "valid-jwt",
        // Clients must not declare principal type; any such claim is ignored.
        ...( { principalType: "admin" } as object ),
      } as { accessToken: string },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.principal.type).toBe("rider");
    expect(deps.findAdminUser).toHaveBeenCalledWith(USER_ID);
    expect(deps.findOrganisationMembership).toHaveBeenCalledWith(USER_ID);
    expect(deps.findRiderProfile).toHaveBeenCalledWith(USER_ID);
  });

  it("prefers AdminPrincipal over organisation and rider records", async () => {
    const deps = createDeps({
      findAdminUser: vi.fn().mockResolvedValue(adminRow),
      findOrganisationMembership: vi.fn().mockResolvedValue(membershipRow),
      findRiderProfile: vi.fn().mockResolvedValue(riderRow),
    });

    const result = await authenticateRequest(
      { accessToken: "valid-jwt" },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.principal.type).toBe("admin");
  });

  it("prefers OrganisationPrincipal over rider when not admin", async () => {
    const deps = createDeps({
      findOrganisationMembership: vi.fn().mockResolvedValue(membershipRow),
      findRiderProfile: vi.fn().mockResolvedValue(riderRow),
    });

    const result = await authenticateRequest(
      { accessToken: "valid-jwt" },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.principal.type).toBe("organisation");
  });
});
