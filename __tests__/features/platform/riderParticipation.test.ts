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
  expect(() =>
    createSupabaseRequestClient(new Request("https://example.com")),
  ).toThrow();
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
        { title: "Ride", scheduledAt: "2026-11-01" },
        client,
      )
    ).ok,
  ).toBe(false);
  expect(db.from).not.toHaveBeenCalled();
});
it("writes production community column names and binds the authenticated organizer", async () => {
  db.rpc.mockResolvedValue({ data: true, error: null });
  const query = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data: { id: "ride" }, error: null })),
  };
  query.insert.mockReturnValue(query);
  query.select.mockReturnValue(query);
  db.from.mockReturnValue(query);
  expect(
    (
      await createCommunityRide(
        ctx,
        { title: "Ride", scheduledAt: "2026-11-01", meetingPoint: "Station" },
        client,
      )
    ).ok,
  ).toBe(true);
  expect(query.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      organizer_rider_id: "rider",
      organizer_user_id: "user",
      created_by_user_id: "user",
      organizer_type: "rider",
      meeting_point_name: "Station",
    }),
  );
});
it("does not replace a failed rider campaign read with unrelated open campaigns", async () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(async () => ({
      data: null,
      error: { message: "unavailable" },
    })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  db.from.mockReturnValue(query);
  expect((await listRiderCampaigns(ctx)).ok).toBe(false);
  expect(db.from).toHaveBeenCalledTimes(1);
});
