"use client";

import React, { useState } from "react";

import { ActiveFiltersDisplay } from "../filters/ActiveFiltersDisplay";
import { getRiderBalanceTableColumns } from "./RiderBalanceTableColumns";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "../skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "../filters/FilterSummary";
import { RiderBalance } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import { Users as UsersIcon } from "lucide-react";
import { RiderBalanceDetailsDrawer } from "./RiderBalanceDetailsDrawer";

interface RiderBalanceTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function RiderBalanceTableContent({
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: RiderBalanceTableContentProps) {
  const { toast } = useToast();
  const [selectedBalance, setSelectedBalance] = useState<RiderBalance | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const {
    data: balances,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    isLoading: filtersLoading,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  const handleView = (balance: RiderBalance) => {
    setSelectedBalance(balance);
    setIsDrawerOpen(true);
  };

  const handleAdjust = (balance: RiderBalance) => {
    setSelectedBalance(balance);
    setIsDrawerOpen(true);
  };

  const handleRowClick = (balance: RiderBalance) => {
    setSelectedBalance(balance);
    setIsDrawerOpen(true);
  };

  const columns = React.useMemo(
    () =>
      getRiderBalanceTableColumns({
        onView: handleView,
        onAdjust: handleAdjust,
      }),
    [handleView, handleAdjust],
  );

  if (isLoading) {
    return <DataTableSkeleton className={className} />;
  }

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        {toolbar && (
          <DataTableToolbar
            search={{
              enabled: true,
              placeholder: "Search riders by name or email...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "rider_balances_export",
              formats: ["csv", "xlsx", "json"],
            }}
            refresh={{
              enabled: true,
              onRefresh: refetchData,
              isLoading: isRefetching,
            }}
          />
        )}

        {/* Active Filters */}
        {activeFilterCount > 0 && (
          <div className="flex flex-col gap-2">
            <ActiveFiltersDisplay
              activeFilters={activeFilters}
              filterConfig={filterConfig}
              clearFilter={clearFilter}
              clearAllFilters={clearAllFilters}
            />
            <FilterSummary
              filteredDataLength={filteredData.length}
              totalDataLength={balances.length}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredData}
          searchKey="search"
          searchFields={["riderName", "riderEmail", "riderId"]}
          searchParamKey="search"
          title="Rider Balances"
          description={`All rider balances (${balances.length} total)`}
          emptyStateTitle="No Balances Found"
          emptyStateDescription="No rider balances match your search criteria. Try adjusting your filters or search terms."
          emptyStateIcon={UsersIcon}
          className={className}
          onRowClick={handleRowClick}
          searchBar={searchBar}
        />
      </div>

      {/* Rider Balance Details Drawer */}
      <RiderBalanceDetailsDrawer
        balance={selectedBalance}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onBalanceUpdate={refetchData}
      />
    </>
  );
}
