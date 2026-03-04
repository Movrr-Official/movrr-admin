import { z } from "zod";
import { userStatusSchema } from "./user";

export const advertiserStatusDerivedSchema = userStatusSchema;
export const advertiserLanguageSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Language must be a locale code")
  .default("en");
export const advertiserTimezoneSchema = z.string().min(1).max(100).default("UTC");

export const advertiserOptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyName: z.string(),
  label: z.string(),
  email: z.string().email().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
});

export const advertiserSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyName: z.string(),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  logoUrl: z.string().url().optional(),
  industry: z.string().optional(),
  language: advertiserLanguageSchema,
  timezone: advertiserTimezoneSchema,
  emailNotifications: z.boolean().optional(),
  campaignUpdates: z.boolean().optional(),
  verified: z.boolean(),
  budget: z.number().min(0),
  totalCampaigns: z.number().int().min(0),
  activeCampaigns: z.number().int().min(0),
  totalImpressions: z.number().int().min(0),
  ridersEngaged: z.number().int().min(0),
  status: advertiserStatusDerivedSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const advertiserFiltersSchema = z.object({
  searchQuery: z.string().optional(),
  status: z.enum(["all", "active", "inactive", "pending"]).optional(),
  industry: z.string().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
  dateRange: z
    .object({
      from: z.date().optional(),
      to: z.date().optional(),
    })
    .optional(),
});

export const createAdvertiserSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  contactName: z.string().min(1, "Contact name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  website: z.string().optional(),
  logoUrl: z.string().url().optional(),
  industry: z.string().optional(),
  language: advertiserLanguageSchema.optional(),
  timezone: advertiserTimezoneSchema.optional(),
  emailNotifications: z.boolean().optional(),
  campaignUpdates: z.boolean().optional(),
  budget: z.number().min(0).optional(),
  sendWelcomeEmail: z.boolean().default(true),
  status: advertiserStatusDerivedSchema.default("active"),
});

export const updateAdvertiserSchema = z.object({
  id: z.string(),
  companyName: z.string().min(2).optional(),
  contactName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  logoUrl: z.string().url().optional(),
  industry: z.string().optional(),
  language: advertiserLanguageSchema.optional(),
  timezone: advertiserTimezoneSchema.optional(),
  emailNotifications: z.boolean().optional(),
  campaignUpdates: z.boolean().optional(),
  budget: z.number().min(0).optional(),
  status: advertiserStatusDerivedSchema.optional(),
  verified: z.boolean().optional(),
});

export const deleteAdvertiserSchema = z.object({
  id: z.string(),
});

export type AdvertiserStatusDerived = z.infer<
  typeof advertiserStatusDerivedSchema
>;
export type AdvertiserOption = z.infer<typeof advertiserOptionSchema>;
export type Advertiser = z.infer<typeof advertiserSchema>;
export type AdvertiserFiltersSchema = z.infer<typeof advertiserFiltersSchema>;
export type CreateAdvertiserInput = z.infer<typeof createAdvertiserSchema>;
export type UpdateAdvertiserInput = z.infer<typeof updateAdvertiserSchema>;
