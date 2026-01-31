"use client";

import { useQuery } from "@tanstack/react-query";
import { mockRouteTemplates, RouteTemplate } from "@/data/mockRouteTemplates";
import { getRouteTemplates } from "@/app/actions/routes";
import { shouldUseMockData } from "@/lib/dataSource";

export const useRouteTemplatesData = () => {
  return useQuery<RouteTemplate[]>({
    queryKey: ["routeTemplates"],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (shouldUseMockData()) {
        return [...mockRouteTemplates];
      }

      const result = await getRouteTemplates();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch route templates");
      }

      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 1,
  });
};
