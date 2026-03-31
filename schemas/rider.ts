import { z } from "zod";
import {
  availabilitySchema,
  eventSchema,
  performanceStatsSchema,
  activitySchema,
} from "./shared";
import { routeSchema } from "./route";
import { userSchema } from "./user";

export const riderContactSchema = z.object({
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
});

export const riderStatusSchema = z.enum([
  "active",
  "inactive",
  "pending",
  "suspended",
]);
export const vehicleTypeSchema = z.enum(["standard_bike", "e_bike", "fat_bike", "unknown"]);

export const vehicleSchema = z.object({
  type: vehicleTypeSchema,
  model: z.string().optional(),
  year: z.number().optional(),
  lastInspection: z.string().datetime().optional(),
  inspectionStatus: z.enum(["passed", "failed", "pending"]).optional(),
});

export const riderFiltersSchema = z.object({
  status: z
    .enum(["all", "active", "inactive", "pending", "suspended"])
    .optional(),
  vehicleType: z.enum(["all", "standard_bike", "e_bike", "fat_bike", "unknown"]).optional(),
  minRating: z.enum(["all", "3", "4", "4.5"]).optional(),
  searchQuery: z.string().optional(),
});

export const riderSchema = userSchema.extend({
  id: z.string(),
  userId: z.string(),
  status: riderStatusSchema,
  city: z.string().optional(),
  country: z.string().optional(),
  isCertified: z.boolean().default(false),
  lastActive: z.string().datetime().optional(),
  lastActivityAt: z.string().datetime().optional(),
  profileCompleteness: z.number().min(0).max(100).optional(),

  // Performance metrics
  campaignsCompleted: z.number().default(0),
  activeCampaignsCount: z.number().int().min(0).optional(),
  activeRoutesCount: z.number().int().min(0).optional(),
  pointsBalance: z.number().optional(),
  lifetimePointsEarned: z.number().optional(),
  rating: z.number().min(1).max(5).default(3),
  weeklyEarnings: z.number().default(0),
  totalEarnings: z.number().default(0),
  totalRides: z.number().default(0),
  avgRideTime: z.string().optional(),

  // Current assignment
  currentRoute: routeSchema.optional(),
  currentCampaign: z.string().optional(),
  routeProgress: z.number().min(0).max(100).optional(),

  // Activity tracking
  recentActivity: z.array(activitySchema).default([]),
  assignedAdvertiserId: z.string(),
  schedule: z.array(eventSchema).default([]),

  // Availability
  availability: availabilitySchema,
  preferredHours: z
    .enum(["morning", "afternoon", "evening", "flexible"])
    .default("flexible"),

  // Equipment
  vehicle: vehicleSchema,
  vehicleType: vehicleTypeSchema.optional(),
  hasHelmet: z.boolean().default(false),
  gearCertified: z.boolean().default(false),
  inspectionStatus: z.enum(["passed", "failed", "pending"]).optional(),
  complianceWarnings: z.array(z.string()).optional(),

  // Contact info
  contact: riderContactSchema,

  // Performance stats (calculated)
  performanceStats: performanceStatsSchema.optional(),
  regionsCovered: z.array(z.string()),

  // Optional metadata (can override base)
  accountNotes: z.string().optional(),
  languagePreference: z.string().default("en").optional(),
  routeCompletionRate: z.number().min(0).max(100).default(0),
});

export const updateRiderSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  status: riderStatusSchema.optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  languagePreference: z.string().optional(),
  accountNotes: z.string().optional(),
  isCertified: z.boolean().optional(),
  avatarUrl: z.string().optional(),
  vehicleType: vehicleTypeSchema.optional(),
  availability: availabilitySchema.optional(),
  vehicle: vehicleSchema.optional(),
  contact: riderContactSchema.optional(),
  preferredHours: z
    .enum(["morning", "afternoon", "evening", "flexible"])
    .optional(),
});

export const riderUserSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
  status: z.enum(["active", "inactive", "pending"]),
  assignedRoute: z.string().optional(),
  lastActive: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  onRoute: z.boolean().default(false),
  lastDelivery: z.string().optional(),
});

export type RiderContactFormData = z.infer<typeof riderContactSchema>;
export type RiderFiltersSchema = z.infer<typeof riderFiltersSchema>;
export type Rider = z.infer<typeof riderSchema>;
export type RiderStatus = z.infer<typeof riderStatusSchema>;
export type RiderUser = z.infer<typeof riderUserSchema>;
export type VehicleType = z.infer<typeof vehicleTypeSchema>;
