"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { getCommunityRidesTableColumns } from "./CommunityRidesTableColumns";
import { CommunityRideDetailsDrawer } from "./CommunityRideDetailsDrawer";
import { CommunityRideFormDrawer } from "./CommunityRideFormDrawer";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
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
  const { selectedId, setSelectedId } = useDrawerQueryId();
  const [selectedRide, setSelectedRide] = useState<CommunityRide | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [formRide, setFormRide] = useState<CommunityRide | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const updateMutation = useUpdateCommunityRide();
  const deleteMutation = useDeleteCommunityRide();

  const {
    data: rides,
    filteredData,
  } = useDataTable();

  useEffect(() => {
    if (!selectedId) {
      if (isDetailsOpen) {
        setIsDetailsOpen(false);
        setSelectedRide(null);
      }
      return;
    }
    const found =
      (rides as CommunityRide[]).find((ride) => ride.id === selectedId) ?? null;
    setSelectedRide(found);
    setIsDetailsOpen(true);
  }, [selectedId, rides]);

  useEffect(() => {
    if (!selectedRide || !isDetailsOpen) return;

    const latestRide = (rides as CommunityRide[]).find(
      (ride) => ride.id === selectedRide.id,
    );
    if (!latestRide) {
      setIsDetailsOpen(false);
      setSelectedRide(null);
      setSelectedId(null);
      return;
    }

    const hasChanged =
      latestRide.status !== selectedRide.status ||
      latestRide.title !== selectedRide.title ||
      latestRide.scheduledAt !== selectedRide.scheduledAt ||
      latestRide.organizerName !== selectedRide.organizerName ||
      latestRide.description !== selectedRide.description ||
      latestRide.meetingPointName !== selectedRide.meetingPointName;

    if (hasChanged) {
      setSelectedRide(latestRide);
    }
  }, [rides, selectedRide, isDetailsOpen, setSelectedId]);

  const handleView = (ride: CommunityRide) => {
    setSelectedRide(ride);
    setIsDetailsOpen(true);
    setSelectedId(ride.id);
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
          setSelectedId(null);
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
