import { describe, it, expect } from "vitest";
import type {
  AuthenticatedPrincipal,
  RequestContext,
} from "@/features/identity/domain/Principal";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import { ok } from "@/lib/result/ApplicationResult";
import {
  createPlatformApiForTests,
  type PlatformApiHandlers,
} from "@/features/platform/infrastructure/composePlatformApi";

function principalFor(
  kind: "rider" | "staff" | "manager" | "owner" | "admin",
): AuthenticatedPrincipal {
  switch (kind) {
    case "rider":
      return {
        type: "rider",
        userId: "user-rider",
        email: "rider@test",
        riderId: "rider-1",
      };
    case "staff":
      return {
        type: "organisation",
        userId: "user-staff",
        email: "staff@test",
        organisationId: "org-1",
        membershipId: "mem-staff",
        role: "staff",
      };
    case "manager":
      return {
        type: "organisation",
        userId: "user-manager",
        email: "manager@test",
        organisationId: "org-1",
        membershipId: "mem-manager",
        role: "manager",
      };
    case "owner":
      return {
        type: "organisation",
        userId: "user-owner",
        email: "owner@test",
        organisationId: "org-1",
        membershipId: "mem-owner",
        role: "owner",
      };
    case "admin":
      return {
        type: "admin",
        userId: "user-admin",
        email: "admin@test",
        adminUserId: "admin-1",
        role: "super_admin",
      };
  }
}

function authDepsFor(principal: AuthenticatedPrincipal): AuthenticateRequestDeps {
  return {
    verifyAccessToken: async () => ({
      userId: principal.userId,
      email: principal.email,
    }),
    findAdminUser: async () =>
      principal.type === "admin"
        ? {
            id: principal.adminUserId,
            userId: principal.userId,
            email: principal.email,
            role: principal.role,
          }
        : null,
    findOrganisationMembership: async () =>
      principal.type === "organisation"
        ? {
            id: principal.membershipId,
            organisationId: principal.organisationId,
            userId: principal.userId,
            role: principal.role,
          }
        : null,
    findRiderProfile: async () =>
      principal.type === "rider"
        ? { id: principal.riderId, userId: principal.userId }
        : null,
  };
}

