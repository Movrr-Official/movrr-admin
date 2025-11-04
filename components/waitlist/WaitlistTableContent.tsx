"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bike, MapPin, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { ActiveFiltersDisplay } from "../filters/ActiveFiltersDisplay";
import { getWaitlistTableColumns } from "./WaitlistTableColumns";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "../skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "../filters/FilterSummary";
import { WaitlistEntry } from "@/types/types";
import { ScheduleManager } from "../export/ScheduleManager";
import { StatusUpdateDialog } from "../StatusUpdateDialog";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import { updateWaitlistStatus } from "@/app/actions/waitlist";

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  isLoading: boolean;
  toolbar?: boolean;
  showScheduleManager?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

// Internal content component that uses the context
export default function WaitlistTableContent({
  isLoading,
  toolbar = false,
  showScheduleManager = false,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: Omit<WaitlistTableProps, "entries">) {
  const searchParams = useSearchParams();
  const [isSearching, setIsSearching] = React.useState(false);
  const searchValue = searchParams.get("search") || "";
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(
    null
  );
  const { toast } = useToast();

  const {
    data: entries,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    isLoading: filtersLoading,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  // Handle status update from dropdown menu
  const handleStatusUpdateClick = (entry: WaitlistEntry) => {
    setSelectedEntry(entry);
    setStatusDialogOpen(true);
  };

  // Handle actual status update confirmation with server action
  const handleStatusUpdate = async (
    id: string,
    newStatus: "pending" | "approved" | "rejected",
    reason?: string
  ) => {
    try {
      // Calls server action
      const result = await updateWaitlistStatus(id, newStatus, reason);

      if (!result.success) {
        throw new Error(result.error);
      }

      refetchData?.();

      toast({
        title: "Status Updated",
        description: `Entry status has been updated to ${newStatus}`,
        variant: "default",
      });

      // Close dialog
      setStatusDialogOpen(false);
      setSelectedEntry(null);
    } catch (error) {
      toast({
        title: "Update Failed",
        description:
          error instanceof Error ? error.message : "Failed to update status",
        variant: "destructive",
      });

      console.error("Status update failed:", error);
    }
  };

  // Gets columns with stable callbacks
  const tableColumns = useMemo(() => {
    return getWaitlistTableColumns({
      onStatusUpdate: handleStatusUpdateClick,
    });
  }, []); // Empty dependencies since handlers are stable

  // Analytics data for dataSources
  const analyticsData = useMemo(() => {
    const totalSignups = entries.length;
    const bikeOwners = entries.filter(
      (entry) => entry.bike_ownership === "yes"
    ).length;
    const planningBike = entries.filter(
      (entry) => entry.bike_ownership === "planning"
    ).length;
    const noBike = entries.filter(
      (entry) => entry.bike_ownership === "no"
    ).length;

    // Top cities
    const cityCounts = entries.reduce(
      (acc, entry) => {
        if (entry.city) {
          acc[entry.city] = (acc[entry.city] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );

    const topCities = (Object.entries(cityCounts) as [string, number][])
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return {
      totalSignups,
      bikeOwners,
      planningBike,
      noBike,
      topCities,
    };
  }, [entries]);

  // Data sources for export
  const dataSources = useMemo(
    () => [
      {
        id: "waitlist",
        name: "Waitlist Entries",
        description: "Complete pre-launch waitlist database",
        data: entries,
        icon: Users,
        color: "text-chart-2",
        bgColor: "bg-chart-2/10",
        borderColor: "border-chart-2/30",
      },
      {
        id: "cities",
        name: "City Analytics",
        description: "Geographic distribution and city statistics",
        data: analyticsData.topCities.map(([city, count]) => ({
          id: city,
          city,
          signups: count,
          created_at: new Date().toISOString(),
        })),
        icon: MapPin,
        color: "text-primary",
        bgColor: "bg-primary/10",
        borderColor: "border-primary/30",
      },
      {
        id: "bike_ownership",
        name: "Bike Ownership Data",
        description: "User bike ownership breakdown and statistics",
        data: [
          {
            category: "owns_bike",
            count: analyticsData.bikeOwners,
            percentage: Math.round(
              (analyticsData.bikeOwners / analyticsData.totalSignups) * 100
            ),
          },
          {
            category: "planning_bike",
            count: analyticsData.planningBike,
            percentage: Math.round(
              (analyticsData.planningBike / analyticsData.totalSignups) * 100
            ),
          },
          {
            category: "no_bike",
            count: analyticsData.noBike,
            percentage: Math.round(
              (analyticsData.noBike / analyticsData.totalSignups) * 100
            ),
          },
        ],
        icon: Bike,
        color: "text-chart-3",
        bgColor: "bg-chart-3/10",
        borderColor: "border-chart-3/30",
      },
    ],
    [entries, analyticsData]
  );

  // Sample scheduled exports
  const sampleScheduledExports = useMemo(
    () => [
      {
        id: "daily-waitlist",
        name: "Daily Waitlist Export",
        description: "Automated daily export of all waitlist entries",
        dataSourceId: "waitlist",
        exportOptions: {
          format: "csv" as const,
          filename: "daily_waitlist_export",
          includeHeaders: true,
        },
        schedule: {
          type: "daily" as const,
          time: "09:00",
          timezone: "UTC",
        },
        isActive: true,
        createdAt: new Date("2024-01-01"),
        nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        runCount: 15,
      },
      {
        id: "weekly-analytics",
        name: "Weekly Analytics Report",
        description: "Comprehensive weekly report with all data sources",
        dataSourceId: "cities",
        exportOptions: {
          format: "xlsx" as const,
          filename: "weekly_analytics_report",
          includeHeaders: true,
        },
        schedule: {
          type: "weekly" as const,
          time: "08:00",
          dayOfWeek: 1, // Monday
          timezone: "UTC",
        },
        isActive: true,
        createdAt: new Date("2024-01-01"),
        nextRun: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next Monday
        runCount: 4,
      },
    ],
    []
  );

  // Loading state when search changes and we have entries
  useEffect(() => {
    if (searchValue && entries.length > 0) {
      setIsSearching(true);
      const timer = setTimeout(() => {
        setIsSearching(false);
      }, 300); // Short delay to show loading state

      return () => clearTimeout(timer);
    } else {
      setIsSearching(false);
    }
  }, [searchValue, entries.length]);

  // Initial loading or search loading
  const showLoading = isLoading || isSearching;
  const rowCount = entries.length > 0 ? entries.length : 5;

  // Data to display in the table (filtered or original)
  const tableData = activeFilterCount > 0 ? filteredData : entries;

  return (
    <>
      {/* Status Update Dialog */}
      <StatusUpdateDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        entry={selectedEntry}
        onStatusUpdate={handleStatusUpdate}
      />

      {toolbar && (
        <DataTableToolbar
          search={{
            enabled: true,
            placeholder: "Search waitlist...",
          }}
          export={{
            enabled: true,
            data: entries || [],
            filename: "waitlist_export",
          }}
          batchExport={{
            enabled: true,
            dataSources: dataSources,
          }}
          scheduledExport={{
            enabled: false,
            dataSources: dataSources,
          }}
          refresh={{
            enabled: true,
            onRefresh: refetchData,
            isLoading: isRefetching,
          }}
        />
      )}

      {/* Active Filters Display and Filter Summary below the toolbar */}
      <ActiveFiltersDisplay
        activeFilters={activeFilters}
        filterConfig={filterConfig}
        clearFilter={clearFilter}
        clearAllFilters={clearAllFilters}
        variant="default"
      />

      <FilterSummary
        filteredDataLength={filteredData.length}
        totalDataLength={tableData.length}
        activeFilterCount={activeFilterCount}
        isLoading={filtersLoading}
      />

      {showLoading ? (
        <DataTableSkeleton
          title="Loading Waitlist"
          description="Fetching waitlist entries..."
          rowCount={rowCount}
          columnCount={5}
          className={className}
        />
      ) : (
        <DataTable
          columns={tableColumns}
          data={tableData}
          searchFields={["name", "email"]}
          searchParamKey="search"
          searchBar={searchBar}
          className={className}
        />
      )}

      {showScheduleManager && (
        <ScheduleManager
          schedules={sampleScheduledExports}
          onToggleSchedule={(id, isActive) => {
            console.log(`Toggle schedule ${id} to ${isActive}`);
            // In a real app, this would update the schedule in the database
          }}
          onDeleteSchedule={(id) => {
            console.log(`Delete schedule ${id}`);
            // In a real app, this would delete the schedule from the database
          }}
          onEditSchedule={(id) => {
            console.log(`Edit schedule ${id}`);
            // In a real app, this would open an edit dialog
          }}
          onRunNow={(id) => {
            console.log(`Run schedule ${id} now`);
            // In a real app, this would trigger an immediate export
          }}
        />
      )}
    </>
  );
}
