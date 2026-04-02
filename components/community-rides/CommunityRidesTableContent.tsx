"use client";

import { useState } from "react";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { ActiveFiltersDisplay } from "@/components/filters/ActiveFiltersDisplay";
import { FilterSummary } from "@/components/filters/FilterSummary";
import { getCommunityRidesTableColumns } from "./CommunityRidesTableColumns";
import { CommunityRideDetailsDrawer } from "./CommunityRideDetailsDrawer";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import {
  useUpdateCommunityRide,
  useDeleteCommunityRide,
} from "@/hooks/useCommunityRidesData";
import { CommunityRide } from "@/schemas";

interface CommunityRidesTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function CommunityRidesTableContent({
  isLoading,
  toolbar = true,
  refetchData,
  isRefetching = false,
}: CommunityRidesTableContentProps) {
  const { toast } = useToast();
  const [selectedRide, setSelectedRide] = useState<CommunityRide | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const updateMutation = useUpdateCommunityRide();
  const deleteMutation = useDeleteCommunityRide();

  const {
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  const handleView = (ride: CommunityRide) => {
    setSelectedRide(ride);
    setIsDrawerOpen(true);
  };

  const handleCancel = async (ride: CommunityRide) => {
    const result = await updateMutation.mutateAsync({
      id: ride.id,
      status: "cancelled",
    });
    if (result.success) {
      toast({ title: "Ride cancelled" });
      refetchData?.();
    } else {
      toast({
        title: "Failed to cancel",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (ride: CommunityRide) => {
    const result = await deleteMutation.mutateAsync(ride.id);
    if (result.success) {
      toast({ title: "Ride deleted" });
      refetchData?.();
    } else {
      toast({
        title: "Failed to delete",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const columns = getCommunityRidesTableColumns({
    onView: handleView,
    onCancel: handleCancel,
    onDelete: handleDelete,
  });

  if (isLoading) {
    return <DataTableSkeleton columns={6} rows={8} />;
  }

  return (
    <>
      <div className="space-y-4">
        {toolbar && (
          <DataTableToolbar
            refetchData={refetchData}
            isRefetching={isRefetching}
            filterConfig={filterConfig}
            activeFilterCount={activeFilterCount}
          />
        )}

        {activeFilterCount > 0 && (
          <ActiveFiltersDisplay
            filters={activeFilters}
            filterConfig={filterConfig}
            onClearFilter={clearFilter}
            onClearAll={clearAllFilters}
          />
        )}

        <FilterSummary
          totalCount={filteredData.length}
          filteredCount={filteredData.length}
          entityName="ride"
        />

        <DataTable
          columns={columns}
          data={filteredData as CommunityRide[]}
          onRowClick={handleView}
        />
      </div>

      <CommunityRideDetailsDrawer
        ride={selectedRide}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedRide(null);
        }}
      />
    </>
  );
}