function request(
  method: string,
  url: string,
  init?: { body?: unknown; idempotencyKey?: string },
): Request {
  const headers = new Headers({
    authorization: "Bearer test-token",
    "content-type": "application/json",
  });
  if (init?.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }
  return new Request(url, {
    method,
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function apiFor(
  kind: "rider" | "staff" | "manager" | "owner" | "admin",
): Promise<PlatformApiHandlers> {
  return createPlatformApiForTests({
    authDeps: authDepsFor(principalFor(kind)),
  });
}

describe("Platform API /api/v1 authz matrix", () => {
  it("rider can redeem, catalog, wallet, fulfilment read; cannot cancel/validate", async () => {
    const api = await apiFor("rider");

    expect((await api.rewards.catalog(request("GET", "http://x/api/v1/rewards/catalog"))).status).toBe(200);
    const redeemRes = await api.rewards.redeem(
      request("POST", "http://x/api/v1/rewards/redeem", {
        body: { catalogItemId: "cat-1" },
        idempotencyKey: "idem-rider-1",
      }),
    );
    // AuthZ allows redeem; without seed/module the service is unavailable (not 401/403).
    expect([200, 422, 503]).toContain(redeemRes.status);
    expect(redeemRes.status).not.toBe(401);
    expect(redeemRes.status).not.toBe(403);
    expect((await api.wallet.balance(request("GET", "http://x/api/v1/wallet/balance"))).status).toBe(200);
    expect(
      (await api.fulfilment.get(request("GET", "http://x/api/v1/fulfilment/f-1"), { id: "f-1" }))
        .status,
    ).toBe(200);
    expect(
      (
        await api.fulfilment.cancel(
          request("POST", "http://x/api/v1/fulfilment/f-1/cancel", {
            body: { reason: "nope" },
            idempotencyKey: "c1",
          }),
          { id: "f-1" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api.partners.validate(
          request("POST", "http://x/api/v1/partners/validate", {
            body: { token: "t" },
            idempotencyKey: "v1",
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("partner staff can validate/confirm/read; cannot redeem, cancel, refund", async () => {
    const api = await apiFor("staff");

    expect((await api.partners.me(request("GET", "http://x/api/v1/partners/me"))).status).toBe(200);
    expect(
      (
        await api.partners.validate(
          request("POST", "http://x/api/v1/partners/validate", {
            body: { token: "tok" },
            idempotencyKey: "v-staff",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await api.fulfilment.confirmCollection(
          request("POST", "http://x/api/v1/fulfilment/f-1/confirm-collection", {
            body: {},
            idempotencyKey: "cf-staff",
          }),
          { id: "f-1" },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await api.rewards.redeem(
          request("POST", "http://x/api/v1/rewards/redeem", {
            body: { catalogItemId: "cat-1" },
            idempotencyKey: "idem-staff",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api.fulfilment.cancel(
          request("POST", "http://x/api/v1/fulfilment/f-1/cancel", {
            body: { reason: "x" },
            idempotencyKey: "c-staff",
          }),
          { id: "f-1" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api.fulfilment.refund(
          request("POST", "http://x/api/v1/fulfilment/f-1/refund", {
            body: { reason: "x" },
            idempotencyKey: "r-staff",
          }),
          { id: "f-1" },
        )
      ).status,
    ).toBe(403);
    expect((await api.wallet.balance(request("GET", "http://x/api/v1/wallet/balance"))).status).toBe(403);
  });

  it("manager and owner can cancel and refund", async () => {
    for (const kind of ["manager", "owner"] as const) {
      const api = await apiFor(kind);
      expect(
        (
          await api.fulfilment.cancel(
            request("POST", "http://x/api/v1/fulfilment/f-1/cancel", {
              body: { reason: "ops" },
              idempotencyKey: `c-${kind}`,
            }),
            { id: "f-1" },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await api.fulfilment.refund(
            request("POST", "http://x/api/v1/fulfilment/f-1/refund", {
              body: { reason: "ops" },
              idempotencyKey: `r-${kind}`,
            }),
            { id: "f-1" },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await api.rewards.redeem(
            request("POST", "http://x/api/v1/rewards/redeem", {
              body: { catalogItemId: "cat-1" },
              idempotencyKey: `idem-${kind}`,
            }),
          )
        ).status,
      ).toBe(403);
    }
  });

  it("admin can list fulfilments for ops and read wallet", async () => {
    const api = await apiFor("admin");
    expect(
      (await api.fulfilment.list(request("GET", "http://x/api/v1/fulfilment?status=ready"))).status,
    ).toBe(200);
    expect((await api.wallet.balance(request("GET", "http://x/api/v1/wallet/balance"))).status).toBe(200);
    expect((await api.rewards.catalog(request("GET", "http://x/api/v1/rewards/catalog"))).status).toBe(200);
  });

  it("unauthenticated requests return 401", async () => {
    const api = await createPlatformApiForTests({
      authDeps: {
        verifyAccessToken: async () => null,
        findAdminUser: async () => null,
        findOrganisationMembership: async () => null,
        findRiderProfile: async () => null,
      },
    });
    const res = await api.wallet.balance(
      new Request("http://x/api/v1/wallet/balance", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });

  it("permission_denied maps to 403 without invoking business handle side effects", async () => {
    let handleCalled = false;
    const api = await createPlatformApiForTests({
      authDeps: authDepsFor(principalFor("rider")),
      hooks: {
        onFulfilmentCancel: async (_ctx: RequestContext) => {
          handleCalled = true;
          return ok({ cancelled: true });
        },
      },
    });
    const res = await api.fulfilment.cancel(
      request("POST", "http://x/api/v1/fulfilment/f-1/cancel", {
        body: { reason: "x" },
        idempotencyKey: "guard",
      }),
      { id: "f-1" },
    );
    expect(res.status).toBe(403);
    expect(handleCalled).toBe(false);
  });
});
