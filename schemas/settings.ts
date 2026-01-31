import { z } from "zod";

export const systemSettingsSchema = z.object({
  supportEmail: z.string().email().optional(),
  defaultRegion: z.string().min(2),
  timezone: z.string().min(1),
  appVersion: z.string().min(1).default("1.0.0"),
  maintenanceMode: z.boolean().default(false),
  allowSelfSignup: z.boolean().default(true),
});

export const pointsSettingsSchema = z.object({
  basePointsPerMinute: z.number().int().min(0),
  dailyCap: z.number().int().min(0),
  weeklyCap: z.number().int().min(0),
  campaignMaxRewardCap: z.number().int().min(0),
  minVerifiedMinutes: z.number().int().min(0),
});

export const campaignDefaultsSchema = z.object({
  defaultMultiplier: z.number().min(0),
  defaultDurationDays: z.number().int().min(1),
  defaultSignupDeadlineDays: z.number().int().min(1),
  defaultMaxRiders: z.number().int().min(1),
  requireApproval: z.boolean().default(false),
});

export const featureFlagsSchema = z.object({
  rewardsShopEnabled: z.boolean().default(true),
  routeTemplatesEnabled: z.boolean().default(true),
  autoAssignmentEnabled: z.boolean().default(false),
  realtimeTrackingEnabled: z.boolean().default(true),
  emailNotificationsEnabled: z.boolean().default(true),
});

export const adminSettingsSchema = z.object({
  system: systemSettingsSchema,
  points: pointsSettingsSchema,
  campaignDefaults: campaignDefaultsSchema,
  featureFlags: featureFlagsSchema,
});

export type settings = z.infer<typeof adminSettingsSchema>;
export type systemSettings = z.infer<typeof systemSettingsSchema>;
export type pointsSettings = z.infer<typeof pointsSettingsSchema>;
export type campaignDefaults = z.infer<typeof campaignDefaultsSchema>;
export type featureFlags = z.infer<typeof featureFlagsSchema>;
