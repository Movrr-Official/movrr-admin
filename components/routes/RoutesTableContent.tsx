"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";

import { ActiveFiltersDisplay } from "../filters/ActiveFiltersDisplay";
import { getRoutesTableColumns } from "./RoutesTableColumns";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "../skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "../filters/FilterSummary";
import { RiderRoute } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import { Plus, Route as RouteIcon } from "lucide-react";
import { RouteDetailsDrawer } from "@/components/routes/RouteDetailsDrawer";
import { approveRoute, deleteRoute, rejectRoute } from "@/app/actions/routes";
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

interface RoutesTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function RoutesTableContent({
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: RoutesTableContentProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [selectedRoute, setSelectedRoute] = useState<RiderRoute | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<RiderRoute | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: routes,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    isLoading: filtersLoading,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  // Handle route row click - open detail view
  const handleRowClick = (route: RiderRoute) => {
    setSelectedRoute(route);
    setIsDrawerOpen(true);
  };

  // Handle route actions
  const handleEdit = (route: RiderRoute) => {
    setSelectedRoute(route);
    setIsDrawerOpen(true);
    // Edit mode can be handled in the drawer
  };

  const handleView = (route: RiderRoute) => {
    setSelectedRoute(route);
    setIsDrawerOpen(true);
  };

  const handleApprove = async (route: RiderRoute) => {
    try {
      const result = await approveRoute(route.id);

      if (!result.success) {
        throw new Error(result.error || "Failed to approve route");
      }

      toast({
        title: "Route Approved",
        description: `Route "${route.name}" has been approved successfully.`,
      });

      refetchData?.();
    } catch (error) {
      toast({
        title: "Approval Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to approve route. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (route: RiderRoute) => {
    // Rejection with reason is handled in the drawer
    setSelectedRoute(route);
    setIsDrawerOpen(true);
  };

  const handleDelete = (route: RiderRoute) => {
    setRouteToDelete(route);
  };

  const confirmDelete = async () => {
    if (!routeToDelete) return;
    setIsDeleting(true);

    const result = await deleteRoute({ routeId: routeToDelete.id });
    setIsDeleting(false);

    if (!result.success) {
      toast({
        title: "Delete Failed",
        description: result.error || "Failed to delete route.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Route Deleted",
      description: `Route "${routeToDelete.name}" has been deleted successfully.`,
    });
    setRouteToDelete(null);
    refetchData?.();
  };

  const columns = React.useMemo(
    () =>
      getRoutesTableColumns({
        onEdit: handleEdit,
        onView: handleView,
        onDelete: handleDelete,
        onApprove: handleApprove,
        onReject: handleReject,
      }),
    [handleApprove, handleReject],
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
              placeholder: "Search routes by name, city, or zone...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "routes_export",
              formats: ["csv", "xlsx", "json"],
            }}
            additionalActionsRight={{
              enabled: true,
              path: "/routes/create",
              label: "Create Route",
              icon: Plus,
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
              totalDataLength={routes.length}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredData}
          searchKey="search"
          searchFields={["name", "city", "zone", "brand"]}
          searchParamKey="search"
          title="Routes"
          description={`All routes (${routes.length} total)`}
          emptyStateTitle="No Routes Found"
          emptyStateDescription="No routes match your search criteria. Try adjusting your filters or search terms."
          emptyStateIcon={RouteIcon}
          className={className}
          onRowClick={handleRowClick}
          searchBar={searchBar}
          statusFilters={{
            enabled: true,
            statusKey: "status",
            options: [
              { value: "all", label: "All" },
              { value: "assigned", label: "Assigned" },
              { value: "in-progress", label: "In Progress" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ],
          }}
        />
      </div>

      {/* Route Details Drawer */}
      <RouteDetailsDrawer
        route={selectedRoute}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onRouteUpdate={refetchData}
      />

      <AlertDialog
        open={Boolean(routeToDelete)}
        onOpenChange={(open) => {
          if (!open) setRouteToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete route</AlertDialogTitle>
            <AlertDialogDescription>
              This action permanently deletes the route and related assignments.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete route"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
