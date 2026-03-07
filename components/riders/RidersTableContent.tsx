"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bike, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Rider } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { ActiveFiltersDisplay } from "@/components/filters/ActiveFiltersDisplay";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "@/components/filters/FilterSummary";
import { RiderDetailsDrawer } from "./RiderDetailsDrawer";
import { getRidersTableColumns } from "./RidersTableColumns";

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
