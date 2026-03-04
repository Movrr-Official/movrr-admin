"use client";

import React from "react";

import { DataTableContainer } from "@/context/DataTableContext";
import { FilterConfig } from "@/lib/applyFilters";
import { Advertiser } from "@/schemas";
import AdvertisersTableContent from "./AdvertisersTableContent";

interface AdvertisersTableProps {
  advertisers: Advertiser[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function AdvertisersTable({
  advertisers,
  isLoading,
  toolbar = true,
  searchBar = false,
  className,
  refetchData,
  isRefetching = false,
}: AdvertisersTableProps) {
  const filterConfig: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      type: "multi-select",
      key: "status",
      options: [
        { value: "active", label: "Active" },
        { value: "pending", label: "Pending" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  ];

  return (
    <DataTableContainer
      data={advertisers}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <AdvertisersTableContent
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
