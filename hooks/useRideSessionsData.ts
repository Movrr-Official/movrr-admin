"use client";

import { useQuery } from "@tanstack/react-query";
import { RideSession, RideSessionFilters } from "@/schemas";
import { getRideSessions } from "@/app/actions/rideSessions";
import { shouldUseMockData } from "@/lib/dataSource";

const mockRideSessions: RideSession[] = [
  {
    id: "session-1",
    riderId: "rider-1",
    riderName: "Alex Johnson",
    earningMode: "standard_ride",
    startedAt: "2024-01-15T08:00:00Z",
    endedAt: "2024-01-15T08:45:00Z",
    verifiedMinutes: 43,
    pointsAwarded: 43,
    verificationStatus: "verified",
    reasonCodes: [],
    city: "Amsterdam",
    country: "NL",
    createdAt: "2024-01-15T08:00:00Z",
  },
  {
    id: "session-2",
    riderId: "rider-2",
    riderName: "Maria Garcia",
    earningMode: "ad_enhanced_ride",
    campaignId: "campaign-1",
    campaignName: "Nike Spring Campaign",
    startedAt: "2024-01-15T10:00:00Z",
    endedAt: "2024-01-15T11:10:00Z",
    verifiedMinutes: 68,
    pointsAwarded: 102,
    verificationStatus: "verified",
    reasonCodes: [],
    city: "Rotterdam",
    country: "NL",
    createdAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "session-3",
    riderId: "rider-3",
    riderName: "Liam Smith",
    earningMode: "standard_ride",
    startedAt: "2024-01-16T09:00:00Z",
    endedAt: "2024-01-16T09:20:00Z",
    verifiedMinutes: 0,
    pointsAwarded: 0,
    verificationStatus: "rejected",
    reasonCodes: ["insufficient_gps_data", "short_duration"],
    city: "The Hague",
    country: "NL",
    createdAt: "2024-01-16T09:00:00Z",
  },
  {
    id: "session-4",
    riderId: "rider-4",
    riderName: "Sophie Dubois",
    earningMode: "standard_ride",
    startedAt: "2024-01-16T14:00:00Z",
    endedAt: "2024-01-16T14:55:00Z",
    verifiedMinutes: 53,
    pointsAwarded: 53,
    verificationStatus: "pending",
    reasonCodes: [],
    city: "Amsterdam",
    country: "NL",
    createdAt: "2024-01-16T14:00:00Z",
  },
  {
    id: "session-5",
    riderId: "rider-5",
    riderName: "Noah van Dijk",
    earningMode: "ad_enhanced_ride",
    campaignId: "campaign-2",
    campaignName: "Adidas City Run",
    startedAt: "2024-01-17T07:30:00Z",
    endedAt: "2024-01-17T09:00:00Z",
    verifiedMinutes: 88,
    pointsAwarded: 132,
    verificationStatus: "manual_review",
    reasonCodes: ["speed_anomaly"],
    city: "Rotterdam",
    country: "NL",
    createdAt: "2024-01-17T07:30:00Z",
  },
];

export const useRideSessionsData = (filters?: RideSessionFilters) => {
  return useQuery<RideSession[]>({
    queryKey: ["rideSessions", filters],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (shouldUseMockData()) {
        let sessions = [...mockRideSessions];

        if (filters?.earningMode && filters.earningMode !== "all") {
          sessions = sessions.filter(
            (s) => s.earningMode === filters.earningMode,
          );
        }
        if (
          filters?.verificationStatus &&
          filters.verificationStatus !== "all"
        ) {
          sessions = sessions.filter(
            (s) => s.verificationStatus === filters.verificationStatus,
          );
        }
        if (filters?.riderId) {
          sessions = sessions.filter((s) => s.riderId === filters.riderId);
        }
        if (filters?.searchQuery) {
          const q = filters.searchQuery.trim().toLowerCase();
          sessions = sessions.filter(
            (s) =>
              s.riderName?.toLowerCase().includes(q) ||
              s.id.toLowerCase().includes(q) ||
              s.campaignName?.toLowerCase().includes(q) ||
              s.city?.toLowerCase().includes(q),
          );
        }

        return sessions.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      }

      const result = await getRideSessions(filters);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch ride sessions");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};
