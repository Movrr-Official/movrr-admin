"use client";

import { useState } from "react";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { ActiveFiltersDisplay } from "@/components/filters/ActiveFiltersDisplay";
import { FilterSummary } from "@/components/filters/FilterSummary";
import { getCommunityRidesTableColumns } from "./CommunityRidesTableColumns";
import { CommunityRideDetailsDrawer } from "./CommunityRideDetailsDrawer";
import { CommunityRideFormDrawer } from "./CommunityRideFormDrawer";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import {
  useUpdateCommunityRide,
  useDeleteCommunityRide,
} from "@/hooks/useCommunityRidesData";
import { CommunityRide } from "@/schemas";
import { Plus } from "lucide-react";

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
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [formRide, setFormRide] = useState<CommunityRide | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

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
    setIsDetailsOpen(true);
  };

  const handleEdit = (ride: CommunityRide) => {
    setFormRide(ride);
    setIsFormOpen(true);
  };

  const handleCreate = () => {
    setFormRide(null);
    setIsFormOpen(true);
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
    onEdit: handleEdit,
    onCancel: handleCancel,
    onDelete: handleDelete,
  });

  if (isLoading) {
    return <DataTableSkeleton columnCount={6} rowCount={8} />;
  }

  return (
    <>
      <div className="space-y-4">
        {toolbar && (
          <DataTableToolbar
            additionalActionsLeft={{
              enabled: true,
              label: "Create Ride",
              icon: Plus,
              onClick: handleCreate,
            }}
            refresh={{
              enabled: true,
              onRefresh: refetchData,
              isLoading: isRefetching,
            }}
          />
        )}

        {activeFilterCount > 0 && (
          <ActiveFiltersDisplay
            activeFilters={activeFilters}
            filterConfig={filterConfig}
            clearFilter={clearFilter}
            clearAllFilters={clearAllFilters}
          />
        )}

        <FilterSummary
          filteredDataLength={filteredData.length}
          totalDataLength={filteredData.length}
          activeFilterCount={activeFilterCount}
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
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedRide(null);
        }}
      />

      <CommunityRideFormDrawer
        ride={formRide}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={refetchData}
      />
    </>
  );
}
