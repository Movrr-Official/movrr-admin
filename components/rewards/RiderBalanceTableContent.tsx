"use client";

import React, { useEffect, useState } from "react";

import { getRiderBalanceTableColumns } from "./RiderBalanceTableColumns";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "../skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { RiderBalance } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
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
  const { selectedId, setSelectedId } = useDrawerQueryId();
  const [selectedBalance, setSelectedBalance] = useState<RiderBalance | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const {
    data: balances,
    filteredData,
  } = useDataTable();

  useEffect(() => {
    if (!selectedId) {
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        setSelectedBalance(null);
      }
      return;
    }
    const found =
      balances.find((balance) => balance.riderId === selectedId) ?? null;
    setSelectedBalance(found);
    setIsDrawerOpen(true);
  }, [selectedId, balances]);

  useEffect(() => {
    if (!selectedBalance || !isDrawerOpen) return;

    const latestBalance = balances.find(
      (balance) => balance.riderId === selectedBalance.riderId,
    );
    if (!latestBalance) {
      setIsDrawerOpen(false);
      setSelectedBalance(null);
      setSelectedId(null);
      return;
    }

    const hasChanged =
      latestBalance.currentBalance !== selectedBalance.currentBalance ||
      latestBalance.totalPointsAwarded !== selectedBalance.totalPointsAwarded ||
      latestBalance.totalPointsRedeemed !==
        selectedBalance.totalPointsRedeemed ||
      latestBalance.riderName !== selectedBalance.riderName ||
      latestBalance.riderEmail !== selectedBalance.riderEmail ||
      latestBalance.lastTransactionDate !==
        selectedBalance.lastTransactionDate;

    if (hasChanged) {
      setSelectedBalance(latestBalance);
    }
  }, [balances, selectedBalance, isDrawerOpen, setSelectedId]);

  const openBalanceDrawer = (balance: RiderBalance) => {
    setSelectedBalance(balance);
    setIsDrawerOpen(true);
    setSelectedId(balance.riderId);
  };

  const handleView = (balance: RiderBalance) => {
    openBalanceDrawer(balance);
  };

  const handleAdjust = (balance: RiderBalance) => {
    openBalanceDrawer(balance);
  };

  const handleRowClick = (balance: RiderBalance) => {
    openBalanceDrawer(balance);
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
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            setSelectedBalance(null);
            setSelectedId(null);
          }
        }}
        onBalanceUpdate={refetchData}
      />
    </>
  );
}
