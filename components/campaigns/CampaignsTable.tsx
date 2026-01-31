"use client";

import React from "react";

import { FilterConfig } from "@/lib/applyFilters";
import { DataTableContainer } from "@/context/DataTableContext";
import { Campaign } from "@/schemas";
import CampaignsTableContent from "./CampaignsTableContent";


interface CampaignsTableProps {
  campaigns: Campaign[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
  enableGridView?: boolean;
}

export function CampaignsTable({
  campaigns,
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
  enableGridView = false,
}: CampaignsTableProps) {
  const filterConfig: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      type: "multi-select",
      key: "status",
      options: [
        { value: "active", label: "Active" },
        { value: "paused", label: "Paused" },
        { value: "draft", label: "Draft" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      id: "campaignType",
      label: "Type",
      type: "multi-select",
      key: "campaignType",
      options: [
        { value: "branding", label: "Branding" },
        { value: "conversion", label: "Conversion" },
      ],
    },
  ];

  return (
    <DataTableContainer
      data={campaigns}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <CampaignsTableContent
        isLoading={isLoading}
        toolbar={toolbar}
        searchBar={searchBar}
        className={className}
        refetchData={refetchData}
        isRefetching={isRefetching}
        enableGridView={enableGridView}
      />
    </DataTableContainer>
  );
}
