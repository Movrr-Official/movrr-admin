import { useSelector } from "react-redux";

import { Campaign, CampaignFiltersSchema } from "@/schemas";
import { mockCampaigns } from "@/data/mockCampaigns";
import { RootState } from "@/redux/store";
import { useQuery } from "@tanstack/react-query";

export const useCampaignsData = (filters?: CampaignFiltersSchema) => {
  const selectedAdvertiserIds = useSelector(
    (state: RootState) => state.advertiserFilter.selectedAdvertiserIds
  );

  return useQuery<Campaign[]>({
    queryKey: ["campaigns", filters, selectedAdvertiserIds],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      let campaigns = [...mockCampaigns];

      // Filter by advertiser ID
      if (selectedAdvertiserIds.length > 0) {
        campaigns = campaigns.filter((c) =>
          selectedAdvertiserIds.includes(c.advertiserId)
        );
      }

      // Apply UI filters
      if (filters?.status && filters.status !== "all") {
        campaigns = campaigns.filter((c) => c.status === filters.status);
      }

      if (filters?.campaignType && filters.campaignType !== "all") {
        campaigns = campaigns.filter(
          (c) => c.campaignType === filters.campaignType
        );
      }

      if (filters?.targetAudience) {
        campaigns = campaigns.filter(
          (c) =>
            c.targetAudience?.toLowerCase() ===
            filters.targetAudience?.toLowerCase()
        );
      }

      if (filters?.targetZones?.length) {
        campaigns = campaigns.filter((c) =>
          c.targetZones?.some((zone) => filters.targetZones?.includes(zone))
        );
      }

      if (filters?.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        campaigns = campaigns.filter((c) =>
          c.name.toLowerCase().includes(query)
        );
      }

      return campaigns;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 1,
  });
};
