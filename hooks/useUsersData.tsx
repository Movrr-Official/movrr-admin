"use client";

import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { User, UserFiltersSchema } from "@/schemas";
import { RootState } from "@/redux/store";
import { dashboardRead } from "@/lib/dashboard/readTransport";

export const useUsersData = (filters?: UserFiltersSchema) => {
  const selectedAdvertiserIds = useSelector(
    (state: RootState) => state.advertiserFilter.selectedAdvertiserIds,
  );
  const query = useQuery<{ users: User[]; warnings: string[] }>({
    queryKey: ["users", filters, selectedAdvertiserIds],
    queryFn: async () => {
      const result = await dashboardRead("users", filters, selectedAdvertiserIds);
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || "Users unavailable. Retry or contact MOVRR support.");
      }
      return { users: result.data, warnings: result.warnings ?? [] };
    },
  });
  return { ...query, data: query.data?.users, warnings: query.data?.warnings ?? [] };
};
