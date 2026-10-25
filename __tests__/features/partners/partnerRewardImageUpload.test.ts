import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), row: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rewardCatalogImage", () => ({ uploadRewardCatalogThumbnail: state.upload, deleteRewardCatalogImage: state.remove }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ from: state.from, rpc: state.rpc }) }));
import { createPartnerCatalogItem, updatePartnerCatalogItem, readPartnerCatalogRequest } from "@/features/rewards/application/partnerCatalogCommands";
import type { RequestContext } from "@/features/identity/domain/Principal";
const version = "2026-10-25T12:00:00.000Z";
const ctx: RequestContext = { principal: { type: "organisation", organisationType: "reward_partner", organisationId: "tenant", userId: "actor", email: null, membershipId: "membership" }, permissions: ["rewards.manage"], correlationId: "test", audit: { actorUserId: "actor", actorEmail: null, principalType: "organisation" } };
const png = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "image.png", { type: "image/png" });
beforeEach(() => {
  vi.resetAllMocks();
  state.row.mockResolvedValue({ data: { partner_id: "partner", updated_at: version } });
  state.from.mockImplementation(table => { const query = { select: () => query, eq: () => query, maybeSingle: table === "reward_partner" ? async () => ({ data: { id: "partner" } }) : state.row }; return query; });
  state.upload.mockResolvedValue({ path: "new-owned-object", publicUrl: "https://storage.example/new.png" });
  state.rpc.mockResolvedValue({ data: { id: "reward", updated_at: version }, error: null });
});
it("saves uploaded media and edited details in one canonical version-checked update", async () => {
  expect((await updatePartnerCatalogItem(ctx, "reward", { expectedUpdatedAt: version, title: "New title" }, { file: png() })).ok).toBe(true);
  expect(state.rpc).toHaveBeenCalledWith("shop_save_catalog", expect.objectContaining({ p_actor: "actor", p_id: "reward", p_expected: version, p_payload: expect.objectContaining({ title: "New title", thumbnail_url: "https://storage.example/new.png" }) }));
  expect(state.remove).not.toHaveBeenCalled();
});
it.each(["foreign", "stale"])("denies %s ownership/version before storage upload", async mode => {
  state.row.mockResolvedValue({ data: { partner_id: mode === "foreign" ? "other" : "partner", updated_at: mode === "stale" ? "old" : version } });
  expect((await updatePartnerCatalogItem(ctx, "reward", { expectedUpdatedAt: version }, { file: png() })).ok).toBe(false);
  expect(state.upload).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
});
it.each([new File(["spoof"], "image.png", { type: "image/png" }), new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })])("rejects invalid media before creating a draft", async file => {
  expect((await createPartnerCatalogItem(ctx, { title: "Reward", pointsCost: 0 }, { file })).ok).toBe(false);
  expect(state.rpc).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
});
it("removes only the new upload when canonical save rejects a concurrent change", async () => {
  state.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Catalog changed" } });
  expect(await updatePartnerCatalogItem(ctx, "reward", { expectedUpdatedAt: version }, { file: png() })).toMatchObject({ ok: false, kind: "ConcurrencyConflict" });
  expect(state.remove).toHaveBeenCalledExactlyOnceWith("new-owned-object");
});
it("keeps a created draft recoverable when its image upload fails", async () => {
  state.upload.mockRejectedValue(new Error("Storage unavailable"));
  expect(await createPartnerCatalogItem(ctx, { title: "Reward", pointsCost: 0 }, { file: png() })).toMatchObject({ ok: true, value: { id: "reward", imageUploadFailed: true } });
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
it("clears the URL through the canonical command without deleting shared gallery assets", async () => {
  await updatePartnerCatalogItem(ctx, "reward", { expectedUpdatedAt: version }, { remove: true });
  expect(state.rpc).toHaveBeenCalledWith("shop_save_catalog", expect.objectContaining({ p_payload: expect.objectContaining({ thumbnail_url: null }) }));
  expect(state.remove).not.toHaveBeenCalled();
});
it("reads binary multipart payload without accepting a caller-supplied image URL", async () => {
  const form = new FormData(); form.set("payload", JSON.stringify({ title: "Reward", pointsCost: 0 })); form.set("imageFile", png());
  const parsed = await readPartnerCatalogRequest(new Request("https://example.test", { method: "POST", body: form }));
  expect(parsed.media?.file?.size).toBe(12); expect(parsed.body).toEqual({ title: "Reward", pointsCost: 0 });
  expect((await createPartnerCatalogItem(ctx, { title: "Reward", pointsCost: 0, thumbnail_url: "https://foreign.example" })).ok).toBe(false);
});
