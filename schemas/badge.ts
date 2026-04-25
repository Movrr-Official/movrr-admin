import { z } from "zod";

export const badgeTintSchema = z.enum(["warm", "brand", "neutral", "strong"]);
export const badgeCategorySchema = z.enum(["milestone", "trophy", "engagement", "hero"]);

export const riderBadgeSchema = z.object({
  /** award record ID */
  id: z.string(),
  riderId: z.string(),
  badgeDefinitionId: z.string(),
  badgeCode: z.string(),
  badgeLabel: z.string(),
  badgeDescription: z.string().optional(),
  tint: badgeTintSchema.default("neutral"),
  category: badgeCategorySchema.default("milestone"),
  icon: z.string().optional(),
  iconFamily: z.string().optional(),
  awardedAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
  source: z.string().default("system_rule"),
  revokeReason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type RiderBadge = z.infer<typeof riderBadgeSchema>;
export type BadgeTint = z.infer<typeof badgeTintSchema>;
export type BadgeCategory = z.infer<typeof badgeCategorySchema>;
