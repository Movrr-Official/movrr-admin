"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bike, Download, Loader2, Plus, ShieldOff, UserCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Rider } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { ActiveFiltersDisplay } from "@/components/filters/ActiveFiltersDisplay";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "@/components/filters/FilterSummary";
import { Button } from "@/components/ui/button";
import { RiderDetailsDrawer } from "./RiderDetailsDrawer";
import { getRidersTableColumns } from "./RidersTableColumns";
import { bulkUpdateRiderStatus } from "@/app/actions/riders";
import { useToast } from "@/hooks/useToast";
import { exportToCSV } from "@/lib/export";

interface RidersTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function RidersTableContent({
  isLoading,
  toolbar = true,
  searchBar = false,
  className,
  refetchData,
  isRefetching = false,
}: RidersTableContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Rider[]>([]);
  const [isBulkPending, setIsBulkPending] = useState(false);
  const { toast } = useToast();

  const {
    data: riders,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  useEffect(() => {
    if (!selectedRider || !isDrawerOpen) return;

    const latestRider = riders.find((item) => item.id === selectedRider.id);
    if (!latestRider) {
      setIsDrawerOpen(false);
      setSelectedRider(null);
      return;
    }

    const hasChanged =
      latestRider.updatedAt !== selectedRider.updatedAt ||
      latestRider.status !== selectedRider.status ||
      latestRider.name !== selectedRider.name ||
      latestRider.email !== selectedRider.email ||
      latestRider.pointsBalance !== selectedRider.pointsBalance ||
      latestRider.activeRoutesCount !== selectedRider.activeRoutesCount ||
      latestRider.activeCampaignsCount !== selectedRider.activeCampaignsCount;

    if (hasChanged) {
      setSelectedRider(latestRider);
    }
  }, [isDrawerOpen, riders, selectedRider]);

  useEffect(() => {
    const selectedId = searchParams.get("selected");
    if (!selectedId) return;

    const rider =
      riders.find((entry) => entry.id === selectedId || entry.userId === selectedId) ??
      null;
    if (rider) {
      setSelectedRider(rider);
      setIsDrawerOpen(true);
    }
  }, [riders, searchParams]);

  const updateSelectedParam = (riderId?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (riderId) {
      params.set("selected", riderId);
    } else {
      params.delete("selected");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleRowClick = (rider: Rider) => {
    setSelectedRider(rider);
    setIsDrawerOpen(true);
    updateSelectedParam(rider.id);
  };

  const handleDrawerChange = (open: boolean) => {
    setIsDrawerOpen(open);
    if (!open) {
      setSelectedRider(null);
      updateSelectedParam(undefined);
    }
  };

  const handleBulkStatusChange = async (status: "active" | "inactive") => {
    if (!selectedRows.length) return;
    setIsBulkPending(true);
    try {
      const result = await bulkUpdateRiderStatus(
        selectedRows.map((r) => r.id),
        status,
      );
      if (result.success) {
        toast({
          title: `${result.updated} rider${result.updated !== 1 ? "s" : ""} ${status === "active" ? "activated" : "suspended"}`,
        });
        setSelectedRows([]);
        refetchData?.();
      } else {
        toast({ title: "Bulk action failed", description: result.error, variant: "destructive" });
      }
    } finally {
      setIsBulkPending(false);
    }
  };

  const handleBulkExport = () => {
    if (!selectedRows.length) return;
    const rows = selectedRows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      status: r.status,
      city: r.city ?? "",
      country: r.country ?? "",
      vehicleType: r.vehicleType ?? "",
      isCertified: r.isCertified,
      pointsBalance: r.pointsBalance ?? 0,
      totalRides: r.totalRides ?? 0,
      lastActive: r.lastActivityAt ?? r.lastActive ?? "",
    }));
    exportToCSV(rows, { filename: `riders_bulk_export_${new Date().toISOString().split("T")[0]}`, format: "csv" });
  };

  const columns = useMemo(
    () =>
      getRidersTableColumns({
        onView: handleRowClick,
      }),
    [searchParams],
  );

  if (isLoading) {
    return <DataTableSkeleton className={className} />;
  }

  return (
    <>
      <div className="space-y-4">
        {toolbar && (
          <DataTableToolbar
            search={{
              enabled: true,
              placeholder: "Search riders by name, email, city, or country...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "riders_export",
              formats: ["csv", "xlsx", "json"],
            }}
            additionalActionsRight={{
              enabled: true,
              label: "Add Rider",
              icon: Plus,
              path: "/users/create?role=rider",
            }}
            refresh={{
              enabled: true,
              onRefresh: refetchData,
              isLoading: isRefetching,
            }}
          />
        )}

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
              totalDataLength={riders.length}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        {selectedRows.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/40 px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">
              {selectedRows.length} rider{selectedRows.length !== 1 ? "s" : ""} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkExport}
                disabled={isBulkPending}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkStatusChange("active")}
                disabled={isBulkPending}
                className="text-green-700 border-green-300 hover:bg-green-50"
              >
                {isBulkPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserCheck className="mr-1.5 h-3.5 w-3.5" />}
                Activate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkStatusChange("inactive")}
                disabled={isBulkPending}
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                {isBulkPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="mr-1.5 h-3.5 w-3.5" />}
                Suspend
              </Button>
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          data={filteredData}
          searchKey="search"
          searchFields={["name", "email", "city", "country"]}
          searchParamKey="search"
          title="Riders"
          description={`All rider operations profiles (${riders.length} total)`}
          emptyStateTitle="No Riders Found"
          emptyStateDescription="No rider profiles match your current filters."
          emptyStateIcon={Bike}
          className={className}
          onRowClick={handleRowClick}
          searchBar={searchBar}
          enableRowSelection
          onSelectionChange={setSelectedRows}
        />
      </div>

      <RiderDetailsDrawer
        rider={selectedRider}
        open={isDrawerOpen}
        onOpenChange={handleDrawerChange}
        onRiderUpdate={refetchData}
      />
    </>
  );
}
