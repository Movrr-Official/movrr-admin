"use client";

import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import { OpsFilterToolbar } from "@/components/ops/OpsFilterToolbar";
import { OpsBulkActionBar } from "@/components/ops/OpsBulkActionBar";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import { OpsConfirmDialog } from "@/components/ops/OpsConfirmDialog";
import { PartnerOperationsTable } from "@/components/rewards/partners/PartnerOperationsTable";
import { OrganisationDetailsDrawer } from "@/components/rewards/organisations/OrganisationDetailsDrawer";
import {
  useOrganisations,
  useUpdateOrganisation,
} from "@/hooks/useOrganisationsData";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
import { useToast } from "@/hooks/useToast";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";
import { trackOpsEvent } from "@/lib/opsTelemetry";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  assessPartnerReadiness,
  computePartnerFleetKpis,
  readinessSortRank,
  type PartnerReadiness,
} from "@/features/organisations/presentation";

type ReadinessFilter = "all" | PartnerReadiness;
type StatusFilter = "all" | Organisation["status"];
type StaffFilter = "all" | "missing" | "staffed";
type ProfileFilter = "all" | "incomplete" | "complete";
type BulkIntent = Organisation["status"] | null;

function exportPartnersCsv(rows: Organisation[]) {
  const header = [
    "id",
    "name",
    "status",
    "readiness",
    "active_members",
    "contact_email",
  ];
  const lines = rows.map((row) => {
    const assessment = assessPartnerReadiness(row);
    return [
      row.id,
      JSON.stringify(row.partnerProfile?.name || row.name),
      row.status,
      assessment.readiness,
      String(row.activeMemberCount ?? 0),
      JSON.stringify(row.partnerProfile?.contactEmail ?? ""),
    ].join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `partner-readiness-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PartnersPageClient() {
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrganisations("reward_partner");
  const updateOrganisation = useUpdateOrganisation();
  const { selectedId, setSelectedId } = useDrawerQueryId();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [readinessFilter, setReadinessFilter] =
    useState<ReadinessFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [staffFilter, setStaffFilter] = useState<StaffFilter>("all");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkIntent, setBulkIntent] = useState<BulkIntent>(null);
  const lastTrackedSearch = useRef("");
  const lastDrawerId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedId || selectedId === lastDrawerId.current) return;
    lastDrawerId.current = selectedId;
    trackOpsEvent("drawer_opened", {
      surface: "partner_operations",
      organisationId: selectedId,
    });
  }, [selectedId]);

  useEffect(() => {
    const trimmed = deferredSearch.trim();
    if (!trimmed || trimmed === lastTrackedSearch.current) return;
    lastTrackedSearch.current = trimmed;
    trackOpsEvent("search_used", {
      surface: "partner_operations",
      queryLength: trimmed.length,
    });
  }, [deferredSearch]);

  const kpis = useMemo(
    () => computePartnerFleetKpis(data ?? []),
    [data],
  );

  const attentionPartners = useMemo(() => {
    return (data ?? [])
      .map((org) => ({ org, assessment: assessPartnerReadiness(org) }))
      .filter(
        ({ assessment }) =>
          assessment.readiness === "not_ready" ||
          assessment.readiness === "at_risk",
      )
      .sort(
        (a, b) =>
          readinessSortRank(a.assessment.readiness) -
          readinessSortRank(b.assessment.readiness),
      )
      .slice(0, 5);
  }, [data]);

  const filteredRows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return (data ?? [])
      .filter((org) => {
        const assessment = assessPartnerReadiness(org);
        if (
          readinessFilter !== "all" &&
          assessment.readiness !== readinessFilter
        ) {
          return false;
        }
        if (statusFilter !== "all" && org.status !== statusFilter) {
          return false;
        }
        if (staffFilter === "missing" && !assessment.missingStaff) return false;
        if (staffFilter === "staffed" && assessment.missingStaff) return false;
        if (profileFilter === "incomplete" && !assessment.profileIncomplete) {
          return false;
        }
        if (profileFilter === "complete" && assessment.profileIncomplete) {
          return false;
        }
        if (!query) return true;
        const haystack = [
          org.name,
          org.id,
          org.partnerProfile?.name,
          org.partnerProfile?.contactEmail,
          org.partnerProfile?.website,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const ra = assessPartnerReadiness(a);
        const rb = assessPartnerReadiness(b);
        const rank =
          readinessSortRank(ra.readiness) - readinessSortRank(rb.readiness);
        if (rank !== 0) return rank;
        return a.name.localeCompare(b.name);
      });
  }, [
    data,
    deferredSearch,
    readinessFilter,
    statusFilter,
    staffFilter,
    profileFilter,
  ]);

  const applyBulkStatus = async (status: Organisation["status"]) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkPending(true);
    try {
      await Promise.all(
        ids.map((id) => updateOrganisation.mutateAsync({ id, status })),
      );
      trackOpsEvent("bulk_action_executed", {
        surface: "partner_operations",
        action: `status_${status}`,
        count: ids.length,
      });
      trackOpsEvent("partner_status_changed", {
        surface: "partner_operations",
        status,
        count: ids.length,
        source: "bulk",
      });
      toast({
        title: "Partners updated",
        description: `${ids.length} partner${ids.length === 1 ? "" : "s"} set to ${status}.`,
      });
      setSelectedIds(new Set());
      setBulkIntent(null);
      await refetch();
    } catch (err) {
      toast({
        title: "Bulk update failed",
        description:
          err instanceof Error ? err.message : "Could not update partners.",
        variant: "destructive",
      });
    } finally {
      setBulkPending(false);
    }
  };

  const bulkCopy =
    bulkIntent === "suspended"
      ? {
          title: "Suspend selected partners?",
          description: `This sets ${selectedIds.size} partner${selectedIds.size === 1 ? "" : "s"} to suspended and blocks fulfilment participation until reactivated.`,
          confirmLabel: "Suspend partners",
          destructive: true,
        }
      : bulkIntent === "inactive"
        ? {
            title: "Mark selected partners inactive?",
            description: `This sets ${selectedIds.size} partner${selectedIds.size === 1 ? "" : "s"} to inactive.`,
            confirmLabel: "Mark inactive",
            destructive: true,
          }
        : bulkIntent === "active"
          ? {
              title: "Activate selected partners?",
              description: `This sets ${selectedIds.size} partner${selectedIds.size === 1 ? "" : "s"} to active.`,
              confirmLabel: "Activate partners",
              destructive: false,
            }
          : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Operations"
        description="Fulfilment operating console for Reward Partners — ensure partners are staffed, contactable, and safe to participate in collection and validation."
        actions={[
          {
            label: isFetching ? "Refreshing…" : "Refresh",
            icon: <RefreshCw className="h-4 w-4" />,
            onClick: () => void refetch(),
            variant: "outline",
          },
          {
            label: "Create Partner",
            href: FULFILMENT_ROUTES.partnerCreate,
            icon: <Plus className="h-4 w-4" />,
          },
        ]}
      />

      <OpsKpiGrid
        title="Partner capacity"
        description="Fleet readiness for collection and validation."
        isLoading={isLoading}
        items={[
          {
            id: "ready",
            label: "Ready",
            value: kpis.ready,
            tone: "success",
            hint: "Active, staffed, contactable",
          },
          {
            id: "at-risk",
            label: "At risk",
            value: kpis.atRisk,
            tone: "warning",
            hint: "Participating with gaps",
          },
          {
            id: "not-ready",
            label: "Not ready",
            value: kpis.notReady,
            tone: "danger",
            hint: "Cannot fulfil safely",
          },
          {
            id: "missing-staff",
            label: "Missing staff",
            value: kpis.missingStaff,
            tone: "danger",
          },
          {
            id: "active",
            label: "Active",
            value: kpis.active,
          },
          {
            id: "suspended",
            label: "Suspended",
            value: kpis.suspended,
            tone: kpis.suspended > 0 ? "warning" : "muted",
          },
          {
            id: "profile",
            label: "Profile incomplete",
            value: kpis.profileIncomplete,
            tone: "warning",
          },
          {
            id: "total",
            label: "Partners",
            value: kpis.total,
            tone: "muted",
          },
        ]}
      />

      {attentionPartners.length > 0 ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">Needs attention</CardTitle>
            <p className="text-sm text-muted-foreground">
              Partners blocking or risking fulfilment readiness.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {attentionPartners.map(({ org, assessment }) => (
              <button
                key={org.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelectedId(org.id)}
              >
                <span className="text-sm font-medium">
                  {org.partnerProfile?.name || org.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {assessment.reasons[0] ?? assessment.readiness}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border animate-slide-up">
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="text-lg">Partners</CardTitle>
            <p className="text-sm text-muted-foreground">
              Operational roster of Reward Partners — readiness first.
            </p>
          </div>
          <OpsFilterToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by partner name, contact, or id…"
            searchLabel="Search partners"
            filters={[
              {
                id: "readiness",
                label: "Readiness",
                value: readinessFilter,
                onChange: (value) => {
                  setReadinessFilter(value as ReadinessFilter);
                  if (value !== "all") {
                    trackOpsEvent("readiness_filter_used", {
                      surface: "partner_operations",
                      readiness: value,
                    });
                  }
                },
                options: [
                  { value: "all", label: "All readiness" },
                  { value: "ready", label: "Ready" },
                  { value: "at_risk", label: "At risk" },
                  { value: "not_ready", label: "Not ready" },
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
                id: "staff",
                label: "Staffing",
                value: staffFilter,
                onChange: (value) => setStaffFilter(value as StaffFilter),
                options: [
                  { value: "all", label: "All staffing" },
                  { value: "missing", label: "Missing staff" },
                  { value: "staffed", label: "Staffed" },
                ],
              },
              {
                id: "profile",
                label: "Profile",
                value: profileFilter,
                onChange: (value) => setProfileFilter(value as ProfileFilter),
                options: [
                  { value: "all", label: "All profiles" },
                  { value: "incomplete", label: "Incomplete" },
                  { value: "complete", label: "Complete" },
                ],
              },
            ]}
          />
          <OpsBulkActionBar
            selectedCount={selectedIds.size}
            onClear={() => setSelectedIds(new Set())}
            actions={[
              {
                id: "suspend",
                label: "Suspend",
                variant: "destructive",
                disabled: bulkPending,
                onClick: () => setBulkIntent("suspended"),
              },
              {
                id: "inactive",
                label: "Mark inactive",
                disabled: bulkPending,
                onClick: () => setBulkIntent("inactive"),
              },
              {
                id: "activate",
                label: "Activate",
                disabled: bulkPending,
                onClick: () => setBulkIntent("active"),
              },
              {
                id: "export",
                label: "Export CSV",
                onClick: () => {
                  const rows = filteredRows.filter((row) =>
                    selectedIds.has(row.id),
                  );
                  exportPartnersCsv(rows);
                  trackOpsEvent("bulk_action_executed", {
                    surface: "partner_operations",
                    action: "export_csv",
                    count: rows.length,
                  });
                },
              },
            ]}
          />
        </CardHeader>
        <CardContent>
          {isError ? (
            <OpsErrorState
              message={
                (error as Error)?.message ?? "Failed to load partners"
              }
              onRetry={() => void refetch()}
            />
          ) : (
            <PartnerOperationsTable
              rows={filteredRows}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onToggleSelect={(id, selected) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (selected) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
              onToggleSelectAll={(selected) => {
                setSelectedIds(
                  selected
                    ? new Set(filteredRows.map((row) => row.id))
                    : new Set(),
                );
              }}
              onSelectPartner={(org) => setSelectedId(org.id)}
              emptyTitle={
                (data?.length ?? 0) === 0
                  ? "No reward partners yet"
                  : "No partners match these filters"
              }
              emptyDescription={
                (data?.length ?? 0) === 0
                  ? "Fulfilment needs Reward Partners — create the first partner to enable collection and validation capacity."
                  : "No partners in this readiness cohort — adjust filters or review active partners."
              }
              emptyAction={
                (data?.length ?? 0) === 0 ? (
                  <Button asChild>
                    <Link href={FULFILMENT_ROUTES.partnerCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Partner
                    </Link>
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
        mode="partner"
        onOpenChange={(open) => {
          if (!open) {
            lastDrawerId.current = null;
            setSelectedId(null);
          }
        }}
        onOrganisationUpdate={() => {
          trackOpsEvent("partner_updated", {
            surface: "partner_operations",
            organisationId: selectedId ?? "",
          });
          void refetch();
        }}
      />

      {bulkCopy && bulkIntent ? (
        <OpsConfirmDialog
          open={Boolean(bulkIntent)}
          onOpenChange={(open) => {
            if (!open && !bulkPending) setBulkIntent(null);
          }}
          title={bulkCopy.title}
          description={bulkCopy.description}
          confirmLabel={bulkCopy.confirmLabel}
          destructive={bulkCopy.destructive}
          confirming={bulkPending}
          onConfirm={() => void applyBulkStatus(bulkIntent)}
        />
      ) : null}
    </div>
  );
}
