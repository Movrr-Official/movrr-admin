"use client";

import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import { OpsFilterToolbar } from "@/components/ops/OpsFilterToolbar";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import { OrganisationsDirectoryTable } from "@/components/rewards/organisations/OrganisationsDirectoryTable";
import { OrganisationDetailsDrawer } from "@/components/rewards/organisations/OrganisationDetailsDrawer";
import { CreateOrganisationDialog } from "@/components/rewards/organisations/CreateOrganisationDialog";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
import { trackOpsEvent } from "@/lib/opsTelemetry";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  computeOrganisationDirectoryKpis,
  formatOrganisationType,
} from "@/features/organisations/presentation";

type TypeFilter = "all" | Organisation["type"];
type StatusFilter = "all" | Organisation["status"];
type MembersFilter = "all" | "has_members" | "no_members";

export default function OrganisationsPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrganisations();
  const { selectedId, setSelectedId } = useDrawerQueryId();
  const [createOpen, setCreateOpen] = useState(false);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [membersFilter, setMembersFilter] = useState<MembersFilter>("all");
  const lastTrackedSearch = useRef("");
  const lastDrawerId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedId || selectedId === lastDrawerId.current) return;
    lastDrawerId.current = selectedId;
    trackOpsEvent("organisation_opened", {
      surface: "organisations",
      organisationId: selectedId,
    });
    trackOpsEvent("drawer_opened", {
      surface: "organisations",
      organisationId: selectedId,
    });
  }, [selectedId]);

  useEffect(() => {
    const trimmed = deferredSearch.trim();
    if (!trimmed || trimmed === lastTrackedSearch.current) return;
    lastTrackedSearch.current = trimmed;
    trackOpsEvent("search_used", {
      surface: "organisations",
      queryLength: trimmed.length,
    });
  }, [deferredSearch]);

  const kpis = useMemo(
    () => computeOrganisationDirectoryKpis(data ?? []),
    [data],
  );

  const filteredRows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return (data ?? [])
      .filter((org) => {
        if (typeFilter !== "all" && org.type !== typeFilter) return false;
        if (statusFilter !== "all" && org.status !== statusFilter) return false;
        const members = org.memberCount ?? 0;
        if (membersFilter === "has_members" && members < 1) return false;
        if (membersFilter === "no_members" && members > 0) return false;
        if (!query) return true;
        const haystack = [org.name, org.id, org.type]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, deferredSearch, typeFilter, statusFilter, membersFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisations"
        description="Platform tenancy directory — identity, type, status, and membership across all Organisation types."
        actions={[
          {
            label: isFetching ? "Refreshing…" : "Refresh",
            icon: <RefreshCw className="h-4 w-4" />,
            onClick: () => void refetch(),
            variant: "outline",
          },
          {
            label: "Create Organisation",
            icon: <Plus className="h-4 w-4" />,
            onClick: () => setCreateOpen(true),
          },
        ]}
      />

      <OpsKpiGrid
        title="Institution directory"
        description="Who exists on MOVRR, by type and tenancy standing."
        isLoading={isLoading}
        items={[
          {
            id: "total",
            label: "Organisations",
            value: kpis.total,
          },
          {
            id: "reward",
            label: formatOrganisationType("reward_partner"),
            value: kpis.byType.reward_partner,
            hint: "Readiness lives in Partner Operations",
          },
          {
            id: "advertiser",
            label: formatOrganisationType("advertiser"),
            value: kpis.byType.advertiser,
          },
          {
            id: "government",
            label: formatOrganisationType("government"),
            value: kpis.byType.government,
          },
          {
            id: "movrr",
            label: formatOrganisationType("movrr"),
            value: kpis.byType.movrr,
          },
          {
            id: "active",
            label: "Active",
            value: kpis.active,
            tone: "success",
          },
          {
            id: "suspended",
            label: "Suspended",
            value: kpis.suspended,
            tone: kpis.suspended > 0 ? "warning" : "muted",
          },
          {
            id: "without-members",
            label: "Without members",
            value: kpis.withoutMembers,
            tone: kpis.withoutMembers > 0 ? "warning" : "muted",
          },
        ]}
      />

      <Card className="border-border animate-slide-up">
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="text-lg">All Organisations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Find institutions, administer membership, and hand off specialised
              work to the correct console.
            </p>
          </div>
          <OpsFilterToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by institution name or id…"
            searchLabel="Search organisations"
            filters={[
              {
                id: "type",
                label: "Type",
                value: typeFilter,
                onChange: (value) => {
                  setTypeFilter(value as TypeFilter);
                  if (value !== "all") {
                    trackOpsEvent("organisation_type_selected", {
                      surface: "organisations",
                      type: value,
                      source: "filter",
                    });
                  }
                },
                options: [
                  { value: "all", label: "All types" },
                  {
                    value: "reward_partner",
                    label: formatOrganisationType("reward_partner"),
                  },
                  {
                    value: "advertiser",
                    label: formatOrganisationType("advertiser"),
                  },
                  {
                    value: "government",
                    label: formatOrganisationType("government"),
                  },
                  { value: "movrr", label: formatOrganisationType("movrr") },
                ],
              },
              {
                id: "status",
                label: "Status",
                value: statusFilter,
                onChange: (value) => setStatusFilter(value as StatusFilter),
                options: [
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "suspended", label: "Suspended" },
                ],
              },
              {
                id: "members",
                label: "Membership",
                value: membersFilter,
                onChange: (value) => setMembersFilter(value as MembersFilter),
                options: [
                  { value: "all", label: "All membership" },
                  { value: "has_members", label: "Has members" },
                  { value: "no_members", label: "No members" },
                ],
              },
            ]}
            trailing={
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Organisation
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {isError ? (
            <OpsErrorState
              message={
                (error as Error)?.message ?? "Failed to load organisations"
              }
              onRetry={() => void refetch()}
            />
          ) : (
            <OrganisationsDirectoryTable
              rows={filteredRows}
              isLoading={isLoading}
              onSelectOrg={(org) => setSelectedId(org.id)}
              emptyTitle={
                (data?.length ?? 0) === 0
                  ? "No organisations yet"
                  : "No organisations match these filters"
              }
              emptyDescription={
                (data?.length ?? 0) === 0
                  ? "Provision the first platform institution to establish tenancy."
                  : "No tenants in this type or status cohort — adjust filters."
              }
              emptyAction={
                (data?.length ?? 0) === 0 ? (
                  <Button type="button" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Organisation
                  </Button>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      <OrganisationDetailsDrawer
        organisationId={selectedId}
        open={Boolean(selectedId)}
        mode="organisation"
        onOpenChange={(open) => {
          if (!open) {
            lastDrawerId.current = null;
            setSelectedId(null);
          }
        }}
        onOrganisationUpdate={() => {
          trackOpsEvent("organisation_updated", {
            surface: "organisations",
            organisationId: selectedId ?? "",
          });
          void refetch();
        }}
      />

      <CreateOrganisationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(organisation) => {
          trackOpsEvent("organisation_created", {
            surface: "organisations",
            organisationId: organisation.id,
            type: organisation.type,
          });
          if (organisation.type === "reward_partner") {
            trackOpsEvent("partner_created", {
              surface: "organisations",
              organisationId: organisation.id,
              source: "directory_create",
            });
          }
          void refetch();
          setSelectedId(organisation.id);
        }}
      />
    </div>
  );
}
