import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: (...args: unknown[]) => state.authorize(...args) }));
vi.mock("@/lib/userActivity", () => ({ writeUserActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/activitySignals", () => ({ fetchLatestUserActivitySignalMap: vi.fn(), resolveLatestIsoTimestamp: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: (...args: unknown[]) => state.rpc(...args),
    from: (table: string) => {
      const query = {
        select: () => query,
        in: () => Promise.resolve({ data: [{ id: "r1", user_id: "u1" }], error: null }),
        eq: () => query,
        single: async () => ({ data: { id: "r1", user_id: "u1" }, error: null }),
        update: (values: Record<string, unknown>) => {
          state.updates.push({ table, values });
          return { eq: async () => ({ error: null }), in: async () => ({ error: null }) };
        },
      };
      return query;
    },
  }),
}));
import { bulkUpdateRiderStatus, updateRiderProfile } from "@/app/actions/riders";

beforeEach(() => {
  vi.clearAllMocks();
  state.updates = [];
  state.authorize.mockResolvedValue({ authUser: { id: "staff-1" } });
  state.rpc.mockResolvedValue({ data: { changed: true, status: "suspended", previous: "active" }, error: null });
});

describe("Rider status changes", () => {
  it("changes status only through the atomic command with the current status", async () => {
    await expect(bulkUpdateRiderStatus([{ id: "r1", expectedStatus: "active" }], "inactive"))
      .resolves.toEqual({ success: true, updated: 1, failed: 0 });
    expect(state.authorize).toHaveBeenCalledWith("riders.manage", { mutation: true });
    expect(state.rpc).toHaveBeenCalledWith("admin_set_rider_status", expect.objectContaining({
      p_actor: "staff-1", p_rider: "r1", p_active: false, p_expected_active: true, p_bulk: true,
    }));
    expect(state.updates.filter(update => update.table === "rider")).toEqual([]);
  });

  it("reports stale, unauthorized and failed changes instead of false success", async () => {
    state.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "40001", message: "Rider status changed; reload before saving" } })
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Unauthorized Rider status change" } })
      .mockResolvedValueOnce({ data: { changed: true, status: "active" }, error: null });
    const result = await bulkUpdateRiderStatus([
      { id: "r1", expectedStatus: "inactive" }, { id: "r2", expectedStatus: "inactive" }, { id: "r3", expectedStatus: "inactive" },
    ], "active");
    expect(result).toMatchObject({ success: false, updated: 1, failed: 2 });
    expect(result.error).toMatch(/reload/i);
  });

  it("does not run the command when the actor lacks riders.manage", async () => {
    state.authorize.mockRejectedValue(new Error("Forbidden"));
    await expect(bulkUpdateRiderStatus([{ id: "r1", expectedStatus: "active" }], "inactive"))
      .resolves.toMatchObject({ success: false, updated: 0, failed: 1 });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects statuses that a Rider profile cannot hold", async () => {
    await expect(updateRiderProfile({ id: "r1", status: "pending", expectedStatus: "active" }))
      .resolves.toMatchObject({ success: false });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("Rider profile edits", () => {
  it("writes only existing Rider columns and routes a status change through the command", async () => {
    await expect(updateRiderProfile({ id: "r1", city: "Utrecht", status: "inactive", expectedStatus: "active" }))
      .resolves.toEqual({ success: true });
    const rider = state.updates.find(update => update.table === "rider")!;
    expect(rider.values).toEqual({ city: "Utrecht" });
    expect(state.rpc).toHaveBeenCalledWith("admin_set_rider_status", expect.objectContaining({ p_rider: "r1", p_active: false, p_expected_active: true, p_bulk: false }));
  });

  it("leaves status untouched when it is unchanged", async () => {
    await expect(updateRiderProfile({ id: "r1", city: "Utrecht", status: "active", expectedStatus: "active" }))
      .resolves.toEqual({ success: true });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
