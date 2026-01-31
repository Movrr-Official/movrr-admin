import { z } from "zod";
import { waypointSchema } from "./shared";

export const createRouteSchema = z.object({
  name: z.string().min(1, "Route name is required").max(100),
  description: z.string().optional(),
  waypoints: z.array(waypointSchema).min(2, "At least 2 waypoints required"),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
});

export const optimizeRouteSchema = z.object({
  id: z.string(),
  preferences: z.object({
    prioritizeDistance: z.boolean().default(false),
    prioritizeTime: z.boolean().default(true),
    avoidTraffic: z.boolean().default(true),
  }),
});

export const routeStatusSchema = z.enum([
  "assigned",
  "in-progress",
  "completed",
  "cancelled",
]);

export const routeSchema = z.object({
  id: z.string(),
  routeId: z.string().optional(),
  campaignIdPrimary: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  brand: z.string().optional(),
  startLocation: z.string(),
  endLocation: z.string(),
  campaignId: z.array(z.string()),
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  endLat: z.number().optional(),
  endLng: z.number().optional(),
  waypoints: z.array(waypointSchema),
  performance: z.string(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  templateStatus: z
    .enum(["pending", "active", "paused", "completed", "cancelled"])
    .optional(),
  assignedDate: z.string(),
  assignedRiderId: z.array(z.string().optional()),
  status: routeStatusSchema,
  estimatedDuration: z.string(),
  estimatedDurationMinutes: z.number().optional(),
  coverage: z.number().optional(),
  coverageKm: z.number().optional(),
  zone: z.string(),
  city: z.string(),
  country: z.string().optional(),
  tolerance: z.number().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().optional(),
  cancelledAt: z.string().datetime().optional(),
  cancellationReason: z.string().optional(),
  completionTime: z.number().optional(),
});

export const updateRouteSchema = createRouteSchema.partial().extend({
  id: z.string(),
});

export type CreateRouteFormData = z.infer<typeof createRouteSchema>;
export type OptimizeRouteFormData = z.infer<typeof optimizeRouteSchema>;
export type RiderRoute = z.infer<typeof routeSchema>;
export type RouteStatus = z.infer<typeof routeStatusSchema>;
export type UpdateRouteFormData = z.infer<typeof updateRouteSchema>;
