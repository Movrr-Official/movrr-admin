"use client";

import React, { useEffect, useState } from "react";
import { Timer } from "lucide-react";

import { RideSession } from "@/schemas";
import { FilterConfig } from "@/lib/applyFilters";
import { DataTableContainer } from "@/context/DataTableContext";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { ActiveFiltersDisplay } from "@/components/filters/ActiveFiltersDisplay";
import { FilterSummary } from "@/components/filters/FilterSummary";
import { useDataTable } from "@/context/DataTableContext";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
import { getRideSessionsTableColumns } from "./RideSessionsTableColumns";
import { RideSessionDetailsDrawer } from "./RideSessionDetailsDrawer";

interface RideSessionsTableProps {
  sessions: RideSession[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

function RideSessionsTableContent({
  isLoading,
  toolbar,
  searchBar,
  className,
  refetchData,
  isRefetching,
}: Omit<RideSessionsTableProps, "sessions">) {
  const { selectedId, setSelectedId } = useDrawerQueryId();
  const [selectedSession, setSelectedSession] = useState<RideSession | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const {
    data: sessions,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  useEffect(() => {
    if (!selectedId) {
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        setSelectedSession(null);
      }
      return;
    }
    const found =
      sessions.find((session) => session.id === selectedId) ?? null;
    setSelectedSession(found);
    setIsDrawerOpen(true);
  }, [selectedId, sessions]);

  useEffect(() => {
    if (!selectedSession || !isDrawerOpen) return;

    const latestSession = sessions.find(
      (session) => session.id === selectedSession.id,
    );
    if (!latestSession) {
      setIsDrawerOpen(false);
      setSelectedSession(null);
      setSelectedId(null);
      return;
    }

    const hasChanged =
      latestSession.status !== selectedSession.status ||
      latestSession.verificationStatus !== selectedSession.verificationStatus ||
      latestSession.endedAt !== selectedSession.endedAt ||
      latestSession.pointsAwarded !== selectedSession.pointsAwarded ||
      latestSession.verifiedMinutes !== selectedSession.verifiedMinutes ||
      latestSession.riderName !== selectedSession.riderName ||
      latestSession.campaignName !== selectedSession.campaignName;

    if (hasChanged) {
      setSelectedSession(latestSession);
    }
  }, [sessions, selectedSession, isDrawerOpen, setSelectedId]);

  const handleView = (session: RideSession) => {
    setSelectedSession(session);
    setIsDrawerOpen(true);
    setSelectedId(session.id);
  };

  const columns = React.useMemo(
    () => getRideSessionsTableColumns({ onView: handleView }),
    [],
  );

  if (isLoading) return <DataTableSkeleton className={className} />;

  return (
    <>
      <div className="space-y-4">
        {toolbar && (
          <DataTableToolbar
            search={{
              enabled: true,
              placeholder: "Search by rider, session ID, city...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "ride_sessions_export",
              formats: ["csv", "xlsx", "json"],
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
              totalDataLength={sessions.length}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        <DataTable
          columns={columns}
          data={filteredData}
          searchKey="search"
          searchFields={["riderId", "riderName", "campaignName", "city", "id"]}
          searchParamKey="search"
          title="Ride Sessions"
          description={`All ride sessions (${sessions.length} total)`}
          emptyStateTitle="No Ride Sessions Found"
          emptyStateDescription="No ride sessions match your search criteria. Try adjusting your filters."
          emptyStateIcon={Timer}
          className={className}
          onRowClick={handleView}
          searchBar={searchBar}
          statusFilters={{
            enabled: true,
            statusKey: "verificationStatus",
            options: [
              { value: "all", label: "All" },
              { value: "pending", label: "Pending" },
              { value: "verified", label: "Verified" },
              { value: "rejected", label: "Rejected" },
              { value: "manual_review", label: "Review" },
            ],
          }}
        />
      </div>

      <RideSessionDetailsDrawer
        session={selectedSession}
        open={isDrawerOpen}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            setSelectedSession(null);
            setSelectedId(null);
          }
        }}
        onVerified={refetchData}
      />
    </>
  );
}

export function RideSessionsTable({
  sessions,
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: RideSessionsTableProps) {
  const filterConfig: FilterConfig[] = [
    {
      id: "earningMode",
      label: "Ride Mode",
      type: "multi-select",
      key: "earningMode",
      options: [
        { value: "standard_ride", label: "Standard Ride" },
        { value: "ad_enhanced_ride", label: "Boosted Ride" },
      ],
    },
    {
      id: "verificationStatus",
      label: "Verification",
      type: "multi-select",
      key: "verificationStatus",
      options: [
        { value: "verified", label: "Verified" },
        { value: "pending", label: "Pending" },
        { value: "rejected", label: "Rejected" },
        { value: "manual_review", label: "Review" },
      ],
    },
  ];

  return (
    <DataTableContainer
      data={sessions}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <RideSessionsTableContent
        isLoading={isLoading}
        toolbar={toolbar}
        searchBar={searchBar}
        className={className}
        refetchData={refetchData}
        isRefetching={isRefetching}
      />
    </DataTableContainer>
  );
}
