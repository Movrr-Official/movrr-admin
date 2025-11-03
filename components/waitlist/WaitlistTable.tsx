"use client";

import React from "react";

import { FilterConfig } from "@/lib/applyFilters";
import { DataTableContainer } from "@/context/DataTableContext";
import { WaitlistEntry } from "@/types/types";
import WaitlistTableContent from "./WaitlistTableContent";

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  isLoading: boolean;
  toolbar?: boolean;
  showScheduleManager?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function WaitlistTable({
  entries,
  isLoading,
  toolbar = false,
  showScheduleManager = false,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: WaitlistTableProps) {
  const filterValue: FilterConfig[] = [
    {
      id: "city",
      label: "City",
      type: "multi-select",
      key: "city",
      options: [...new Set(entries.map((entry) => entry.city))].map((city) => ({
        value: city,
        label: city,
      })),
    },
    {
      id: "bike_ownership",
      label: "Bike Ownership",
      type: "multi-select",
      key: "bike_ownership",
      options: [
        { value: "yes", label: "Owns Bike" },
        { value: "no", label: "No Bike" },
        { value: "planning", label: "Planning to Get" },
      ],
    },
    {
      id: "status",
      label: "Status",
      type: "select",
      key: "status",
      options: [
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
      ],
    },
  ];

  return (
    <DataTableContainer
      data={entries}
      filterConfig={filterValue}
      persistToUrl={true}
      debounceMs={500}
    >
      <WaitlistTableContent
        isLoading={isLoading}
        toolbar={toolbar}
        showScheduleManager={showScheduleManager}
        searchBar={searchBar}
        className={className}
        refetchData={refetchData}
        isRefetching={isRefetching}
      />
    </DataTableContainer>
  );
}
