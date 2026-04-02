"use client";

import { DataTableContainer } from "@/context/DataTableContext";
import { FilterConfig } from "@/lib/applyFilters";
import { ProTip } from "@/schemas";
import ProTipsTableContent from "./ProTipsTableContent";

interface ProTipsTableProps {
  tips: ProTip[];
  isLoading: boolean;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function ProTipsTable({
  tips,
  isLoading,
  refetchData,
  isRefetching = false,
}: ProTipsTableProps) {
  const filterConfig: FilterConfig[] = [
    {
      id: "category",
      label: "Category",
      type: "multi-select",
      key: "category",
      options: [
        { value: "earning", label: "Earning" },
        { value: "timing", label: "Timing" },
        { value: "compliance", label: "Compliance" },
        { value: "performance", label: "Performance" },
        { value: "technical", label: "Technical" },
        { value: "planning", label: "Planning" },
      ],
    },
    {
      id: "isActive",
      label: "Status",
      type: "multi-select",
      key: "isActive",
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Inactive" },
      ],
    },
  ];

  return (
    <DataTableContainer
      data={tips}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={300}
    >
      <ProTipsTableContent
        isLoading={isLoading}
        refetchData={refetchData}
        isRefetching={isRefetching}
      />
    </DataTableContainer>
  );
}
