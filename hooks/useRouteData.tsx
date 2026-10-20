"use client";

import { useQuery } from "@tanstack/react-query";
import { mockRoutes } from "@/data/mockRoutes";
import { RiderRoute } from "@/schemas";
import { dashboardRead } from "@/lib/dashboard/readTransport";
import { shouldUseMockData } from "@/lib/dataSource";

export const useRouteData = () => {
  return useQuery<RiderRoute[]>({
    queryKey: ["routes"],
    queryFn: async () => {
      if (shouldUseMockData()) {
        return [...mockRoutes];
      }

      const result = await dashboardRead("routes");
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch routes");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 1,
  });
};
