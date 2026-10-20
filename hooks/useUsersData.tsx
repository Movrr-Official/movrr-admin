"use client";

import { useQuery } from "@tanstack/react-query";

import { mockUsers } from "@/data/mockUsers";
import { User, UserFiltersSchema } from "@/schemas";
import { mockCampaigns } from "@/data/mockCampaigns";
import { useSelector } from "react-redux";
import { RootState } from "@/redux/store";
import { dashboardRead } from "@/lib/dashboard/readTransport";
import { shouldUseMockData } from "@/lib/dataSource";

export const useUsersData = (filters?: UserFiltersSchema) => {
  const selectedAdvertiserIds = useSelector(
    (state: RootState) => state.advertiserFilter.selectedAdvertiserIds,
  );

  return useQuery<User[]>({
    queryKey: ["users", filters, selectedAdvertiserIds],
    queryFn: async () => {

      if (shouldUseMockData()) {
        let users = [...mockUsers];
        const campaigns = [...mockCampaigns];

        if (filters?.role) {
          users = users.filter((user) => user.role === filters.role);
        }

        if (filters?.status) {
          users = users.filter((user) => user.status === filters.status);
        }

        if (filters?.searchQuery) {
          const query = filters.searchQuery.toLowerCase();
          users = users.filter(
            (user) =>
              user.name.toLowerCase().includes(query) ||
              user.email.toLowerCase().includes(query),
          );
        }

        if (filters?.dateRange?.from || filters?.dateRange?.to) {
          const from = filters.dateRange?.from
            ? new Date(filters.dateRange.from)
            : null;
          const to = filters.dateRange?.to
            ? new Date(filters.dateRange.to)
            : null;
          users = users.filter((user) => {
            const createdAt = new Date(user.createdAt);
            if (from && createdAt < from) return false;
            if (to && createdAt > to) return false;
            return true;
          });
        }

        if (selectedAdvertiserIds.length > 0) {
          users = users.filter(
            (u) =>
              u.role !== "advertiser" || selectedAdvertiserIds.includes(u.id),
          );
        }

        users = users.map((user) => {
          if (user.role === "advertiser") {
            const advCampaigns = campaigns.filter(
              (c) => c.advertiserId === user.id,
            );
            const total = advCampaigns.length;
            const active = advCampaigns.filter(
              (c) => c.status === "active",
            ).length;
            const completed = advCampaigns.filter(
              (c) => c.status === "completed",
            ).length;
            const impressions = advCampaigns.reduce(
              (sum, c) => sum + c.impressions,
              0,
            );
            const clicks = advCampaigns.reduce((sum, c) => sum + c.qrScans, 0);

            return {
              ...user,
              advertiserStats: {
                totalCampaigns: total,
                activeCampaigns: active,
                completedCampaigns: completed,
                impressions,
                clicks,
              },
            };
          }

          return user;
        });

        return users;
      }

      const [usersResult, campaignsResult] = await Promise.all([
        dashboardRead("users", filters, selectedAdvertiserIds),
        dashboardRead("campaigns", undefined, selectedAdvertiserIds),
      ]);
      if (!usersResult.success || !usersResult.data) {
        throw new Error(usersResult.error || "Failed to fetch users");
      }

      if (!campaignsResult.success || !campaignsResult.data) {
        throw new Error(campaignsResult.error || "Failed to fetch campaign statistics");
      }
      const campaigns = campaignsResult.data;

      const usersWithStats = usersResult.data.map((user) => {
        if (user.role === "advertiser") {
          const advCampaigns = campaigns.filter(
            (c) => c.advertiserId === user.id,
          );
          const total = advCampaigns.length;
          const active = advCampaigns.filter(
            (c) => c.status === "active",
          ).length;
          const completed = advCampaigns.filter(
            (c) => c.status === "completed",
          ).length;
          const impressions = advCampaigns.reduce(
            (sum, c) => sum + c.impressions,
            0,
          );
          const clicks = advCampaigns.reduce((sum, c) => sum + c.qrScans, 0);

          return {
            ...user,
            advertiserStats: {
              totalCampaigns: total,
              activeCampaigns: active,
              completedCampaigns: completed,
              impressions,
              clicks,
            },
          };
        }
        return user;
      });

      return usersWithStats;
    },
  });
};
