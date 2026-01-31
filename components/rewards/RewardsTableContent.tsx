"use client";

import React, { useState } from "react";

import { ActiveFiltersDisplay } from "../filters/ActiveFiltersDisplay";
import { getRewardsTableColumns } from "./RewardsTableColumns";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "../skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "../filters/FilterSummary";
import { RewardTransaction } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { Coins as CoinsIcon } from "lucide-react";
import { RiderTransactionsDetailsDrawer } from "@/components/rewards/RiderTransactionsDetailsDrawer";

interface RewardsTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function RewardsTableContent({
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: RewardsTableContentProps) {
  const [selectedTransaction, setSelectedTransaction] =
    useState<RewardTransaction | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const {
    data: transactions,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    isLoading: filtersLoading,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  const handleView = (transaction: RewardTransaction) => {
    setSelectedTransaction(transaction);
    setIsDrawerOpen(true);
  };

  const handleRowClick = (transaction: RewardTransaction) => {
    setSelectedTransaction(transaction);
    setIsDrawerOpen(true);
  };

  const columns = React.useMemo(
    () =>
      getRewardsTableColumns({
        onView: handleView,
      }),
    [handleView],
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
              placeholder: "Search transactions by rider, description...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "rewards_transactions_export",
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
              totalDataLength={transactions.length}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredData}
          searchKey="search"
          searchFields={["riderId", "description", "campaignId", "routeId"]}
          searchParamKey="search"
          title="Reward Transactions"
          description={`All transactions (${transactions.length} total)`}
          emptyStateTitle="No Transactions Found"
          emptyStateDescription="No reward transactions match your search criteria. Try adjusting your filters or search terms."
          emptyStateIcon={CoinsIcon}
          className={className}
          onRowClick={handleRowClick}
          searchBar={searchBar}
          statusFilters={{
            enabled: true,
            statusKey: "type",
            options: [
              { value: "all", label: "All" },
              { value: "awarded", label: "Awarded" },
              { value: "redeemed", label: "Redeemed" },
              { value: "adjusted", label: "Adjusted" },
            ],
          }}
        />
      </div>

      <RiderTransactionsDetailsDrawer
        transaction={selectedTransaction}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </>
  );
}
