"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRiderBadges, revokeRiderBadge, awardRiderBadge, getBadgeDefinitions } from "@/app/actions/badges";

export function useRiderBadges(riderId: string | null) {
  return useQuery({
    queryKey: ["riderBadges", riderId],
    queryFn: async () => {
      if (!riderId) return [];
      const result = await getRiderBadges(riderId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    enabled: Boolean(riderId),
    staleTime: 1000 * 30,
  });
}

export function useBadgeDefinitions() {
  return useQuery({
    queryKey: ["badgeDefinitions"],
    queryFn: async () => {
      const result = await getBadgeDefinitions();
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 1000 * 60 * 10, // badge definitions change rarely
  });
}

export function useRevokeRiderBadge(riderId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { badgeAwardId: string; reason?: string }) =>
      revokeRiderBadge(params.badgeAwardId, params.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["riderBadges", riderId] });
    },
  });
}

export function useAwardRiderBadge(riderId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (badgeCode: string) => {
      if (!riderId) return Promise.resolve({ success: false, error: "No rider selected" });
      return awardRiderBadge(riderId, badgeCode);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["riderBadges", riderId] });
    },
  });
}
