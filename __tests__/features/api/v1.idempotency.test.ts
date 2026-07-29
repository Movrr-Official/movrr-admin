import { describe, it, expect } from "vitest";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import { createPlatformApiForTests } from "@/features/platform/infrastructure/composePlatformApi";

const authDeps: AuthenticateRequestDeps = {
  verifyAccessToken: async () => ({
    userId: "user-rider",
    email: "rider@test",
  }),
  findAdminUser: async () => null,
  findOrganisationMembership: async () => null,
  findRiderProfile: async () => ({ id: "rider-1", userId: "user-rider" }),
};

function redeemRequest(idempotencyKey: string, catalogItemId = "cat-instant-1") {
  return new Request("http://x/api/v1/rewards/redeem", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ catalogItemId }),
  });
}

describe("Platform API /api/v1 idempotency", () => {
  it("POST /rewards/redeem replays same success payload for duplicate Idempotency-Key", async () => {
    const api = await createPlatformApiForTests({
      authDeps,
      seed: {
        balance: 100,
        catalog: [
          {
            id: "cat-instant-1",
            sku: "INSTANT-1",
            title: "Code",
            status: "active",
            fulfilmentType: "instant_digital",
            pointsPrice: 40,
            resourceId: "res-gen-1",
            partnerOrgId: null,
          },
        ],
      },
    });

    const first = await api.rewards.redeem(redeemRequest("same-key-1"));
    const second = await api.rewards.redeem(redeemRequest("same-key-1"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const body1 = await first.json();
    const body2 = await second.json();
    expect(body2.data.redemption.id).toBe(body1.data.redemption.id);
    expect(body2.data.fulfilment.id).toBe(body1.data.fulfilment.id);

    const balanceRes = await api.wallet.balance(
      new Request("http://x/api/v1/wallet/balance", {
        method: "GET",
        headers: { authorization: "Bearer test-token" },
      }),
    );
    const balanceBody = await balanceRes.json();
    expect(balanceBody.data.balance).toBe(60);
  });

  it("missing Idempotency-Key on redeem returns 400 validation", async () => {
    const api = await createPlatformApiForTests({ authDeps });
    const res = await api.rewards.redeem(
      new Request("http://x/api/v1/rewards/redeem", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ catalogItemId: "cat-instant-1" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.kind).toBe("validation");
  });

  it("maps ConcurrencyConflict to 409", async () => {
    const api = await createPlatformApiForTests({
      authDeps: {
        verifyAccessToken: async () => ({
          userId: "user-admin",
          email: "admin@test",
        }),
        findAdminUser: async () => ({
          id: "admin-1",
          userId: "user-admin",
          email: "admin@test",
          role: "super_admin",
        }),
        findOrganisationMembership: async () => null,
        findRiderProfile: async () => null,
      },
      hooks: {
        onFulfilmentCancel: async () => ({
          ok: false as const,
          kind: "ConcurrencyConflict",
          message: "version mismatch",
        }),
      },
    });

    const res = await api.fulfilment.cancel(
      new Request("http://x/api/v1/fulfilment/f-1/cancel", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          "Idempotency-Key": "cancel-1",
        },
        body: JSON.stringify({ reason: "race" }),
      }),
      { id: "f-1" },
    );
    expect(res.status).toBe(409);
  });
});
