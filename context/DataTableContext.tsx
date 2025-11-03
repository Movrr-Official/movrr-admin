"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useFilters } from "@/hooks/useFilters";
import { FilterConfig } from "@/lib/applyFilters";

interface DataTableContextType {
  data: any[];
  filteredData: any[];
  filters: Record<string, any>;
  updateFilter: (key: string, value: any) => void;
  clearFilter: (key: string) => void;
  clearAllFilters: () => void;
  activeFilterCount: number;
  isLoading: boolean;
  filterConfig: FilterConfig[];
}

const DataTableContext = createContext<DataTableContextType | null>(null);

interface DataTableContainerProps {
  children: React.ReactNode;
  data: any[];
  filterConfig?: FilterConfig[];
  persistToUrl?: boolean;
  debounceMs?: number;
}

export function DataTableContainer({
  children,
  data,
  filterConfig = [],
  persistToUrl = true,
  debounceMs = 500,
}: DataTableContainerProps) {
  const filterState = useFilters({
    data,
    filterConfig,
    persistToUrl,
    debounceMs,
  });

  const contextValue = useMemo(
    () => ({
      ...filterState,
      filterConfig,
    }),
    [filterState, filterConfig]
  );

  return (
    <DataTableContext.Provider value={contextValue}>
      {children}
    </DataTableContext.Provider>
  );
}

export function useDataTable() {
  const context = useContext(DataTableContext);
  if (!context) {
    throw new Error("useDataTable must be used within DataTableContainer");
  }
  return context;
}
