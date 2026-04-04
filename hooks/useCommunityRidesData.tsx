import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shouldUseMockData } from "@/lib/dataSource";
import { mockCommunityRides } from "@/data/mockCommunityRides";
import {
  createCommunityRide,
  getCommunityRides,
  updateCommunityRide,
  removeParticipant,
  deleteCommunityRide,
} from "@/app/actions/communityRides";
import {
  CommunityRide,
  CommunityRideFiltersSchema,
  CreateCommunityRideFormData,
  UpdateCommunityRideFormData,
} from "@/schemas";

export const COMMUNITY_RIDES_QUERY_KEY = ["communityRides"] as const;

export const useCommunityRidesData = (filters?: CommunityRideFiltersSchema) => {
  return useQuery<CommunityRide[]>({
    queryKey: [...COMMUNITY_RIDES_QUERY_KEY, filters],
    queryFn: async () => {
      if (shouldUseMockData()) {
        await new Promise((r) => setTimeout(r, 300));
        return [...mockCommunityRides];
      }
      const result = await getCommunityRides(filters);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? "Failed to fetch community rides");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 1,
  });
};

export const useCreateCommunityRide = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommunityRideFormData) =>
      createCommunityRide(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_RIDES_QUERY_KEY });
    },
  });
};

export const useUpdateCommunityRide = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCommunityRideFormData) =>
      updateCommunityRide(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_RIDES_QUERY_KEY });
    },
  });
};

export const useRemoveParticipant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      rideId,
      riderId,
    }: {
      rideId: string;
      riderId: string;
    }) => removeParticipant(rideId, riderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_RIDES_QUERY_KEY });
    },
  });
};

export const useDeleteCommunityRide = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCommunityRide(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_RIDES_QUERY_KEY });
    },
  });
};
