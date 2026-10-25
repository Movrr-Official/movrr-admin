import { beforeEach, expect, it, vi } from "vitest";
const { db, query } = vi.hoisted(() => ({ db: { from: vi.fn(), rpc: vi.fn() }, query: { select: vi.fn(), order: vi.fn(), eq: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => db }));
import { listFulfilmentResources } from "@/features/fulfilment/infrastructure/supabaseVoucherPoolResourceProvider";
beforeEach(() => {
  vi.clearAllMocks();
  db.from.mockReturnValue(query); query.select.mockReturnValue(query); query.order.mockReturnValue(query);
  db.rpc.mockResolvedValue({ data: 4, error: null });
});
it("reads the linked catalog thumbnail only within the merchant boundary", async () => {
  query.eq.mockResolvedValue({ data: [
    { id: "pool", name: "Pool", partner_org_id: "merchant", catalog: { thumbnail_url: "https://images.example/own.jpg", partner: { organisation_id: "merchant" } } },
    { id: "foreign-link", partner_org_id: "merchant", catalog: { thumbnail_url: "https://images.example/other.jpg", partner: { organisation_id: "other" } } },
    { id: "missing", partner_org_id: "merchant", catalog: null },
  ], error: null });
  const result = await listFulfilmentResources({ partnerOrgId: "merchant" });
  expect(query.eq).toHaveBeenCalledWith("partner_org_id", "merchant");
  expect(query.select).toHaveBeenCalledWith(expect.stringContaining("catalog:reward_catalog!catalog_item_id(thumbnail_url, partner:reward_partner!partner_id(organisation_id))"));
  expect(result.map(row => row.thumbnailUrl)).toEqual(["https://images.example/own.jpg", null, null]);
  expect(result[0].availableCount).toBe(4);
  expect(db.rpc).toHaveBeenCalledWith("shop_resource_available_count", { p_resource: "pool" });
});
it("propagates read failures instead of inventing inventory", async () => {
  query.eq.mockResolvedValue({ data: null, error: { message: "unavailable" } });
  await expect(listFulfilmentResources({ partnerOrgId: "merchant" })).rejects.toThrow("unavailable");
  expect(db.rpc).not.toHaveBeenCalled();
});
