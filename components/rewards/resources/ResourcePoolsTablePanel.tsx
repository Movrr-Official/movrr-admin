"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Boxes, Plus } from "lucide-react";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import {
  getResourcePoolsTableColumns,
  toResourcePoolRows,
  type ResourcePoolRow,
} from "@/components/rewards/resources/ResourcePoolsTableColumns";
import {
  DataTableContainer,
  useDataTable,
} from "@/context/DataTableContext";
import type { FilterConfig } from "@/lib/applyFilters";
import type { ResourcePoolReadModel } from "@/hooks/useResourcePoolsData";
import {
  formatResourceKind,
  formatResourcePoolHealth,
  formatResourceStatus,
} from "@/features/fulfilment/presentation";

function buildResourcePoolFilterConfig(
  rows: ResourcePoolRow[],
): FilterConfig[] {
  const kinds = Array.from(
    new Set(
      rows
        .map((row) => row.resourceKind)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();

  return [
    {
      id: "inventoryHealth",
      label: "Health",
      type: "multi-select",
      key: "inventoryHealth",
      primary: true,
      options: [
        { value: "healthy", label: formatResourcePoolHealth("healthy") },
        { value: "low", label: formatResourcePoolHealth("low") },
        { value: "exhausted", label: formatResourcePoolHealth("exhausted") },
        { value: "unknown", label: formatResourcePoolHealth("unknown") },
      ],
    },
    {
      id: "status",
      label: "Status",
      type: "multi-select",
      key: "status",
      primary: true,
      options: [
        { value: "active", label: formatResourceStatus("active") },
        { value: "inactive", label: formatResourceStatus("inactive") },
        { value: "depleted", label: formatResourceStatus("depleted") },
      ],
    },
    {
      id: "resourceKind",
      label: "Kind",
      type: "multi-select",
      key: "resourceKind",
      options: kinds.map((kind) => ({
        value: kind,
        label: formatResourceKind(kind),
      })),
    },
  ];
}

type ResourcePoolsTablePanelProps = {
  pools: ResourcePoolReadModel[];
  partnerNames: Record<string, string>;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isFetching: boolean;
  onRefresh: () => void;
  onImportCodes: (pool?: ResourcePoolRow | null) => void;
};

function ResourcePoolsTableContent({
  isLoading,
  isError,
  errorMessage,
  isFetching,
  onRefresh,
  onImportCodes,
  totalCount,
}: Omit<ResourcePoolsTablePanelProps, "pools" | "partnerNames"> & {
  totalCount: number;
}) {
  const searchParams = useSearchParams();
  const { filteredData } = useDataTable();
  const search = searchParams.get("search") ?? "";

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = filteredData as ResourcePoolRow[];
    if (query) {
      list = list.filter((row) => {
        const haystack = [
          row.displayName,
          row.name,
          row.id,
          row.partnerLabel,
          row.partnerOrgId,
          row.resourceKind,
          row.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    return [...list].sort((a, b) => {
      const healthRank = (value: string) => {
        if (value === "exhausted") return 0;
        if (value === "low") return 1;
        if (value === "unknown") return 2;
        return 3;
      };
      const rank =
        healthRank(a.inventoryHealth) - healthRank(b.inventoryHealth);
      if (rank !== 0) return rank;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [filteredData, search]);

  const columns = useMemo(
    () =>
      getResourcePoolsTableColumns({
        onImport: onImportCodes,
      }),
    [onImportCodes],
  );

  return (
    <div className="space-y-4 animate-slide-up">
      <DataTableToolbar
        search={{
          enabled: true,
          placeholder: "Search pools by name, partner, or id...",
          paramKey: "search",
        }}
        filterPresentation="inline"
        export={{
          enabled: true,
          data: rows,
          filename: "resource_pools_export",
          formats: ["csv", "xlsx", "json"],
        }}
        additionalActionsRight={{
          enabled: true,
          label: "Import Codes",
          icon: Plus,
          onClick: () => onImportCodes(null),
        }}
        refresh={{
          enabled: true,
          onRefresh,
          isLoading: isFetching,
        }}
      />

      {isError ? (
        <OpsErrorState
          message={errorMessage ?? "Failed to load resource pools"}
          onRetry={onRefresh}
        />
      ) : isLoading ? (
        <DataTableSkeleton searchBar={false} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchBar={false}
          searchParamKey="search"
          searchFields={[
            "displayName",
            "name",
            "id",
            "partnerLabel",
            "partnerOrgId",
            "resourceKind",
          ]}
          title="Resource Pools"
          description={`Operational capacity for voucher pools and generated codes (${totalCount} total)`}
          emptyStateTitle={
            totalCount === 0
              ? "No resource pools yet"
              : "No pools match these filters"
          }
          emptyStateDescription={
            totalCount === 0
              ? "Pools appear here when Platform resources are provisioned for partners."
              : "Try adjusting health, status, or kind filters."
          }
          emptyStateIcon={Boxes}
          onRowClick={onImportCodes}
        />
      )}
    </div>
  );
}

export function ResourcePoolsTablePanel(props: ResourcePoolsTablePanelProps) {
  const rows = useMemo(
    () => toResourcePoolRows(props.pools, props.partnerNames),
    [props.pools, props.partnerNames],
  );
  const filterConfig = useMemo(
    () => buildResourcePoolFilterConfig(rows),
    [rows],
  );

  return (
    <DataTableContainer
      data={rows}
      filterConfig={filterConfig}
      persistToUrl
      debounceMs={500}
    >
      <ResourcePoolsTableContent
        isLoading={props.isLoading}
        isError={props.isError}
        errorMessage={props.errorMessage}
        isFetching={props.isFetching}
        onRefresh={props.onRefresh}
        onImportCodes={props.onImportCodes}
        totalCount={props.pools.length}
      />
    </DataTableContainer>
  );
}
