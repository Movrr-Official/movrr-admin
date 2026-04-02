"use client";

import { useState } from "react";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { ActiveFiltersDisplay } from "@/components/filters/ActiveFiltersDisplay";
import { FilterSummary } from "@/components/filters/FilterSummary";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus } from "lucide-react";
import { getProTipsTableColumns } from "./ProTipsTableColumns";
import { ProTipFormDrawer } from "./ProTipFormDrawer";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import { useDeleteProTip, useToggleProTipActive } from "@/hooks/useProTipsData";
import { ProTip } from "@/schemas";

interface ProTipsTableContentProps {
  isLoading: boolean;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function ProTipsTableContent({
  isLoading,
  refetchData,
  isRefetching = false,
}: ProTipsTableContentProps) {
  const { toast } = useToast();
  const [editTip, setEditTip] = useState<ProTip | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [tipToDelete, setTipToDelete] = useState<ProTip | null>(null);

  const deleteMutation = useDeleteProTip();
  const toggleMutation = useToggleProTipActive();

  const {
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  const handleEdit = (tip: ProTip) => {
    setEditTip(tip);
    setIsFormOpen(true);
  };

  const handleCreate = () => {
    setEditTip(null);
    setIsFormOpen(true);
  };

  const handleToggleActive = async (tip: ProTip) => {
    const result = await toggleMutation.mutateAsync({
      id: tip.id,
      isActive: !tip.isActive,
    });
    if (!result.success) {
      toast({
        title: "Failed to update tip",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!tipToDelete) return;
    const result = await deleteMutation.mutateAsync(tipToDelete.id);
    if (result.success) {
      toast({ title: "Tip deleted" });
      refetchData?.();
    } else {
      toast({
        title: "Failed to delete",
        description: result.error,
        variant: "destructive",
      });
    }
    setTipToDelete(null);
  };

  const columns = getProTipsTableColumns({
    onEdit: handleEdit,
    onDelete: setTipToDelete,
    onToggleActive: handleToggleActive,
  });

  if (isLoading) {
    return <DataTableSkeleton columnCount={5} rowCount={8} />;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <DataTableToolbar
            refresh={{
              enabled: true,
              onRefresh: refetchData,
              isLoading: isRefetching,
            }}
          />
          <Button onClick={handleCreate} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Tip
          </Button>
        </div>

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
          entityName="tip"
        />

        <DataTable columns={columns} data={filteredData as ProTip[]} />
      </div>

      <ProTipFormDrawer
        tip={editTip}
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditTip(null);
        }}
      />

      <AlertDialog
        open={!!tipToDelete}
        onOpenChange={(open) => !open && setTipToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tip?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the tip from the app. This cannot be
              undone. To hide it temporarily, deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
