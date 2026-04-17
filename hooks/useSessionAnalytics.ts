"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getSessionAnalytics,
  getStreakLeaderboard,
  type SessionAnalytics,
  type StreakLeader,
} from "@/app/actions/sessionAnalytics";

export const useSessionAnalytics = (days = 30) =>
  useQuery<SessionAnalytics>({
    queryKey: ["sessionAnalytics", days],
    queryFn: async () => {
      const result = await getSessionAnalytics(days);
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed");
      return result.data;
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 20,
  });

export const useStreakLeaderboard = (limit = 10) =>
  useQuery<StreakLeader[]>({
    queryKey: ["streakLeaderboard", limit],
    queryFn: async () => {
      const result = await getStreakLeaderboard(limit);
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed");
      return result.data;
    },
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 30,
  });
