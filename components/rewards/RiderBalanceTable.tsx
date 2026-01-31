"use client";

import React from "react";

import { FilterConfig } from "@/lib/applyFilters";
import { DataTableContainer } from "@/context/DataTableContext";
import { RiderBalance } from "@/schemas";
import RiderBalanceTableContent from "./RiderBalanceTableContent";

interface RiderBalanceTableProps {
  balances: RiderBalance[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function RiderBalanceTable({
  balances,
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: RiderBalanceTableProps) {
  const filterConfig: FilterConfig[] = [
    // Add filters if needed in the future
  ];

  return (
    <DataTableContainer
      data={balances}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <RiderBalanceTableContent
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
