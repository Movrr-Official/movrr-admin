"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Building2, Plus } from "lucide-react";

import { Advertiser } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { ActiveFiltersDisplay } from "@/components/filters/ActiveFiltersDisplay";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "@/components/filters/FilterSummary";
import { AdvertiserDetailsDrawer } from "./AdvertiserDetailsDrawer";
import { getAdvertisersTableColumns } from "./AdvertisersTableColumns";

interface AdvertisersTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function AdvertisersTableContent({
  isLoading,
  toolbar = true,
  searchBar = false,
  className,
  refetchData,
  isRefetching = false,
}: AdvertisersTableContentProps) {
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<Advertiser | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const {
    data: advertisers,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  useEffect(() => {
    if (!selectedAdvertiser || !isDrawerOpen) return;

    const latestAdvertiser = advertisers.find(
      (item) => item.id === selectedAdvertiser.id,
    );
    if (!latestAdvertiser) {
      setIsDrawerOpen(false);
      setSelectedAdvertiser(null);
      return;
    }

    const hasChanged =
      latestAdvertiser.updatedAt !== selectedAdvertiser.updatedAt ||
      latestAdvertiser.status !== selectedAdvertiser.status ||
      latestAdvertiser.companyName !== selectedAdvertiser.companyName ||
      latestAdvertiser.email !== selectedAdvertiser.email ||
      latestAdvertiser.phone !== selectedAdvertiser.phone ||
      latestAdvertiser.totalCampaigns !== selectedAdvertiser.totalCampaigns;

    if (hasChanged) {
      setSelectedAdvertiser(latestAdvertiser);
    }
  }, [advertisers, selectedAdvertiser, isDrawerOpen]);

  const handleRowClick = (advertiser: Advertiser) => {
    setSelectedAdvertiser(advertiser);
    setIsDrawerOpen(true);
  };

  const columns = useMemo(
    () =>
      getAdvertisersTableColumns({
        onView: (advertiser) => {
          setSelectedAdvertiser(advertiser);
          setIsDrawerOpen(true);
        },
        onEdit: (advertiser) => {
          setSelectedAdvertiser(advertiser);
          setIsDrawerOpen(true);
        },
        onDelete: (advertiser) => {
          setSelectedAdvertiser(advertiser);
          setIsDrawerOpen(true);
        },
      }),
    [],
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
              placeholder: "Search advertisers by company, contact, or email...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "advertisers_export",
              formats: ["csv", "xlsx", "json"],
            }}
            additionalActionsRight={{
              enabled: true,
              label: "Add Advertiser",
              icon: Plus,
              path: "/advertisers/create",
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
              totalDataLength={advertisers.length}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        <DataTable
          columns={columns}
          data={filteredData}
          searchKey="search"
          searchFields={["companyName", "contactName", "email"]}
          searchParamKey="search"
          title="Advertisers"
          description={`All advertiser profiles (${advertisers.length} total)`}
          emptyStateTitle="No Advertisers Found"
          emptyStateDescription="No advertiser profiles match your current filters."
          emptyStateIcon={Building2}
          className={className}
          onRowClick={handleRowClick}
          searchBar={searchBar}
        />
      </div>

      <AdvertiserDetailsDrawer
        advertiser={selectedAdvertiser}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onAdvertiserUpdate={refetchData}
      />
    </>
  );
}
