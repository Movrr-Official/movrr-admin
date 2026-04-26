"use client";

import React, { useMemo } from "react";

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
  const filterValue = useMemo<FilterConfig[]>(
    () => [
      {
        id: "city",
        label: "City",
        type: "multi-select",
        key: "city",
        options: [...new Set(entries.map((entry) => entry.city))].map(
          (city) => ({
            value: city,
            label: city,
          }),
        ),
      },
      {
        id: "audience",
        label: "Audience",
        type: "multi-select",
        key: "audience",
        options: [
          { value: "rider", label: "Rider" },
          { value: "brand", label: "Brand" },
          { value: "partner", label: "Partner" },
        ],
      },
      {
        id: "bike_ownership",
        label: "Bike",
        type: "multi-select",
        key: "bike_ownership",
        options: [
          { value: "own", label: "Owns Bike" },
          { value: "interested", label: "Interested" },
          { value: "planning", label: "Planning to Get" },
        ],
      },
      {
        id: "source",
        label: "Source",
        type: "multi-select",
        key: "source",
        options: [
          { value: "movrr_website", label: "Website" },
          { value: "movrr_waitlist", label: "Waitlist" },
        ],
      },
      {
        id: "acquisition_channel",
        label: "Channel",
        type: "multi-select",
        key: "acquisition_channel",
        options: [
          { value: "direct", label: "Direct" },
          { value: "social", label: "Social" },
          { value: "organic_search", label: "Organic" },
          { value: "paid", label: "Paid" },
          { value: "email", label: "Email" },
          { value: "referral", label: "Referral" },
          { value: "partner", label: "Partner" },
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
    ],
    [entries],
  );

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
