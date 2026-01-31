import { z } from "zod";
import { statCardSchema } from "./dashboard";

export const campaignStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
]);

export const campaignTypeSchema = z.enum(["destination_ride", "swarm"]);

const engagementByCitySchema = z.object({
  city: z.string(),
  engagement: z.number(),
  campaigns: z.number(),
});

const dailyImpressionsSchema = z.object({
  date: z.string(),
  impressions: z.number(),
});

const riderAllocationSchema = z.object({
  name: z.string(),
  value: z.number(),
  color: z.string(), // hex color or any valid CSS color string
});

export const campaignSchema = z.object({
  id: z.string(),
  advertiserId: z.string(),
  name: z.string().min(1),
  brand: z.string().optional(),
  description: z.string(),
  status: campaignStatusSchema,
  budget: z.number().min(0),
  spent: z.number().min(0),
  startDate: z.string(),
  endDate: z.string(),
  impressionGoal: z.number().min(0),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  roi: z.number(),
  progress: z.number().min(0).max(100),
  campaignType: campaignTypeSchema,
  targetZones: z.array(z.string()),
  targetAudience: z.string(),
  vehicleTypeRequired: z.enum(["bike", "e-bike", "cargo-bike"]),
  ridersAssigned: z.array(z.string()),
  daysActive: z.array(z.string()),
  hoursActive: z.array(
    z.object({
      start: z.string(), // "HH:mm"
      end: z.string(),
    }),
  ),
  assets: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["image", "video"]),
      url: z.string().url(),
      altText: z.string().max(100).optional(),
    }),
  ),
  deliveryMode: z.enum(["manual", "automated"]),
  creativeAssets: z.array(z.string().url()),
  complianceStatus: z.enum(["approved", "pending", "under_review"]),
  _count: z.object({
    impressions: z.number(),
    clicks: z.number(),
    conversions: z.number(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
  routes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
    }),
  ),
  pauseReason: z.string().optional(),
  campaignAnalytics: z
    .object({
      stats: z.array(statCardSchema),
      engagementByCity: z.array(engagementByCitySchema),
      dailyImpressions: z.array(dailyImpressionsSchema),
      riderAllocation: z.array(riderAllocationSchema),
    })
    .optional(),
  topCity: z.string(),
  vehicle: z.string(),
  zones: z.array(z.string()),
  engagementRate: z.number().min(0),
  clickRate: z.number().min(0),
  conversionRate: z.number().min(0),
  avgDuration: z.number().min(0),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(100),
  description: z.string().optional(),
  budget: z.number().min(0.01, "Budget must be greater than 0"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  routeIds: z.array(z.string()).min(1, "At least one route is required"),
});

export const campaignFiltersSchema = z.object({
  searchQuery: z.string().optional(),
  status: z.string().optional(),
  campaignType: z.string().optional(),
  targetAudience: z.string().optional(),
  targetZones: z.array(z.string()).optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  id: z.string(),
});

export type Campaign = z.infer<typeof campaignSchema>;
export type CampaignFiltersSchema = z.infer<typeof campaignFiltersSchema>;
export type CampaignFormData = z.infer<typeof campaignSchema>;
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type CampaignType = z.infer<typeof campaignTypeSchema>;
export type CreateCampaignFormData = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignFormData = z.infer<typeof updateCampaignSchema>;
