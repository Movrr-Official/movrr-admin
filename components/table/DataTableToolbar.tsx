"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { BatchExportDialog } from "../export/BatchExportDialog";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/export/ExportDialog";
import { FilterDropdown } from "../filters/FilterDropdown";
import { FiltersSheet } from "../filters/FiltersSheet";
import { InlineFilterControls } from "../filters/InlineFilterControls";
import { ActiveFiltersDisplay } from "../filters/ActiveFiltersDisplay";
import { FilterSummary } from "../filters/FilterSummary";
import { DataTableSearch } from "@/components/table/DataTableSearch";
import {
  Download,
  RefreshCw,
  Package,
  Clock,
  LayoutGrid,
  Table,
  Plus,
} from "lucide-react";
import { ScheduledExportDialog } from "../export/ScheduledExportDialog";
import { useDataTable } from "@/context/DataTableContext";
import { resolveInlineFilterSplit } from "@/lib/applyFilters";

export interface TableToolbarProps {
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

  export?: {
    enabled?: boolean;
    data?: any[];
    filename?: string;
    formats?: Array<"csv" | "xlsx" | "json">;
  };

  batchExport?: {
    enabled?: boolean;
    dataSources?: any[];
  };

  scheduledExport?: {
    enabled?: boolean;
    dataSources?: any[];
    sampleExports?: any[];
  };

  refresh?: {
    enabled?: boolean;
    onRefresh?: () => void;
    isLoading?: boolean;
  };

