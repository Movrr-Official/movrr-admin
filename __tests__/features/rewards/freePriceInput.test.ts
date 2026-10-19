import { expect, it } from "vitest";
import { rewardPointsInputSchema, upsertRewardCatalogSchema } from "@/schemas/rewardCatalog";
it.each([0, "0", 40])("accepts an explicit price %s, including Free", value => {
  expect(rewardPointsInputSchema.parse(value)).toBe(Number(value));
});
it.each(["", " ", null, undefined, -1, 1.5, "abc", Infinity])("does not turn missing/invalid input %s into a free reward", value => {
  expect(rewardPointsInputSchema.safeParse(value).success).toBe(false);
});
const draft = { sku: "FREE", title: "Free reward", category: "voucher", status: "draft" };
it("accepts explicit zero at the authoritative Admin command schema", () => {
  expect(upsertRewardCatalogSchema.parse({ ...draft, pointsPrice: 0 }).pointsPrice).toBe(0);
});
it("requires a price on the Admin command rather than defaulting to zero", () => {
  expect(upsertRewardCatalogSchema.safeParse(draft).success).toBe(false);
});
it("requires the operator-viewed version when editing either free or paid rewards", () => {
  expect(upsertRewardCatalogSchema.safeParse({ ...draft, id: "existing", pointsPrice: 0 }).success).toBe(false);
  expect(upsertRewardCatalogSchema.safeParse({ ...draft, id: "existing", pointsPrice: 40, expectedUpdatedAt: "2026-10-19T10:00:00.000Z" }).success).toBe(true);
});
