import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import { isRiderOwnedApiPath } from "@/lib/pathMatch";

// Actual route modules, platformRoute and authenticateRequest; only identity lookups are stubbed.
const identity = vi.hoisted(() => ({
  admin: null as null | { id: string; userId: string; email: null; role: string },
  membership: null as null | { id: string; organisationId: string; userId: string; role: string; organisationType: "reward_partner" },
  rider: null as null | { id: string; userId: string },
  campaignPrincipal: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/platform/infrastructure/productionPlatformApi", () => ({
  productionAuthDeps: {
    verifyAccessToken: async () => ({ userId: "u1", email: null }),
    findAdminUser: async () => identity.admin,
    findOrganisationMembership: async () => identity.membership,
    findRiderProfile: async () => identity.rider,
  } satisfies AuthenticateRequestDeps,
}));
vi.mock("@/lib/supabase-request", () => ({ createSupabaseRequestClient: () => ({}) }));
vi.mock("@/features/riders/application/riderCampaignService", () => {
  const capture = async (ctx: { principal: { type: string } }) => {
    identity.campaignPrincipal(ctx.principal.type);
    return ctx.principal.type === "rider" ? { ok: true, value: [] } : { ok: false, kind: "permission_denied", message: "Rider principal required" };
  };
  return { listRiderCampaigns: capture, optInToCampaign: capture, confirmCampaignParticipation: capture, withdrawCampaignSignup: capture };
});
import { GET as listCampaigns } from "@/app/api/v1/riders/me/campaigns/route";
import { GET as riderFeature } from "@/app/api/v1/riders/me/[feature]/route";
import { POST as cancelCommunityRide } from "@/app/api/v1/community-rides/[id]/cancel/route";

const request = (path: string, method = "GET") =>
  new Request(`https://admin.movrr.test${path}`, { method, headers: { authorization: "Bearer valid" }, ...(method === "POST" ? { body: "{}" } : {}) });
const call = {
  campaigns: () => listCampaigns(request("/api/v1/riders/me/campaigns")),
  // An unknown feature proves the Rider principal reached the handler (404), not a principal denial (403).
  selfService: () => riderFeature(request("/api/v1/riders/me/unknown"), { params: Promise.resolve({ feature: "unknown" }) }),
  // Without a ride version the handler answers 400 only after accepting the Rider principal.
  community: () => cancelCommunityRide(request("/api/v1/community-rides/not-a-uuid/cancel", "POST"), { params: Promise.resolve({ id: "not-a-uuid" }) }),
};
const riderStatus = { campaigns: 200, selfService: 404, community: 400 } as const;
const employee = { id: "a1", userId: "u1", email: null, role: "support_agent" } as const; // holds rewards.catalog.read
const partnerOwner = { id: "m1", organisationId: "o1", userId: "u1", role: "owner", organisationType: "reward_partner" } as const;

beforeEach(() => {
  identity.admin = null;
  identity.membership = null;
  identity.rider = null;
  identity.campaignPrincipal.mockReset();
});

describe("Rider-owned API principal resolution", () => {
  for (const [name, invoke] of Object.entries(call) as Array<[keyof typeof call, () => Promise<Response>]>) {
    it(`${name}: a Rider who is also Staff acts as the Rider`, async () => {
      identity.admin = { ...employee };
      identity.rider = { id: "r1", userId: "u1" };
      expect((await invoke()).status).toBe(riderStatus[name]);
    });
    it(`${name}: a Rider who is also an organisation member acts as the Rider`, async () => {
      identity.membership = { ...partnerOwner };
      identity.rider = { id: "r1", userId: "u1" };
      expect((await invoke()).status).toBe(riderStatus[name]);
    });
    it(`${name}: Staff without an active Rider profile are denied`, async () => {
      identity.admin = { ...employee };
      expect((await invoke()).status).toBe(403);
    });
    it(`${name}: organisation members without an active Rider profile are denied`, async () => {
      identity.membership = { ...partnerOwner };
      expect((await invoke()).status).toBe(403);
    });
    it(`${name}: a User without an active Rider profile or relationship is denied`, async () => {
      expect((await invoke()).status).toBe(403);
    });
  }

  it("selects the Rider principal for campaign handlers instead of the Staff principal", async () => {
    identity.admin = { ...employee };
    identity.rider = { id: "r1", userId: "u1" };
    await call.campaigns();
    expect(identity.campaignPrincipal).toHaveBeenCalledWith("rider");
  });

  it("limits Rider preference to Rider-owned paths", () => {
    for (const path of ["/api/v1/rewards", "/api/v1/rewards/catalog", "/api/v1/rewards/redemptions/x", "/api/v1/riders/me/rides",
      "/api/v1/riders/me/campaigns/opt-in", "/api/v1/community-rides", "/api/v1/community-rides/x/join"])
      expect(isRiderOwnedApiPath(path)).toBe(true);
    for (const path of ["/api/v1/organisations", "/api/v1/partners/rewards", "/api/v1/fulfilment/x", "/api/v1/wallet/balance",
      "/api/v1/campaigns", "/api/v1/riders/meta", "/api/v1/rewardsx", "/api/v1/community-ridesx"])
      expect(isRiderOwnedApiPath(path)).toBe(false);
  });
});
