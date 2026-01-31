"use client";

import React from "react";

import { FilterConfig } from "@/lib/applyFilters";
import { DataTableContainer } from "@/context/DataTableContext";
import { RiderRoute } from "@/schemas";
import RoutesTableContent from "./RoutesTableContent";
import { useCampaignsData } from "@/hooks/useCampaignsData";
import { useUsersData } from "@/hooks/useUsersData";

interface RoutesTableProps {
  routes: RiderRoute[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function RoutesTable({
  routes,
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: RoutesTableProps) {
  // Fetch campaigns and users for filter options
  const { data: campaigns } = useCampaignsData();
  const { data: users } = useUsersData();

  // Get unique campaign IDs from routes
  const routeCampaignIds = new Set(
    routes.flatMap((route) => route.campaignId || [])
  );
  const campaignOptions = campaigns
    ?.filter((campaign) => routeCampaignIds.has(campaign.id))
    .map((campaign) => ({
      value: campaign.id,
      label: campaign.name,
    })) || [];

  // Get unique rider IDs from routes
  const routeRiderIds = new Set(
    routes.flatMap((route) => route.assignedRiderId || []).filter(Boolean)
  );
  const riderOptions = users
    ?.filter((user) => routeRiderIds.has(user.id) && user.role === "rider")
    .map((user) => ({
      value: user.id,
      label: user.name,
    })) || [];

  const filterConfig: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      type: "multi-select",
      key: "status",
      options: [
        { value: "assigned", label: "Assigned" },
        { value: "in-progress", label: "In Progress" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      id: "city",
      label: "City",
      type: "multi-select",
      key: "city",
      options: [...new Set(routes.map((route) => route.city))].map((city) => ({
        value: city,
        label: city,
      })),
    },
    {
      id: "performance",
      label: "Performance",
      type: "multi-select",
      key: "performance",
      options: [
        { value: "high", label: "High" },
        { value: "medium", label: "Medium" },
        { value: "low", label: "Low" },
      ],
    },
    ...(campaignOptions.length > 0
      ? [
          {
            id: "campaignId",
            label: "Campaign",
            type: "multi-select",
            key: "campaignId",
            options: campaignOptions,
          } as FilterConfig,
        ]
      : []),
    ...(riderOptions.length > 0
      ? [
          {
            id: "assignedRiderId",
            label: "Rider",
            type: "multi-select",
            key: "assignedRiderId",
            options: riderOptions,
          } as FilterConfig,
        ]
      : []),
  ];

  return (
    <DataTableContainer
      data={routes}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <RoutesTableContent
        isLoading={isLoading}
        toolbar={toolbar}
        searchBar={searchBar}
        className={className}
        refetchData={refetchData}
        isRefetching={isRefetching}
      />
    </DataTableContainer>
  );
}
