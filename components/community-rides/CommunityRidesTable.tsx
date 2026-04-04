"use client";

import { DataTableContainer } from "@/context/DataTableContext";
import { FilterConfig } from "@/lib/applyFilters";
import { CommunityRide } from "@/schemas";
import CommunityRidesTableContent from "./CommunityRidesTableContent";

interface CommunityRidesTableProps {
  rides: CommunityRide[];
  isLoading: boolean;
  toolbar?: boolean;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function CommunityRidesTable({
  rides,
  isLoading,
  toolbar = true,
  refetchData,
  isRefetching = false,
}: CommunityRidesTableProps) {
  const filterConfig: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      type: "multi-select",
      key: "status",
      options: [
        { value: "upcoming", label: "Upcoming" },
        { value: "active", label: "Active" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      id: "category",
      label: "Category",
      type: "multi-select",
      key: "category",
      options: [
        { value: "beginner", label: "Beginner" },
        { value: "intermediate", label: "Intermediate" },
        { value: "challenging", label: "Challenging" },
        { value: "social", label: "Social" },
      ],
    },
  ];

  return (
    <DataTableContainer
      data={rides}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <CommunityRidesTableContent
        isLoading={isLoading}
        toolbar={toolbar}
        refetchData={refetchData}
        isRefetching={isRefetching}
      />
    </DataTableContainer>
  );
}
