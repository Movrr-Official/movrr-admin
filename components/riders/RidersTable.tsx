"use client";

import React from "react";

import { DataTableContainer } from "@/context/DataTableContext";
import { FilterConfig } from "@/lib/applyFilters";
import { Rider } from "@/schemas";
import RidersTableContent from "./RidersTableContent";

interface RidersTableProps {
  riders: Rider[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function RidersTable({
  riders,
  isLoading,
  toolbar = true,
  searchBar = false,
  className,
  refetchData,
  isRefetching = false,
}: RidersTableProps) {
  const cityOptions = Array.from(
    new Set(riders.map((rider) => rider.city).filter(Boolean)),
  )
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((city) => ({
      value: String(city),
      label: String(city),
    }));

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
    {
      id: "vehicleType",
      label: "Vehicle",
      type: "multi-select",
      key: "vehicleType",
      options: [
        { value: "standard_bike", label: "Standard Bike" },
        { value: "e_bike", label: "E-Bike" },
        { value: "fat_bike", label: "Fat Bike" },
        { value: "unknown", label: "Unknown" },
      ],
    },
    ...(cityOptions.length
      ? [
          {
            id: "city",
            label: "City",
            type: "multi-select" as const,
            key: "city",
            options: cityOptions,
          },
        ]
      : []),
    {
      id: "isCertified",
      label: "Certified",
      type: "checkbox",
      key: "isCertified",
    },
  ];

  return (
    <DataTableContainer
      data={riders}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <RidersTableContent
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
