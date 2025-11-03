import { z } from "zod";

export const statCardSchema = z.object({
  title: z.string(),
  value: z.number(),
  change: z
    .object({
      value: z.number(),
      type: z.enum(["increase", "decrease"]),
    })
    .optional(),
  // Note: You can't validate `icon` or `format` with zod directly
});

export const performanceEntrySchema = z.object({
  name: z.string(),
  impressions: z.number(),
  revenue: z.number(),
});

export const performanceDataSchema = z.object({
  daily: z.array(performanceEntrySchema),
  weekly: z.array(performanceEntrySchema),
  monthly: z.array(performanceEntrySchema),
});

export const dashboardRouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.array(
    z.object({
      lat: z.number(),
      lng: z.number(),
    })
  ),
  distance: z.number(),
  duration: z.number(),
  impressions: z.number(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  status: z.enum(["active", "planned", "completed"]),
});

export type StatCard = z.infer<typeof statCardSchema>;
export type PerformanceEntry = z.infer<typeof performanceEntrySchema>;
export type Route = z.infer<typeof dashboardRouteSchema>;
