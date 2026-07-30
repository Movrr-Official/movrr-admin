"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Handshake, Plus, ShieldOff, UserCheck } from "lucide-react";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { BulkActions, type BulkAction } from "@/components/filters/BulkActions";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import {
  getPartnerOperationsTableColumns,
  type PartnerOpsRow,
} from "@/components/rewards/partners/PartnerOperationsTableColumns";
import {
  DataTableContainer,
  useDataTable,
} from "@/context/DataTableContext";
import type { FilterConfig } from "@/lib/applyFilters";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  assessPartnerReadiness,
  readinessSortRank,
} from "@/features/organisations/presentation";
import { useUpdateOrganisation } from "@/hooks/useOrganisationsData";
import { useToast } from "@/hooks/useToast";
import { trackOpsEvent } from "@/lib/opsTelemetry";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";
import { exportToCSV } from "@/lib/export";

export type { PartnerOpsRow };

function toPartnerOpsRows(orgs: Organisation[]): PartnerOpsRow[] {
  return orgs.map((org) => {
    const assessment = assessPartnerReadiness(org);
    return {
      ...org,
      readiness: assessment.readiness,
      staffing: assessment.missingStaff ? "missing" : "staffed",
      profileCompleteness: assessment.profileIncomplete
        ? "incomplete"
        : "complete",
      displayName: org.partnerProfile?.name?.trim() || org.name,
      contactEmail: org.partnerProfile?.contactEmail?.trim() || "",
    };
  });
}

const PARTNER_FILTER_CONFIG: FilterConfig[] = [
  {
    id: "readiness",
    label: "Readiness",
    type: "multi-select",
    key: "readiness",
    primary: true,
    options: [
      { value: "ready", label: "Ready" },
      { value: "at_risk", label: "At risk" },
      { value: "not_ready", label: "Not ready" },
    ],
  },
  {
    id: "status",
    label: "Status",
    type: "multi-select",
    key: "status",
    primary: true,
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "suspended", label: "Suspended" },
    ],
  },
  {
    id: "staffing",
    label: "Staffing",
    type: "select",
    key: "staffing",
    options: [
      { value: "missing", label: "Missing staff" },
      { value: "staffed", label: "Staffed" },
    ],
  },
  {
    id: "profileCompleteness",
    label: "Profile",
    type: "select",
    key: "profileCompleteness",
    options: [
      { value: "incomplete", label: "Incomplete" },
      { value: "complete", label: "Complete" },
    ],
  },
];

