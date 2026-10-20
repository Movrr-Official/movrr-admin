import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestContext } from "@/features/identity/domain/Principal";
const { db, createClient } = vi.hoisted(() => ({
  db: { rpc: vi.fn(), from: vi.fn() },
  createClient: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => db,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/env", () => ({
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
}));
import { createSupabaseRequestClient } from "@/lib/supabase-request";
import {
  optInToCampaign,
  withdrawCampaignSignup,
  confirmCampaignParticipation,
  listRiderCampaigns,
} from "@/features/riders/application/riderCampaignService";
import {
  joinCommunityRide,
  leaveCommunityRide,
  createCommunityRide,
} from "@/features/community/application/communityPlatformService";
const ctx = {
  principal: { type: "rider", riderId: "rider", userId: "user" },
} as RequestContext;
const client = db as unknown as SupabaseClient;
beforeEach(() => {
  vi.clearAllMocks();
  db.rpc.mockResolvedValue({ data: { success: true }, error: null });
});
it("forwards the verified request bearer to an anonymous-key client, without a service-role fallback", () => {
  createSupabaseRequestClient(
    new Request("https://example.com", {
      headers: { Authorization: "Bearer rider-jwt" },
    }),
  );
  expect(createClient).toHaveBeenCalledWith(
    "https://example.supabase.co",
    "public-key",
    expect.objectContaining({
      global: { headers: { Authorization: "Bearer rider-jwt" } },
    }),
  );
  expect(() => createSupabaseRequestClient(new Request("https://example.com"))).toThrow();
});
it.each([
  [optInToCampaign, "rider_campaign_opt_in"],
  [withdrawCampaignSignup, "rider_campaign_withdraw"],
  [confirmCampaignParticipation, "rider_campaign_confirm"],
] as const)(
  "calls the campaign contract through the request-scoped client",
  async (action, name) => {
    expect((await action(ctx, "campaign", client)).ok).toBe(true);
    expect(db.rpc).toHaveBeenCalledWith(name, { p_campaign_id: "campaign" });
    expect(db.from).not.toHaveBeenCalled();
  },
);
it.each([joinCommunityRide, leaveCommunityRide])(
  "propagates domain failures instead of returning a successful HTTP envelope",
  async (action) => {
    db.rpc.mockResolvedValue({
      data: { success: false, error: "not_authorized" },
      error: null,
    });
    expect(await action(ctx, "ride", client)).toMatchObject({
      ok: false,
      message: "not_authorized",
    });
  },
);
it("fails closed when community creator eligibility cannot be read", async () => {
  db.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
  expect(
    (
      await createCommunityRide(
        ctx,
        {
          operationId: "11111111-1111-4111-8111-111111111111",
          title: "Ride",
          scheduledAt: "2099-11-01T09:00:00Z",
        },
        client,
      )
    ).ok,
  ).toBe(false);
  expect(db.from).not.toHaveBeenCalled();
});
it("uses the idempotent canonical community creation command", async () => {
  db.rpc.mockResolvedValue({ data: { id: "ride" }, error: null });
  expect(
    (
      await createCommunityRide(
        ctx,
        {
          operationId: "11111111-1111-4111-8111-111111111111",
          title: "Ride",
          scheduledAt: "2099-11-01T09:00:00Z",
          meetingPoint: "Station",
        },
        client,
      )
    ).ok,
  ).toBe(true);
  expect(db.rpc).toHaveBeenCalledWith(
    "create_my_community_ride",
    expect.objectContaining({
      p_input: expect.objectContaining({ meetingPoint: "Station" }),
    }),
  );
  expect(db.from).not.toHaveBeenCalled();
});
it("fails closed on the canonical campaign catalog error without a fallback", async () => {
  db.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
  expect((await listRiderCampaigns(ctx, client)).ok).toBe(false);
  expect(db.rpc).toHaveBeenCalledWith("get_my_campaign_catalog");
  expect(db.from).not.toHaveBeenCalled();
});
