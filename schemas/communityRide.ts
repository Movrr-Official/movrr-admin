import { z } from "zod";

export const communityRideStatusSchema = z.enum([
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);

export const communityRideCategorySchema = z.enum([
  "beginner",
  "intermediate",
  "challenging",
  "social",
]);

export const communityRideParticipantStatusSchema = z.enum([
  "joined",
  "left",
  "removed",
]);

export const communityRideParticipantSchema = z.object({
  id: z.string(),
  riderId: z.string(),
  riderName: z.string(),
  status: communityRideParticipantStatusSchema,
  joinedAt: z.string(),
});

export const communityRideOrganizerTypeSchema = z.enum([
  "rider",
  "admin",
  "movrr",
]);

export const communityRideSchema = z.object({
  id: z.string(),
  organizerType: communityRideOrganizerTypeSchema,
  organizerUserId: z.string().optional(),
  organizerRiderId: z.string().optional(),
  organizerName: z.string(),
  title: z.string(),
  description: z.string().optional(),
  scheduledAt: z.string(),
  meetingPointName: z.string().optional(),
  meetingPointLat: z.number().optional(),
  meetingPointLng: z.number().optional(),
  routeId: z.string().optional(),
  maxParticipants: z.number().int().min(2).max(100),
  participantCount: z.number().int().min(0),
  bikeTypesAllowed: z.array(z.string()).optional(),
  category: communityRideCategorySchema,
  status: communityRideStatusSchema,
  isPublic: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  participants: z.array(communityRideParticipantSchema).optional(),
});

export const communityRideFiltersSchema = z.object({
  searchQuery: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  dateRange: z
    .object({
      from: z.date().optional(),
      to: z.date().optional(),
    })
    .optional(),
});

export const updateCommunityRideSchema = z.object({
  id: z.string(),
  status: communityRideStatusSchema.optional(),
  title: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  scheduledAt: z.string().optional(),
  meetingPointName: z.string().optional(),
  meetingPointLat: z.number().min(-90).max(90).optional(),
  meetingPointLng: z.number().min(-180).max(180).optional(),
  maxParticipants: z.number().int().min(2).max(100).optional(),
  bikeTypesAllowed: z.array(z.string()).optional(),
  category: communityRideCategorySchema.optional(),
  isPublic: z.boolean().optional(),
});

export const createCommunityRideSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().optional(),
  scheduledAt: z.string().min(1, "Scheduled date is required"),
  meetingPointName: z.string().optional(),
  meetingPointLat: z.number().optional(),
  meetingPointLng: z.number().optional(),
  maxParticipants: z.number().int().min(2).max(100),
  bikeTypesAllowed: z.array(z.string()).optional(),
  category: communityRideCategorySchema,
  isPublic: z.boolean(),
  organizerType: communityRideOrganizerTypeSchema.default("movrr"),
  organizerUserId: z.string().optional(),
  organizerRiderId: z.string().optional(),
  organizerName: z.string().min(1, "Organizer name is required").max(100),
});

export type CommunityRide = z.infer<typeof communityRideSchema>;
export type CommunityRideParticipant = z.infer<
  typeof communityRideParticipantSchema
>;
export type CommunityRideFiltersSchema = z.infer<
  typeof communityRideFiltersSchema
>;
export type CommunityRideStatus = z.infer<typeof communityRideStatusSchema>;
export type CommunityRideCategory = z.infer<typeof communityRideCategorySchema>;
export type CommunityRideOrganizerType = z.infer<
  typeof communityRideOrganizerTypeSchema
>;
export type UpdateCommunityRideFormData = z.infer<
  typeof updateCommunityRideSchema
>;
export type CreateCommunityRideFormData = z.infer<
  typeof createCommunityRideSchema
>;
