/** Partner business classification v1. Mirrored across Admin/Mobile; parity is verified. */
export const PARTNER_BUSINESS_CATEGORIES = [
  "restaurant", "cafe", "bicycle-shop", "bookstore", "retail", "fitness",
  "experiences", "accommodation",
] as const;
export type PartnerBusinessCategory = (typeof PARTNER_BUSINESS_CATEGORIES)[number];
export const PARTNER_BUSINESS_CATEGORY_LABELS: Record<PartnerBusinessCategory, string> = {
  restaurant: "Restaurant", cafe: "Café", "bicycle-shop": "Bicycle shop",
  bookstore: "Bookstore", retail: "Retail", fitness: "Fitness",
  experiences: "Experiences", accommodation: "Accommodation",
};
export function isPartnerBusinessCategory(value: unknown): value is PartnerBusinessCategory {
  return typeof value === "string" && PARTNER_BUSINESS_CATEGORIES.some(category => category === value);
}
