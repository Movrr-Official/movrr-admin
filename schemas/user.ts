import { z } from "zod";
import {
  performanceDataSchema,
  dashboardRouteSchema,
  statCardSchema,
} from "./dashboard";

export const userRoleSchema = z.enum([
  "admin",
  "super_admin",
  "moderator",
  "support",
  "advertiser",
  "rider",
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
