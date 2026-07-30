"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FulfilmentQueueTable } from "@/components/rewards/fulfilment/FulfilmentQueueTable";
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

export type FulfilmentQueueRow = FulfilmentReadModel & {
  /** Alias for API/URL filter key `status` */
  status: FulfilmentReadModel["state"];
  /** Alias for API/URL filter key `type` */
  type: FulfilmentReadModel["fulfilmentType"];
};

function toQueueRows(rows: FulfilmentReadModel[]): FulfilmentQueueRow[] {
  return rows.map((row) => ({
    ...row,
    status: row.state,
    type: row.fulfilmentType,
  }));
}

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

type FulfilmentQueuePanelProps = {
  rows: FulfilmentReadModel[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isFetching: boolean;
  onRefresh: () => void;
};

function FulfilmentQueueContent({
  isLoading,
  isError,
  errorMessage,
  isFetching,
  onRefresh,
  totalCount,
}: Omit<FulfilmentQueuePanelProps, "rows"> & { totalCount: number }) {
  const searchParams = useSearchParams();
  const { filteredData } = useDataTable();

  const search = searchParams.get("search") ?? "";

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

  return (
    <div className="space-y-4 animate-slide-up">
      <DataTableToolbar
        search={{
          enabled: true,
          placeholder: "Search by id, rider, partner org, or outcome...",
          paramKey: "search",
        }}
        filterPresentation="inline"
        export={{
          enabled: true,
          data: displayRows,
          filename: "fulfilment_queue_export",
          formats: ["csv", "xlsx", "json"],
        }}
        refresh={{
          enabled: true,
          onRefresh: onRefresh,
          isLoading: isFetching,
        }}
      />

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Live queue
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Platform fulfilment cases — multi-select state and type on the bar (
            {totalCount} loaded).
          </p>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {errorMessage ?? "Failed to load queue"}
            </p>
          ) : (
            <FulfilmentQueueTable rows={displayRows} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function FulfilmentQueuePanel(props: FulfilmentQueuePanelProps) {
  const rows = useMemo(() => toQueueRows(props.rows), [props.rows]);

  return (
    <DataTableContainer
      data={rows}
      filterConfig={QUEUE_FILTER_CONFIG}
      persistToUrl
      debounceMs={500}
    >
      <FulfilmentQueueContent
        isLoading={props.isLoading}
        isError={props.isError}
        errorMessage={props.errorMessage}
        isFetching={props.isFetching}
        onRefresh={props.onRefresh}
        totalCount={props.rows.length}
      />
    </DataTableContainer>
  );
}
