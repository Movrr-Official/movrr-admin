import { z } from "zod";

export const badgeVariantSchema = z.enum(["warm", "strong", "neutral"]);

export const badgeTierSchema = z.enum(["engagement", "hero"]);

/** Mirrors mobile's RiderHeroBadge + engagement badge definitions */
export const riderBadgeSchema = z.object({
  /** award record ID */
  id: z.string(),
  riderId: z.string(),
  /** Badge definition code, e.g. "first_ride", "hero_week", "rides_50" */
  badgeCode: z.string(),
  badgeLabel: z.string(),
  badgeDescription: z.string().optional(),
  badgeEmoji: z.string().optional(),
  variant: badgeVariantSchema.default("neutral"),
  tier: badgeTierSchema.default("engagement"),
  awardedAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
  /** False if manually revoked */
  isActive: z.boolean().default(true),
  /** Source of the award: "system" | "admin" | "trigger" */
  source: z.string().default("system"),
  /** Admin who revoked, if applicable */
  revokedBy: z.string().optional(),
  revokeReason: z.string().optional(),
});

export type RiderBadge = z.infer<typeof riderBadgeSchema>;
export type BadgeVariant = z.infer<typeof badgeVariantSchema>;
export type BadgeTier = z.infer<typeof badgeTierSchema>;
