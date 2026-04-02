import { z } from "zod";

export const communityRideStatusSchema = z.enum([
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);

export const communityRideDifficultySchema = z.enum([
  "easy",
  "moderate",
  "challenging",
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

export const communityRideSchema = z.object({
  id: z.string(),
  organizerRiderId: z.string(),
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
  difficulty: communityRideDifficultySchema,
  status: communityRideStatusSchema,
  isPublic: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  participants: z.array(communityRideParticipantSchema).optional(),
});

export const communityRideFiltersSchema = z.object({
  searchQuery: z.string().optional(),
  status: z.string().optional(),
  difficulty: z.string().optional(),
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
  maxParticipants: z.number().int().min(2).max(100).optional(),
});

export type CommunityRide = z.infer<typeof communityRideSchema>;
export type CommunityRideParticipant = z.infer<
  typeof communityRideParticipantSchema
>;
export type CommunityRideFiltersSchema = z.infer<
  typeof communityRideFiltersSchema
>;
export type CommunityRideStatus = z.infer<typeof communityRideStatusSchema>;
export type CommunityRideDifficulty = z.infer<
  typeof communityRideDifficultySchema
>;
export type UpdateCommunityRideFormData = z.infer<
  typeof updateCommunityRideSchema
>;
