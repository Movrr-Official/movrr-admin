import { z } from "zod";
import {
  performanceDataSchema,
  dashboardRouteSchema,
  statCardSchema,
} from "./dashboard";

export const userRoleSchema = z.enum([
  // Product principals
  "advertiser",
  "rider",
  // Canonical employee operating roles
  "super_admin",
  "security_admin",
  "operations_manager",
  "platform_operator",
  "campaign_manager",
  "partner_operations_manager",
  "fraud_analyst",
  "trust_safety_analyst",
  "support_agent",
  "support_lead",
  "finance_operator",
  "compliance_analyst",
  "programme_operations_manager",
  "executive_viewer",
  "product_operations",
  "engineering_operations",
  // Legacy employee aliases (DB / migration compatibility)
  "admin",
  "moderator",
  "support",
  "compliance_officer",
  "government",
]);

export const userStatusSchema = z.enum(["active", "inactive", "pending"]);

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1, "Full name is required"),
  phone: z.string().optional(),
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastActive: z.string().datetime().optional(),
  lastLogin: z.string().datetime().optional(),
  avatarUrl: z.string().url().optional(),
  organization: z.string().optional(),
  isVerified: z.boolean().default(false),
  languagePreference: z.string().default("en"),
  accountNotes: z.string().optional(),
  dashboardData: z
    .object({
      stats: z.array(statCardSchema),
      performance: performanceDataSchema,
      routes: z.array(dashboardRouteSchema),
    })
    .optional(),
});

export const profileSchema = userSchema
  .pick({
    name: true,
    email: true,
    avatarUrl: true,
    languagePreference: true,
  })
  .extend({
    languagePreference: z.string(),
  });

export const updateUserRoleSchema = z.object({
  userId: z.string(),
  role: userRoleSchema,
});

export const toggleUserStatusSchema = z.object({
  userId: z.string(),
  status: userStatusSchema,
});

export const userFiltersSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  dateRange: z
    .object({
      from: z.date().optional(),
      to: z.date().optional(),
    })
    .optional(),
  searchQuery: z.string().optional(),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
export type User = z.infer<typeof userSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type UserFiltersSchema = z.infer<typeof userFiltersSchema>;
