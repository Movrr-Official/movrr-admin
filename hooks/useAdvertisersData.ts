"use client";

import { useQuery } from "@tanstack/react-query";

import { Advertiser, AdvertiserFiltersSchema } from "@/schemas";
import { getAdvertisers } from "@/app/actions/advertisers";

export const useAdvertisersData = (filters?: AdvertiserFiltersSchema) => {
  return useQuery<Advertiser[]>({
    queryKey: ["advertisers", filters],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const result = await getAdvertisers(filters);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch advertisers");
      }

      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 1,
  });
};

