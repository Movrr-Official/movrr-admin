"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

import { ActiveFiltersDisplay } from "../filters/ActiveFiltersDisplay";
import { getCampaignsTableColumns } from "./CampaignsTableColumns";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "../skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "../filters/FilterSummary";
import { Campaign } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import { CampaignDetailsDrawer } from "./CampaignDetailsDrawer";
import { CampaignCard } from "./CampaignCard";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface CampaignsTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
  enableGridView?: boolean;
}

export default function CampaignsTableContent({
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
  enableGridView = false,
}: CampaignsTableContentProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const router = useRouter();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Persist view mode to localStorage
  const [viewMode, setViewMode] = useState<"table" | "grid">(() => {
    if (typeof window !== "undefined" && enableGridView) {
      const saved = localStorage.getItem("campaigns-view-mode");
      return saved === "table" || saved === "grid" ? saved : "table";
    }
    return "table";
  });

  // Save view mode to localStorage when it changes
  useEffect(() => {
    if (enableGridView && typeof window !== "undefined") {
      localStorage.setItem("campaigns-view-mode", viewMode);
    }
  }, [viewMode, enableGridView]);

  const {
    data: campaigns,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    isLoading: filtersLoading,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  // Handle campaign row click - open detail drawer
  const handleRowClick = useCallback((campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsDrawerOpen(true);
  }, []);

  // Handle campaign actions with useCallback for memoization
  const handleEdit = useCallback((campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsDrawerOpen(true);
  }, []);

  const handleStatusChange = useCallback(
    async (campaign: Campaign) => {
      const newStatus = campaign.status === "active" ? "paused" : "active";
      try {
        const { updateCampaignStatus } = await import(
          "@/app/actions/campaigns"
        );
        const result = await updateCampaignStatus(campaign.id, newStatus);

        if (!result.success) {
          throw new Error(result.error || "Failed to update campaign status");
        }

        toast({
          title: "Status Updated",
          description: `${campaign.name} status changed to ${newStatus}.`,
        });
        refetchData?.();
      } catch (error) {
        toast({
          title: "Update Failed",
          description:
            error instanceof Error
              ? error.message
              : "Failed to update campaign status. Please try again.",
          variant: "destructive",
        });
      }
    },
    [toast, refetchData],
  );

  const handleView = useCallback((campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsDrawerOpen(true);
  }, []);

  const handleDelete = useCallback((campaign: Campaign) => {
    // Delete is handled in the CampaignDetailsDrawer
    setSelectedCampaign(campaign);
    setIsDrawerOpen(true);
  }, []);

  const handleDuplicate = useCallback(
    async (campaign: Campaign) => {
      try {
        const { duplicateCampaign } = await import("@/app/actions/campaigns");
        const result = await duplicateCampaign(campaign.id);

        if (!result.success) {
          throw new Error(result.error || "Failed to duplicate campaign");
        }

        toast({
          title: "Campaign Duplicated",
          description: `Campaign "${campaign.name}" has been duplicated successfully.`,
        });
        refetchData?.();
      } catch (error) {
        toast({
          title: "Duplication Failed",
          description:
            error instanceof Error
              ? error.message
              : "Failed to duplicate campaign. Please try again.",
          variant: "destructive",
        });
      }
    },
    [toast, refetchData],
  );

  const columns = React.useMemo(
    () =>
      getCampaignsTableColumns({
        onEdit: handleEdit,
        onStatusChange: handleStatusChange,
        onView: handleView,
        onDelete: handleDelete,
        onDuplicate: handleDuplicate,
      }),
    [handleEdit, handleStatusChange, handleView, handleDelete, handleDuplicate],
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
              placeholder: "Search campaigns by name, brand, or ID...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "campaigns_export",
              formats: ["csv", "xlsx", "json"],
            }}
            refresh={{
              enabled: true,
              onRefresh: refetchData,
              isLoading: isRefetching,
            }}
            viewToggle={
              enableGridView
                ? {
                    enabled: true,
                    view: viewMode,
                    onViewChange: (newView: "table" | "grid") => {
                      setViewMode(newView);
                    },
                  }
                : undefined
            }
            additionalActionsRight={{
              enabled: true,
              path: "/campaigns/create",
              label: "Create Campaign",
              icon: Plus,
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
              totalDataLength={campaigns.length}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        {/* Data Table or Grid View */}
        {viewMode === "table" || !enableGridView ? (
          <DataTable
            columns={columns}
            data={filteredData}
            searchKey="search"
            searchFields={["name", "brand", "id"]}
            searchParamKey="search"
            title="Campaigns"
            description={`All campaigns (${campaigns.length} total)`}
            emptyStateTitle="No Campaigns Found"
            emptyStateDescription="No campaigns match your search criteria. Try adjusting your filters or search terms."
            emptyStateIcon={Megaphone}
            className={className}
            onRowClick={handleRowClick}
            searchBar={searchBar}
          />
        ) : (
          <div className="space-y-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-64 glass-card border-0 rounded-lg animate-pulse bg-muted/30"
                  />
                ))}
              </div>
            ) : filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No Campaigns Found
                </h3>
                <p className="text-sm text-muted-foreground">
                  No campaigns match your search criteria. Try adjusting your
                  filters or search terms.
                </p>
              </div>
            ) : (
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                role="grid"
                aria-label="Campaigns grid view"
              >
                {filteredData.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onEdit={handleEdit}
                    onStatusChange={handleStatusChange}
                    onView={handleView}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campaign Details Drawer */}
      <CampaignDetailsDrawer
        campaign={selectedCampaign}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onCampaignUpdate={refetchData}
      />
    </>
  );
}
