"use client";

import { useQuery } from "@tanstack/react-query";
import { getDistanceStats } from "@/app/actions/rideSessions";

export const useDistanceStats = () =>
  useQuery({
    queryKey: ["distanceStats"],
    queryFn: async () => {
      const result = await getDistanceStats();
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed");
      return result.data;
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 20,
  });