  additionalActionsLeft?: {
    enabled?: boolean;
    path?: string;
    onClick?: () => void;
    label?: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  additionalActionsRight?: {
    enabled?: boolean;
    path?: string;
    onClick?: () => void;
    label?: string;
    icon: React.ComponentType<{ className?: string }>;
  };

  viewToggle?: {
    enabled?: boolean;
    view?: "table" | "grid";
    onViewChange?: (view: "table" | "grid") => void;
  };

  filterPresentation?: "dropdown" | "inline";

  /**
   * Preferred inline filter ids/keys. Remaining filters go to "More filters".
   * If omitted, uses FilterConfig.primary / priority, then first 3.
   */
  primaryFilterKeys?: string[];

  /** Show active filter chips under the bar (default true). */
  showActiveFilters?: boolean;
  /** Show "Showing X of Y" summary under the bar (default true). */
  showFilterSummary?: boolean;
  /** Entity label for filter summary, e.g. "users". */
  filterEntityName?: string;

  variant?: "default" | "compact";
  className?: string;
}

export function DataTableToolbar({
  search = {
    enabled: true,
    placeholder: "Search...",
    paramKey: "search",
    debounceTime: 500,
    searchOnType: true,
  },

  export: exportConfig = {
    enabled: true,
    data: [],
    filename: "export",
    formats: ["csv", "xlsx", "json"],
  },

  batchExport = {
    enabled: false,
    dataSources: [],
  },

  scheduledExport = {
    enabled: false,
    dataSources: [],
    sampleExports: [],
  },

  refresh = {
    enabled: false,
    isLoading: false,
  },

  additionalActionsLeft = {
    enabled: false,
    path: "",
    onClick: undefined,
    label: "",
    icon: Plus,
  },
  additionalActionsRight = {
    enabled: false,
    path: "",
    onClick: undefined,
    label: "",
    icon: Plus,
  },
  viewToggle = {
    enabled: false,
    view: "table",
  },
  filterPresentation = "inline",
  primaryFilterKeys,
  showActiveFilters = true,
  showFilterSummary = true,
  filterEntityName,
  variant = "default",
  className = "",
}: TableToolbarProps) {
  const router = useRouter();
  const {
    data,
    filteredData,
    filters: activeFilters,
    updateFilter,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    filterConfig,
    isLoading: filtersLoading,
  } = useDataTable();

  const hasActiveFilters = activeFilterCount > 0;
  const hasFilterOptions = filterConfig && filterConfig.length > 0;
  const useInlineFilters =
    filterPresentation === "inline" && hasFilterOptions;
  const useDropdownFilters =
    filterPresentation === "dropdown" && hasFilterOptions;
  const hasExportData = (exportConfig.data || filteredData).length > 0;
  const batchExportData = batchExport.dataSources || [];
  const scheduledExportData = scheduledExport.dataSources || [];

  const { primaryFilters, overflowFilters } = useMemo(
    () =>
      useInlineFilters
        ? resolveInlineFilterSplit(filterConfig, primaryFilterKeys)
        : { primaryFilters: filterConfig, overflowFilters: [] },
    [filterConfig, primaryFilterKeys, useInlineFilters],
  );

  const overflowActiveCount = useMemo(() => {
    return overflowFilters.reduce((count, filter) => {
      const value = activeFilters[filter.key];
      if (value === null || value === undefined || value === "") return count;
      if (Array.isArray(value) && value.length === 0) return count;
      return count + 1;
    }, 0);
  }, [activeFilters, overflowFilters]);

  const filterStatusText = useMemo(() => {
    if (!hasActiveFilters) return "No filters applied";
    return `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}; showing ${filteredData.length} of ${data.length} results`;
  }, [
    hasActiveFilters,
    activeFilterCount,
    filteredData.length,
    data.length,
  ]);

  const LeftActionIcon = additionalActionsLeft.icon;
  const RightActionIcon = additionalActionsRight.icon;

  const shouldRenderToolbar =
    search.enabled ||
    hasFilterOptions ||
    exportConfig.enabled ||
    refresh.enabled ||
    viewToggle.enabled ||
    additionalActionsLeft.enabled ||
    additionalActionsRight.enabled;

  if (!shouldRenderToolbar) {
    return null;
  }

  return (
    <div
      className={`flex flex-col gap-3 p-4 border-border rounded-xl animate-slide-up ${className}`}
    >
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {filterStatusText}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {search.enabled && (
          <div className="min-w-0 flex-1 sm:max-w-[14rem] lg:max-w-sm">
            <DataTableSearch
              placeholder={search.placeholder}
              className={search.className}
              paramKey={search.paramKey}
              debounceTime={search.debounceTime}
              searchOnType={search.searchOnType}
            />
          </div>
        )}

        {useInlineFilters && (
          <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-1.5 lg:gap-2 md:flex">
            <InlineFilterControls
              filterConfig={primaryFilters}
              activeFilters={activeFilters}
              updateFilter={updateFilter}
              density="compact"
            />
            {overflowFilters.length > 0 && (
              <FilterDropdown
                label="More filters"
                filterConfig={overflowFilters}
                activeFilters={activeFilters}
                activeFilterCount={overflowActiveCount}
                updateFilter={updateFilter}
                clearAllFilters={() => {
                  for (const filter of overflowFilters) {
                    updateFilter(filter.key, null);
                  }
                }}
                hasActiveFilters={overflowActiveCount > 0}
              />
            )}
          </div>
        )}

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {useInlineFilters && (
            <FiltersSheet
              className="md:hidden"
              filterConfig={filterConfig}
              activeFilters={activeFilters}
              activeFilterCount={activeFilterCount}
              updateFilter={updateFilter}
              clearAllFilters={clearAllFilters}
            />
          )}

          {additionalActionsLeft.enabled && (
            <Button
              variant="default"
              size="sm"
              className="h-9"
              onClick={() => {
                if (additionalActionsLeft.onClick) {
                  additionalActionsLeft.onClick();
                  return;
                }
                if (additionalActionsLeft.path) {
                  router.push(`${additionalActionsLeft.path}`);
                }
              }}
            >
              <LeftActionIcon className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">
                {additionalActionsLeft.label}
              </span>
            </Button>
          )}

          {viewToggle.enabled && (
            <div
              className="flex items-center gap-1 rounded-lg bg-muted p-1"
              role="group"
              aria-label="View mode toggle"
            >
              <Button
                variant={viewToggle.view === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => viewToggle.onViewChange?.("table")}
                className="h-6 px-2"
                aria-label="Table view"
                aria-pressed={viewToggle.view === "table"}
              >
                <Table className="h-4 w-4" />
              </Button>
              <Button
                variant={viewToggle.view === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => viewToggle.onViewChange?.("grid")}
                className="h-6 px-2"
                aria-label="Grid view"
                aria-pressed={viewToggle.view === "grid"}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          )}

          {useDropdownFilters && (
            <FilterDropdown
              filterConfig={filterConfig}
              activeFilters={activeFilters}
              activeFilterCount={activeFilterCount}
              updateFilter={updateFilter}
              clearAllFilters={clearAllFilters}
              hasActiveFilters={hasActiveFilters}
            />
          )}

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
                  className="h-9 gap-2 group"
                  disabled={!hasExportData}
                  aria-label="Export data"
                >
                  <Download className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  <span className="hidden xl:inline">
                    {variant === "default" && "Export"}
                  </span>
                </Button>
              }
            />
          )}

          {batchExport.enabled && (
            <BatchExportDialog
              dataSources={batchExport.dataSources || []}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 group"
                  disabled={!batchExportData}
                  aria-label="Batch export"
                >
                  <Package className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  <span className="hidden xl:inline">Batch</span>
                </Button>
              }
            />
          )}

          {scheduledExport.enabled && (
            <ScheduledExportDialog
              dataSources={scheduledExport.dataSources || []}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 group"
                  disabled={!scheduledExportData}
                  aria-label="Schedule export"
                >
                  <Clock className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  <span className="hidden xl:inline">Schedule</span>
                </Button>
              }
            />
          )}

          {additionalActionsRight.enabled && (
            <Button
              variant="default"
              size="sm"
              className="h-9"
              onClick={() => {
                if (additionalActionsRight.onClick) {
                  additionalActionsRight.onClick();
                  return;
                }
                if (additionalActionsRight.path) {
                  router.push(`${additionalActionsRight.path}`);
                }
              }}
            >
              <RightActionIcon className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">
                {additionalActionsRight.label}
              </span>
            </Button>
          )}

          {refresh.enabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={refresh.onRefresh}
              disabled={refresh.isLoading}
              className="h-9 gap-2"
              aria-label="Refresh table"
            >
              <RefreshCw
                className={`h-4 w-4 ${refresh.isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          )}
        </div>
      </div>

      {hasFilterOptions && showActiveFilters && hasActiveFilters ? (
        <ActiveFiltersDisplay
          activeFilters={activeFilters}
          filterConfig={filterConfig}
          clearFilter={clearFilter}
          clearAllFilters={clearAllFilters}
          variant="compact"
        />
      ) : null}

      {hasFilterOptions && showFilterSummary && hasActiveFilters ? (
        <FilterSummary
          entityName={filterEntityName}
          filteredDataLength={filteredData.length}
          totalDataLength={data.length}
          activeFilterCount={activeFilterCount}
          isLoading={filtersLoading}
        />
      ) : null}
    </div>
  );
}
