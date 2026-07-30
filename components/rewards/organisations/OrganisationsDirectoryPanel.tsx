"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import {
  getOrganisationsDirectoryTableColumns,
  type OrganisationDirectoryRow,
} from "@/components/rewards/organisations/OrganisationsDirectoryTableColumns";
import {
  DataTableContainer,
  useDataTable,
} from "@/context/DataTableContext";
import type { FilterConfig } from "@/lib/applyFilters";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import { formatOrganisationType } from "@/features/organisations/presentation";
import { trackOpsEvent } from "@/lib/opsTelemetry";

export type { OrganisationDirectoryRow };

function toDirectoryRows(orgs: Organisation[]): OrganisationDirectoryRow[] {
  return orgs.map((org) => ({
    ...org,
    membershipState:
      (org.memberCount ?? 0) > 0 ? "has_members" : "no_members",
  }));
}

function buildOrganisationFilterConfig(): FilterConfig[] {
  return [
    {
      id: "type",
      label: "Type",
      type: "multi-select",
      key: "type",
      primary: true,
      options: [
        {
          value: "reward_partner",
          label: formatOrganisationType("reward_partner"),
        },
        { value: "advertiser", label: formatOrganisationType("advertiser") },
        { value: "government", label: formatOrganisationType("government") },
        { value: "movrr", label: formatOrganisationType("movrr") },
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
      id: "membershipState",
      label: "Membership",
      type: "select",
      key: "membershipState",
      options: [
        { value: "has_members", label: "Has members" },
        { value: "no_members", label: "No members" },
      ],
    },
  ];
}

type OrganisationsDirectoryPanelProps = {
  organisations: Organisation[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isFetching: boolean;
  onRefresh: () => void;
  onSelectOrg: (org: Organisation) => void;
  onCreateOrganisation: () => void;
};

function OrganisationsDirectoryContent({
  isLoading,
  isError,
  errorMessage,
  isFetching,
  onRefresh,
  onSelectOrg,
  onCreateOrganisation,
  totalCount,
}: Omit<OrganisationsDirectoryPanelProps, "organisations"> & {
  totalCount: number;
}) {
  const searchParams = useSearchParams();
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
      surface: "organisations",
      queryLength: trimmed.length,
    });
  }, [search]);

  useEffect(() => {
    const type = activeFilters.type;
    if (!type) return;
    const values = Array.isArray(type) ? type : [type];
    for (const value of values) {
      trackOpsEvent("organisation_type_selected", {
        surface: "organisations",
        type: String(value),
        source: "filter",
      });
    }
  }, [activeFilters.type]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = filteredData as OrganisationDirectoryRow[];
    if (query) {
      list = list.filter((row) => {
        const haystack = [row.name, row.id, row.type].join(" ").toLowerCase();
        return haystack.includes(query);
      });
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredData, search]);

  const columns = useMemo(
    () =>
      getOrganisationsDirectoryTableColumns({
        onView: onSelectOrg,
      }),
    [onSelectOrg],
  );

  return (
    <div className="space-y-4 animate-slide-up">
      <DataTableToolbar
        search={{
          enabled: true,
          placeholder: "Search organisations by name or id...",
          paramKey: "search",
        }}
        filterPresentation="inline"
        export={{
          enabled: true,
          data: rows,
          filename: "organisations_export",
          formats: ["csv", "xlsx", "json"],
        }}
        additionalActionsRight={{
          enabled: true,
          label: "Create Organisation",
          icon: Plus,
          onClick: onCreateOrganisation,
        }}
        refresh={{
          enabled: true,
          onRefresh: onRefresh,
          isLoading: isFetching,
        }}
      />

      {isError ? (
        <OpsErrorState
          message={errorMessage ?? "Failed to load organisations"}
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
          searchFields={["name", "id", "type"]}
          title="All Organisations"
          description={`Find institutions, administer membership, and hand off specialised work (${totalCount} total)`}
          emptyStateTitle={
            totalCount === 0
              ? "No organisations yet"
              : "No organisations match these filters"
          }
          emptyStateDescription={
            totalCount === 0
              ? "Provision the first platform institution to establish tenancy."
              : "No tenants in this type or status cohort — adjust filters."
          }
          emptyStateIcon={Building2}
          onRowClick={onSelectOrg}
        />
      )}
    </div>
  );
}

export function OrganisationsDirectoryPanel(
  props: OrganisationsDirectoryPanelProps,
) {
  const rows = useMemo(
    () => toDirectoryRows(props.organisations),
    [props.organisations],
  );
  const filterConfig = useMemo(() => buildOrganisationFilterConfig(), []);

  return (
    <DataTableContainer
      data={rows}
      filterConfig={filterConfig}
      persistToUrl
      debounceMs={500}
    >
      <OrganisationsDirectoryContent
        isLoading={props.isLoading}
        isError={props.isError}
        errorMessage={props.errorMessage}
        isFetching={props.isFetching}
        onRefresh={props.onRefresh}
        onSelectOrg={props.onSelectOrg}
        onCreateOrganisation={props.onCreateOrganisation}
        totalCount={props.organisations.length}
      />
    </DataTableContainer>
  );
}