type PartnerOperationsTablePanelProps = {
  organisations: Organisation[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isFetching: boolean;
  onRefresh: () => void;
  onSelectPartner: (org: Organisation) => void;
  onAfterMutation: () => void;
};

function PartnerOperationsTableContent({
  isLoading,
  isError,
  errorMessage,
  isFetching,
  onRefresh,
  onSelectPartner,
  onAfterMutation,
  totalCount,
}: Omit<PartnerOperationsTablePanelProps, "organisations"> & {
  totalCount: number;
}) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const updateOrganisation = useUpdateOrganisation();
  const [selectedRows, setSelectedRows] = useState<PartnerOpsRow[]>([]);
  const lastTrackedSearch = useRef("");

  const {
    filteredData,
    filters: activeFilters,
  } = useDataTable();

  const search = searchParams.get("search") ?? "";

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed || trimmed === lastTrackedSearch.current) return;
    lastTrackedSearch.current = trimmed;
    trackOpsEvent("search_used", {
      surface: "partner_operations",
      queryLength: trimmed.length,
    });
  }, [search]);

  useEffect(() => {
    const readiness = activeFilters.readiness;
    if (!readiness) return;
    const values = Array.isArray(readiness) ? readiness : [readiness];
    for (const value of values) {
      trackOpsEvent("readiness_filter_used", {
        surface: "partner_operations",
        readiness: String(value),
      });
    }
  }, [activeFilters.readiness]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = filteredData as PartnerOpsRow[];
    if (query) {
      list = list.filter((row) => {
        const haystack = [
          row.displayName,
          row.name,
          row.id,
          row.contactEmail,
          row.partnerProfile?.website,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    return [...list].sort((a, b) => {
      const rank =
        readinessSortRank(a.readiness) - readinessSortRank(b.readiness);
      if (rank !== 0) return rank;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [filteredData, search]);

  const columns = useMemo(
    () =>
      getPartnerOperationsTableColumns({
        onView: onSelectPartner,
      }),
    [onSelectPartner],
  );

  const applyBulkStatus = async (
    status: Organisation["status"],
    selected: PartnerOpsRow[],
  ) => {
    await Promise.all(
      selected.map((row) =>
        updateOrganisation.mutateAsync({ id: row.id, status }),
      ),
    );
    trackOpsEvent("bulk_action_executed", {
      surface: "partner_operations",
      action: `status_${status}`,
      count: selected.length,
    });
    trackOpsEvent("partner_status_changed", {
      surface: "partner_operations",
      status,
      count: selected.length,
      source: "bulk",
    });
    toast({
      title: "Partners updated",
      description: `${selected.length} partner${selected.length === 1 ? "" : "s"} set to ${status}.`,
    });
    setSelectedRows([]);
    onAfterMutation();
  };

  const bulkActions: BulkAction[] = useMemo(
    () => [
      {
        label: "Export",
        icon: Download,
        variant: "outline",
        onClick: (selected) => {
          const exportRows = (selected as PartnerOpsRow[]).map((row) => ({
            id: row.id,
            name: row.displayName,
            status: row.status,
            readiness: row.readiness,
            active_members: row.activeMemberCount ?? 0,
            contact_email: row.contactEmail,
          }));
          exportToCSV(exportRows, {
            filename: `partner-readiness-${new Date().toISOString().slice(0, 10)}`,
            format: "csv",
          });
          trackOpsEvent("bulk_action_executed", {
            surface: "partner_operations",
            action: "export_csv",
            count: exportRows.length,
          });
        },
      },
      {
        label: "Activate",
        icon: UserCheck,
        variant: "outline",
        confirmation: {
          title: "Activate selected partners?",
          description: (count) =>
            `This sets ${count} partner${count === 1 ? "" : "s"} to active.`,
        },
        onClick: (selected) =>
          applyBulkStatus("active", selected as PartnerOpsRow[]),
      },
      {
        label: "Mark inactive",
        icon: ShieldOff,
        variant: "outline",
        confirmation: {
          title: "Mark selected partners inactive?",
          description: (count) =>
            `This sets ${count} partner${count === 1 ? "" : "s"} to inactive.`,
        },
        onClick: (selected) =>
          applyBulkStatus("inactive", selected as PartnerOpsRow[]),
      },
      {
        label: "Suspend",
        icon: ShieldOff,
        variant: "destructive",
        confirmation: {
          title: "Suspend selected partners?",
          description: (count) =>
            `This sets ${count} partner${count === 1 ? "" : "s"} to suspended and blocks fulfilment participation until reactivated.`,
        },
        onClick: (selected) =>
          applyBulkStatus("suspended", selected as PartnerOpsRow[]),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyBulkStatus closes over stable callbacks
    [toast, onAfterMutation],
  );

  return (
    <div className="space-y-4 animate-slide-up">
      <DataTableToolbar
        search={{
          enabled: true,
          placeholder: "Search partners by name, contact, or id...",
          paramKey: "search",
        }}
        filterPresentation="inline"
        export={{
          enabled: true,
          data: rows,
          filename: "partners_export",
          formats: ["csv", "xlsx", "json"],
        }}
        additionalActionsRight={{
          enabled: true,
          path: FULFILMENT_ROUTES.partnerCreate,
          label: "Create Partner",
          icon: Plus,
        }}
        refresh={{
          enabled: true,
          onRefresh: onRefresh,
          isLoading: isFetching,
        }}
      />

      <BulkActions
        selectedRows={selectedRows}
        actions={bulkActions}
        entityName="partner"
      />

      {isError ? (
        <OpsErrorState
          message={errorMessage ?? "Failed to load partners"}
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
          searchFields={["displayName", "name", "id", "contactEmail"]}
          title="Partners"
          description={`Operational roster of Reward Partners — readiness first (${totalCount} total)`}
          emptyStateTitle={
            totalCount === 0
              ? "No reward partners yet"
              : "No partners match these filters"
          }
          emptyStateDescription={
            totalCount === 0
              ? "Fulfilment needs Reward Partners — create the first partner to enable collection and validation capacity."
              : "No partners in this readiness cohort — adjust filters or review active partners."
          }
          emptyStateIcon={Handshake}
          onRowClick={onSelectPartner}
          enableRowSelection
          onSelectionChange={setSelectedRows}
        />
      )}
    </div>
  );
}

export function PartnerOperationsTablePanel(
  props: PartnerOperationsTablePanelProps,
) {
  const rows = useMemo(
    () => toPartnerOpsRows(props.organisations),
    [props.organisations],
  );

  return (
    <DataTableContainer
      data={rows}
      filterConfig={PARTNER_FILTER_CONFIG}
      persistToUrl
      debounceMs={500}
    >
      <PartnerOperationsTableContent
        isLoading={props.isLoading}
        isError={props.isError}
        errorMessage={props.errorMessage}
        isFetching={props.isFetching}
        onRefresh={props.onRefresh}
        onSelectPartner={props.onSelectPartner}
        onAfterMutation={props.onAfterMutation}
        totalCount={props.organisations.length}
      />
    </DataTableContainer>
  );
}
