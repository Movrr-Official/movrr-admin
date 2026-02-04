import { z } from "zod";
import { userRoleSchema } from "./user";

export const notificationTypeSchema = z.enum([
  "campaign_assigned",
  "campaign_completed",
  "route_assigned",
  "route_completed",
  "system",
  "reward",
  "status",
]);

export const notificationTargetSchema = z.enum(["all", "role", "userIds"]);

export const notificationStatusFilterSchema = z.enum(["all", "read", "unread"]);

export const createNotificationSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    message: z.string().min(1, "Message is required"),
    type: notificationTypeSchema,
    metadata: z.record(z.any()).optional().default({}),
    target: notificationTargetSchema,
    role: userRoleSchema.optional(),
    userIds: z.array(z.string()).optional(),
    respectPreferences: z.boolean().default(true),
  })
  .refine(
    (data) => data.target !== "role" || Boolean(data.role),
    "Role is required when targeting by role",
  )
  .refine(
    (data) => data.target !== "userIds" || (data.userIds?.length ?? 0) > 0,
    "At least one user ID is required",
  );

export const notificationFiltersSchema = z.object({
  type: notificationTypeSchema.optional(),
  status: notificationStatusFilterSchema.optional(),
  searchQuery: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const notificationRecipientSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: userRoleSchema.optional(),
});

export const adminNotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  message: z.string(),
  type: notificationTypeSchema,
  metadata: z.record(z.any()),
  isRead: z.boolean(),
  createdAt: z.string(),
  recipient: notificationRecipientSchema.optional(),
});

export const notificationStatsSchema = z.object({
  total: z.number(),
  read: z.number(),
  unread: z.number(),
  last7Days: z.number(),
});

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;
export type NotificationStatusFilter = z.infer<
  typeof notificationStatusFilterSchema
>;
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type NotificationFilters = z.infer<typeof notificationFiltersSchema>;
export type NotificationRecipient = z.infer<typeof notificationRecipientSchema>;
export type AdminNotification = z.infer<typeof adminNotificationSchema>;
export type NotificationStats = z.infer<typeof notificationStatsSchema>;
