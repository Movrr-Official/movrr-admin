import { z } from "zod";

export const activitySchema = z.object({
  message: z.string(),
  time: z.string().datetime(),
  type: z.enum(["delivery", "route_completed", "issue", "system"]),
  routeId: z.string().optional(),
  campaignId: z.string().optional(),
});

export const availabilitySchema = z.object({
  monday: z.boolean(),
  tuesday: z.boolean(),
  wednesday: z.boolean(),
  thursday: z.boolean(),
  friday: z.boolean(),
  saturday: z.boolean(),
  sunday: z.boolean(),
});

export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.date(),
  type: z.enum(["route", "training", "meeting", "other"]),
  description: z.string().optional(),
  location: z.string().optional(),
  duration: z.string().optional(),
});

export const performanceStatsSchema = z.object({
  totalRoutes: z.number().default(0),
  completedRoutes: z.number().default(0),
  inProgressRoutes: z.number().default(0),
  totalDistance: z.number().default(0), // in km
  avgCompletionTime: z.number().default(0), // in minutes
  efficiency: z.number().default(0), // km/min
  lastActive: z.string().datetime().optional(),
});

export const waypointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().optional(),
  order: z.number().int().min(0),
});

export type AvailabilityFormData = z.infer<typeof availabilitySchema>;
export type Event = z.infer<typeof eventSchema>;
export type PerformanceStats = z.infer<typeof performanceStatsSchema>;
export type Waypoint = z.infer<typeof waypointSchema>;
