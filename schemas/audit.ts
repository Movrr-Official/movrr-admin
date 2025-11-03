import { z } from "zod";

export const auditActionSchema = z.enum([
  "all",
  "User Role Changed",
  "User Status Changed",
  "Campaign Created",
  "Campaign Edited",
  "Campaign Deleted",
  "Billing Updated",
  "Route Assigned",
  "Route Optimized",
  "System Settings Changed",
]);

export const auditFiltersSchema = z.object({
  actionType: auditActionSchema.optional(),
  performedBy: z.string().optional(),
  dateRange: z
    .object({
      from: z.date(),
      to: z.date(),
    })
    .optional(),
  searchQuery: z.string().optional(),
});

const auditLogSchema = z.object({
  id: z.string().uuid(),
  action: auditActionSchema,
  result: z.enum(["Success", "Failed", "Pending"]).optional(),
  performedBy: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: z.string(),
  }),
  affectedEntity: z
    .object({
      type: z.string(),
      id: z.string(),
      name: z.string(),
    })
    .optional(),
  timestamp: z.string().datetime(),
  sourceIp: z.string().optional(),
  geoLocation: z
    .object({
      city: z.string(),
      country: z.string(),
    })
    .optional(),
  userAgent: z.string().optional(),
  resourceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditFilters = z.infer<typeof auditFiltersSchema>;
export type AuditFiltersSchema = z.infer<typeof auditFiltersSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
