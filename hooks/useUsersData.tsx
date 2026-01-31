"use client";

import { useQuery } from "@tanstack/react-query";

import { mockUsers } from "@/data/mockUsers";
import { User, UserFiltersSchema } from "@/schemas";
import { mockCampaigns } from "@/data/mockCampaigns";
import { useSelector } from "react-redux";
import { RootState } from "@/redux/store";
import { getUsers } from "@/app/actions/users";
import { getCampaigns } from "@/app/actions/campaigns";
import { shouldUseMockData } from "@/lib/dataSource";

export const useUsersData = (filters?: UserFiltersSchema) => {
  const selectedAdvertiserIds = useSelector(
    (state: RootState) => state.advertiserFilter.selectedAdvertiserIds,
  );

  return useQuery<User[]>({
    queryKey: ["users", filters, selectedAdvertiserIds],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

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
            const clicks = advCampaigns.reduce((sum, c) => sum + c.clicks, 0);
            const roi =
              advCampaigns.reduce((sum, c) => sum + c.roi, 0) /
              (advCampaigns.length || 1);

            return {
              ...user,
              advertiserStats: {
                totalCampaigns: total,
                activeCampaigns: active,
                completedCampaigns: completed,
                impressions,
                clicks,
                roi: parseFloat(roi.toFixed(2)),
              },
            };
          }

          return user;
        });

        return users;
      }

      const usersResult = await getUsers(filters, selectedAdvertiserIds);
      if (!usersResult.success || !usersResult.data) {
        throw new Error(usersResult.error || "Failed to fetch users");
      }

      const campaignsResult = await getCampaigns(
        undefined,
        selectedAdvertiserIds,
      );
      const campaigns =
        campaignsResult.success && campaignsResult.data
          ? campaignsResult.data
          : [];

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
          const clicks = advCampaigns.reduce((sum, c) => sum + c.clicks, 0);
          const roi =
            advCampaigns.reduce((sum, c) => sum + c.roi, 0) /
            (advCampaigns.length || 1);

          return {
            ...user,
            advertiserStats: {
              totalCampaigns: total,
              activeCampaigns: active,
              completedCampaigns: completed,
              impressions,
              clicks,
              roi: parseFloat(roi.toFixed(2)),
            },
          };
        }
        return user;
      });

      return usersWithStats;
    },
  });
};
