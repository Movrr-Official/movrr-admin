"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import {
  getFulfilmentQueueTableColumns,
  toFulfilmentQueueRows,
  type FulfilmentQueueRow,
} from "@/components/rewards/fulfilment/FulfilmentQueueTableColumns";
import {
  DataTableContainer,
  useDataTable,
} from "@/context/DataTableContext";
import type { FilterConfig } from "@/lib/applyFilters";
import type { FulfilmentReadModel } from "@/features/fulfilment/application/queries/fulfilmentQueries";
import { FULFILMENT_STATES } from "@/features/fulfilment/domain/states";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import {
  formatFulfilmentState,
  formatFulfilmentType,
} from "@/features/fulfilment/presentation";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export type { FulfilmentQueueRow };

const QUEUE_FILTER_CONFIG: FilterConfig[] = [
  {
    id: "status",
    label: "State",
    type: "multi-select",
    key: "status",
    primary: true,
    options: FULFILMENT_STATES.map((state) => ({
      value: state,
      label: formatFulfilmentState(state),
    })),
  },
  {
    id: "type",
    label: "Type",
    type: "multi-select",
    key: "type",
    primary: true,
    options: FULFILMENT_TYPES.map((type) => ({
      value: type,
      label: formatFulfilmentType(type),
    })),
  },
];

/** Light filters for collection worklists — no state multi-select (cohort is fixed). */
const WORKLIST_FILTER_CONFIG: FilterConfig[] = [
  {
    id: "type",
    label: "Type",
    type: "multi-select",
    key: "type",
    primary: true,
    options: FULFILMENT_TYPES.map((type) => ({
      value: type,
      label: formatFulfilmentType(type),
    })),
  },
];

type FulfilmentQueuePanelProps = {
  rows: FulfilmentReadModel[];
  partnerNames?: Record<string, string>;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isFetching: boolean;
  onRefresh: () => void;
  /**
   * `queue` — full ops directory filters.
   * `worklist` — cohort table for Collections (Awaiting / Collected).
   */
  variant?: "queue" | "worklist";
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Unique search param when multiple worklists share a page. */
  searchParamKey?: string;
  exportFilename?: string;
  /** Defaults true for queue; false for worklists to avoid URL clashes. */
  persistToUrl?: boolean;
};

function FulfilmentQueueContent({
  isLoading,
  isError,
  errorMessage,
  isFetching,
  onRefresh,
  totalCount,
  variant,
  title,
  description,
  emptyTitle,
  emptyDescription,
  searchParamKey,
  exportFilename,
}: Omit<FulfilmentQueuePanelProps, "rows" | "partnerNames" | "persistToUrl"> & {
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { filteredData } = useDataTable();
  const paramKey = searchParamKey ?? "search";
  const search = searchParams.get(paramKey) ?? "";
  const isWorklist = variant === "worklist";

  const displayRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = filteredData as FulfilmentQueueRow[];
    if (query) {
      list = list.filter((row) => {
        const haystack = [
          row.id,
          row.redemptionId,
          row.riderId,
          row.partnerOrgId,
          row.partnerLabel,
          row.outcome,
          row.state,
          row.fulfilmentType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    return list;
  }, [filteredData, search]);

  const openDetail = (row: FulfilmentQueueRow) => {
    router.push(FULFILMENT_ROUTES.detail(row.id));
  };

  const columns = useMemo(
    () =>
      getFulfilmentQueueTableColumns({
        onView: openDetail,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openDetail closes over router
    [],
  );

  return (
    <div className="space-y-4 animate-slide-up">
      <DataTableToolbar
        search={{
          enabled: true,
          placeholder: "Search by id, rider, partner, or outcome...",
          paramKey,
        }}
        filterPresentation="inline"
        export={{
          enabled: true,
          data: displayRows,
          filename: exportFilename ?? "fulfilment_queue_export",
          formats: ["csv", "xlsx", "json"],
        }}
        refresh={{
          enabled: true,
          onRefresh,
          isLoading: isFetching,
        }}
      />

      {isError ? (
        <OpsErrorState
          message={errorMessage ?? "Failed to load fulfilments"}
          onRetry={onRefresh}
        />
      ) : isLoading ? (
        <DataTableSkeleton searchBar={false} />
      ) : (
        <DataTable
          columns={columns}
          data={displayRows}
          searchBar={false}
          searchParamKey={paramKey}
          searchFields={[
            "id",
            "redemptionId",
            "riderId",
            "partnerOrgId",
            "partnerLabel",
            "outcome",
            "status",
            "type",
          ]}
          title={title ?? (isWorklist ? "Worklist" : "Live queue")}
          description={
            description ??
            `Platform fulfilment cases (${totalCount} loaded)`
          }
          emptyStateTitle={
            emptyTitle ??
            (totalCount === 0
              ? "No fulfilments in queue"
              : "No fulfilments match these filters")
          }
          emptyStateDescription={
            emptyDescription ??
            (totalCount === 0
              ? "Fulfilments appear here when riders redeem catalog rewards through the Platform API."
              : "Try adjusting filters or search.")
          }
          emptyStateIcon={Layers}
          onRowClick={openDetail}
        />
      )}
    </div>
  );
}

export function FulfilmentQueuePanel(props: FulfilmentQueuePanelProps) {
  const variant = props.variant ?? "queue";
  const isWorklist = variant === "worklist";
  const rows = useMemo(
    () => toFulfilmentQueueRows(props.rows, props.partnerNames),
    [props.rows, props.partnerNames],
  );

  return (
    <DataTableContainer
      data={rows}
      filterConfig={isWorklist ? WORKLIST_FILTER_CONFIG : QUEUE_FILTER_CONFIG}
      persistToUrl={props.persistToUrl ?? !isWorklist}
      debounceMs={500}
    >
      <FulfilmentQueueContent
        isLoading={props.isLoading}
        isError={props.isError}
        errorMessage={props.errorMessage}
        isFetching={props.isFetching}
        onRefresh={props.onRefresh}
        totalCount={props.rows.length}
        variant={variant}
        title={props.title}
        description={props.description}
        emptyTitle={props.emptyTitle}
        emptyDescription={props.emptyDescription}
        searchParamKey={props.searchParamKey}
        exportFilename={props.exportFilename}
      />
    </DataTableContainer>
  );
}
