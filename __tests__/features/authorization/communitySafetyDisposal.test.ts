import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc: state.rpc, storage: { from: () => ({ remove: state.remove }) } }) }));
import { disposeCommunitySafetyCase } from "@/lib/services/communitySafetyDisposal";
beforeEach(() => {
  vi.resetAllMocks();
  state.rpc.mockImplementation(async (name: string) => ({ data: name === "dispose_community_safety" ? { reports: 1 } : name === "claim_community_cover_disposal" ? ["owner/ride/object.png"] : name === "community_safety_disposal_status" ? { remaining: 0 } : null, error: null }));
  state.remove.mockResolvedValue({ error: null });
});
it("cannot dispatch Storage work without a successful canonical policy preparation", async () => {
  state.rpc.mockResolvedValue({ error: { message: "Approval required" } });
  await expect(disposeCommunitySafetyCase("operation", "case", 1)).rejects.toThrow("approved policy");
  expect(state.remove).not.toHaveBeenCalled();
});
it("does not dispose a held or not-yet-due case", async () => {
  state.rpc.mockResolvedValue({ data: { state: "held" }, error: null });
  expect(await disposeCommunitySafetyCase("operation", "case", 1)).toEqual({ state: "held" });
  expect(state.rpc).toHaveBeenCalledOnce(); expect(state.remove).not.toHaveBeenCalled();
});
it("never confirms an uncertain Storage removal", async () => {
  state.remove.mockResolvedValue({ error: new Error("Uncertain") });
  expect((await disposeCommunitySafetyCase("operation", "case", 1)).state).toBe("pending");
  expect(state.rpc.mock.calls.map(x => x[0])).not.toContain("confirm_community_cover_disposal");
});
it("keeps an unconfirmed removal pending and reuses the original operation on retry", async () => {
  const normal = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(async (name: string, args: unknown) => name === "confirm_community_cover_disposal" ? { error: new Error("Lost confirmation") } : normal(name, args));
  expect((await disposeCommunitySafetyCase("operation", "case", 1)).state).toBe("pending");
  state.rpc.mockImplementation(normal);
  expect((await disposeCommunitySafetyCase("operation", "case", 1)).state).toBe("confirmed");
  expect(state.rpc).toHaveBeenLastCalledWith("community_safety_disposal_status", { p_operation: "operation" });
});
it("does not mistake another worker's live lease for completed disposal", async () => {
  state.rpc.mockImplementation(async (name: string) => ({ data: name === "dispose_community_safety" ? {} : name === "claim_community_cover_disposal" ? [] : { remaining: 1 }, error: null }));
  expect((await disposeCommunitySafetyCase("operation", "case", 1)).state).toBe("pending");
  expect(state.remove).not.toHaveBeenCalled();
});
