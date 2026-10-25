import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rewardCatalogImage", () => ({ uploadRewardCatalogThumbnail: vi.fn(), deleteRewardCatalogImage: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: vi.fn() }));
import { partnerCatalogCreateSchema, partnerCatalogUpdateSchema } from "@/features/rewards/application/partnerCatalogCommands";
it.each([undefined, null, "", "0", -1, 1.5])("never converts missing/invalid partner price %s to Free", pointsCost => {
  expect(partnerCatalogCreateSchema.safeParse({ title: "Voucher", pointsCost }).success).toBe(false);
});
it("supports an explicit free partner draft", () => {
  expect(partnerCatalogCreateSchema.parse({ title: "Free voucher", pointsCost: 0 }).pointsCost).toBe(0);
});
it("requires the partner operator's viewed version and denies unknown authority fields", () => {
  expect(partnerCatalogUpdateSchema.safeParse({ pointsCost: 0 }).success).toBe(false);
  expect(partnerCatalogUpdateSchema.safeParse({ pointsCost: 0, expectedUpdatedAt: "2026-10-19T10:00:00.000Z" }).success).toBe(true);
  expect(partnerCatalogUpdateSchema.safeParse({ expectedUpdatedAt: "2026-10-19T10:00:00.000Z", partner_id: "foreign" }).success).toBe(false);
});
