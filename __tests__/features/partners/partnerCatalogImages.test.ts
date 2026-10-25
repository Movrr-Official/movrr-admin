import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: { from: vi.fn() }, partner: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }, catalog: { select: vi.fn(), eq: vi.fn(), order: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => state.db }));
import { createSupabaseCatalogRepository } from "@/features/rewards/infrastructure/supabaseCatalogRepository";
beforeEach(() => {
  vi.clearAllMocks();
  state.db.from.mockImplementation(table => table === "reward_partner" ? state.partner : state.catalog);
  state.partner.select.mockReturnValue(state.partner); state.partner.eq.mockReturnValue(state.partner);
  state.partner.maybeSingle.mockResolvedValue({ data: { id: "partner", organisation_id: "tenant" }, error: null });
  state.catalog.select.mockReturnValue(state.catalog); state.catalog.eq.mockReturnValue(state.catalog);
  state.catalog.order.mockResolvedValue({ data: [{ id: "reward", title: "Coffee", sku: "coffee", status: "draft", partner_id: "partner", points_price: 0, inventory_count: 0, thumbnail_url: "https://images.example/coffee.jpg" }], error: null });
});
it("includes the existing image while keeping the catalog read scoped and Free/zero stock intact", async () => {
  const rows = await createSupabaseCatalogRepository().listForPartner("tenant");
  expect(state.partner.eq).toHaveBeenCalledWith("organisation_id", "tenant");
  expect(state.catalog.eq).toHaveBeenCalledWith("partner_id", "partner");
  expect(state.catalog.select).toHaveBeenCalledWith(expect.stringContaining("thumbnail_url"));
  expect(rows[0]).toMatchObject({ thumbnailUrl: "https://images.example/coffee.jpg", partnerOrgId: "tenant", pointsPrice: 0, inventoryCount: 0 });
});
it("returns no catalog when the organisation has no canonical merchant binding", async () => {
  state.partner.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await createSupabaseCatalogRepository().listForPartner("tenant")).toEqual([]);
  expect(state.catalog.select).not.toHaveBeenCalled();
});
