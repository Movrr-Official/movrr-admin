import { z } from "zod";
import {
  FULFILMENT_TYPES,
  type FulfilmentType,
} from "@/features/fulfilment/domain/Fulfilment";
import { SUPPORTED_REDEEM_FULFILMENT_TYPES } from "@/features/rewards/application/contracts/RedeemRewardCommand";

export const rewardCatalogStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "archived",
]);

export const rewardInventoryTypeSchema = z.enum(["unlimited", "limited"]);

export const fulfilmentTypeSchema = z.enum(FULFILMENT_TYPES);

export const rewardCatalogSchema = z.object({
  id: z.string(),
  sku: z.string(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string(),
  status: rewardCatalogStatusSchema,
  pointsPrice: z.number(),
  partnerId: z.string().optional(),
  partnerName: z.string().optional(),
  partnerUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  galleryUrls: z.array(z.string()).default([]),
  inventoryType: rewardInventoryTypeSchema,
  inventoryCount: z.number().optional(),
  maxPerRider: z.number().optional(),
  featuredRank: z.number().optional(),
  isFeatured: z.boolean().default(false),
  visibilityRules: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  fulfilmentType: fulfilmentTypeSchema.nullable().optional(),
  resourceId: z.string().nullable().optional(),
  publishedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const rewardCatalogFiltersSchema = z.object({
  status: rewardCatalogStatusSchema.optional(),
  category: z.string().optional(),
  searchQuery: z.string().optional(),
  featured: z.boolean().optional(),
});

export const upsertRewardCatalogSchema = z
  .object({
    id: z.string().optional(),
    sku: z.string().min(3),
    title: z.string().min(3),
    description: z.string().optional(),
    category: z.string().min(1),
    status: rewardCatalogStatusSchema.optional(),
    pointsPrice: z.number().int().min(0),
    partnerName: z.string().optional(),
    partnerUrl: z.string().url().optional(),
    thumbnailUrl: z.string().url().optional(),
    galleryUrls: z.array(z.string().url()).optional(),
    inventoryType: rewardInventoryTypeSchema.optional(),
    inventoryCount: z.number().int().min(0).optional(),
    maxPerRider: z.number().int().min(1).optional(),
    featuredRank: z.number().int().optional(),
    isFeatured: z.boolean().optional(),
    visibilityRules: z.record(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    fulfilmentType: fulfilmentTypeSchema.nullable().optional(),
    resourceId: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const status = value.status ?? "draft";
    if (status === "active" && !value.fulfilmentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fulfilmentType"],
        message: "Active catalog items require a fulfilment_type.",
      });
    }
    if (
      status === "active" &&
      value.fulfilmentType &&
      !SUPPORTED_REDEEM_FULFILMENT_TYPES.includes(
        value.fulfilmentType as (typeof SUPPORTED_REDEEM_FULFILMENT_TYPES)[number],
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fulfilmentType"],
        message:
          "This fulfilment type is not supported for redeem yet. Choose Instant Digital or QR / Barcode, or keep the item as draft.",
      });
    }
    if (status === "active" && !value.resourceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resourceId"],
        message: "Active catalog items require a resource binding.",
      });
    }
  });

export type RewardCatalogItem = z.infer<typeof rewardCatalogSchema>;
export type RewardCatalogFilters = z.infer<typeof rewardCatalogFiltersSchema>;
export type UpsertRewardCatalogInput = z.infer<
  typeof upsertRewardCatalogSchema
>;
export type RewardCatalogStatus = z.infer<typeof rewardCatalogStatusSchema>;
export type RewardInventoryType = z.infer<typeof rewardInventoryTypeSchema>;
export type RewardCatalogFulfilmentType = FulfilmentType;
