"use client";

import { useQuery } from "@tanstack/react-query";
import { RewardCatalogFilters, RewardCatalogItem } from "@/schemas";
import { shouldUseMockData } from "@/lib/dataSource";
import { getRewardCatalog } from "@/app/actions/rewardCatalog";
import { mockRewardCatalog } from "@/data/mockRewardCatalog";

export const useRewardCatalogData = (filters?: RewardCatalogFilters) => {
  return useQuery<RewardCatalogItem[]>({
    queryKey: ["rewardCatalog", filters],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (shouldUseMockData()) {
        let catalog = [...mockRewardCatalog];

        if (filters?.status) {
          catalog = catalog.filter((item) => item.status === filters.status);
        }

        if (filters?.category) {
          catalog = catalog.filter((item) => item.category === filters.category);
        }

        if (filters?.featured !== undefined) {
          catalog = catalog.filter(
            (item) => Boolean(item.isFeatured) === filters.featured,
          );
        }

        if (filters?.searchQuery?.trim()) {
          const query = filters.searchQuery.toLowerCase();
          catalog = catalog.filter((item) =>
            [item.title, item.sku, item.category, item.partnerName]
              .filter(Boolean)
              .some((value) => value?.toLowerCase().includes(query)),
          );
        }

        return catalog;
      }

      const result = await getRewardCatalog(filters);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch reward catalog");
      }

      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 1,
  });
};
