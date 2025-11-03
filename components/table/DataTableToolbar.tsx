"use client";

import { BatchExportDialog } from "../export/BatchExportDialog";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/export/ExportDialog";
import { FilterDropdown } from "../filters/FilterDropdown";
import { DataTableSearch } from "@/components/table/DataTableSearch";
import { Download, RefreshCw, Package, Clock } from "lucide-react";
import { ScheduledExportDialog } from "../export/ScheduledExportDialog";
import { useDataTable } from "@/context/DataTableContext";

export interface TableToolbarProps {
  // Search Configuration
  search?: {
    enabled?: boolean;
    value?: string;
    onSearchChange?: (value: string) => void;
    placeholder?: string;
    paramKey?: string;
    debounceTime?: number;
    searchOnType?: boolean;
    className?: string;
  };

  // Export Configuration
  export?: {
    enabled?: boolean;
    data?: any[];
    filename?: string;
    formats?: Array<"csv" | "xlsx" | "json">;
  };

  // Batch Export Configuration
  batchExport?: {
    enabled?: boolean;
    dataSources?: any[];
  };

  // Scheduled Export Configuration
  scheduledExport?: {
    enabled?: boolean;
    dataSources?: any[];
    sampleExports?: any[];
  };

  // Refresh Configuration
  refresh?: {
    enabled?: boolean;
    onRefresh?: () => void;
    isLoading?: boolean;
  };

  // Additional Actions
  additionalActions?: React.ReactNode;

  // Layout
  variant?: "default" | "compact";
  className?: string;
}

export function DataTableToolbar({
  // Search defaults
  search = {
    enabled: true,
    placeholder: "Search...",
    paramKey: "search",
    debounceTime: 500,
    searchOnType: true,
  },

  // Export defaults
  export: exportConfig = {
    enabled: true,
    data: [],
    filename: "export",
    formats: ["csv", "xlsx", "json"],
  },

  // Batch Export defaults
  batchExport = {
    enabled: false,
    dataSources: [],
  },

  // Scheduled Export defaults
  scheduledExport = {
    enabled: false,
    dataSources: [],
    sampleExports: [],
  },

  // Refresh defaults
  refresh = {
    enabled: false,
    isLoading: false,
  },

  // Other props
  additionalActions,
  variant = "default",
  className = "",
}: TableToolbarProps) {
  const {
    filteredData,
    filters: activeFilters,
    updateFilter,
    clearAllFilters,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  const hasActiveFilters = activeFilterCount > 0;
  const hasFilterOptions = filterConfig && filterConfig.length > 0;
  const hasExportData = (exportConfig.data || filteredData).length > 0;
  const batchExportData = batchExport.dataSources || [];
  const scheduledExportData = scheduledExport.dataSources || [];

  // Don't render toolbar if no features are enabled
  const shouldRenderToolbar =
    search.enabled ||
    hasFilterOptions ||
    exportConfig.enabled ||
    refresh.enabled ||
    additionalActions;

  if (!shouldRenderToolbar) {
    return null;
  }

  return (
    <div
      className={`
      flex flex-col gap-3 p-4 glass-card border-0 shadow-lg rounded-xl animate-slide-up
      ${variant === "compact" ? "sm:flex-row sm:items-center sm:gap-4" : "sm:flex-row sm:items-start sm:gap-6"}
      ${className}
    `}
    >
      {/* Search Input */}
      {search.enabled && (
        <div
          className={`${variant === "compact" ? "flex-1 max-w-md" : "w-full sm:flex-1 sm:max-w-sm"}`}
        >
          <DataTableSearch
            placeholder={search.placeholder}
            className={search.className}
            paramKey={search.paramKey}
            debounceTime={search.debounceTime}
            searchOnType={search.searchOnType}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap ml-auto">
        {additionalActions}

        {/* Filter Dropdown */}
        {hasFilterOptions && (
          <FilterDropdown
            filterConfig={filterConfig}
            activeFilters={activeFilters}
            activeFilterCount={activeFilterCount}
            updateFilter={updateFilter}
            clearAllFilters={clearAllFilters}
            hasActiveFilters={activeFilterCount > 0}
          />
        )}

        {/* Export Button */}
        {exportConfig.enabled && (
          <ExportDialog
            data={exportConfig.data || filteredData}
            defaultFilename={exportConfig.filename}
            formats={exportConfig.formats}
            title="Export Data"
            description="Choose your preferred export format"
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="text-primary gap-2 group"
                disabled={!hasExportData}
              >
                <Download className="h-4 w-4 group-hover:scale-110 transition-transform" />
                {variant === "default" && "Export"}
              </Button>
            }
          />
        )}

        {/* Batch Export Button */}
        {batchExport.enabled && (
          <BatchExportDialog
            dataSources={batchExport.dataSources || []}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="text-primary gap-2 group"
                disabled={!batchExportData}
              >
                <Package className="h-4 w-4 group-hover:scale-110 transition-transform" />
                <span className="hidden lg:inline">Batch</span>
              </Button>
            }
          />
        )}

        {/* Scheduled Export Button */}
        {scheduledExport.enabled && (
          <ScheduledExportDialog
            dataSources={scheduledExport.dataSources || []}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="text-primary gap-2 group"
                disabled={!scheduledExportData}
              >
                <Clock className="h-4 w-4 group-hover:scale-110 transition-transform" />
                <span className="hidden lg:inline">Schedule</span>
              </Button>
            }
          />
        )}

        {/* Refresh Button */}
        {refresh.enabled && (
          <Button
            variant="outline"
            size="sm"
            onClick={refresh.onRefresh}
            disabled={refresh.isLoading}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${refresh.isLoading ? "animate-spin" : ""}`}
            />
            {/* {variant === "default" && "Refresh"} */}
          </Button>
        )}
      </div>
    </div>
  );
}
