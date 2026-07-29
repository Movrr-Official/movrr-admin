"use client";

import { useEffect, useMemo, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import { PartnerOperationsTablePanel } from "@/components/rewards/partners/PartnerOperationsTablePanel";
import { OrganisationDetailsDrawer } from "@/components/rewards/organisations/OrganisationDetailsDrawer";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
import { trackOpsEvent } from "@/lib/opsTelemetry";
import {
  assessPartnerReadiness,
  computePartnerFleetKpis,
  readinessSortRank,
} from "@/features/organisations/presentation";

export default function PartnersPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrganisations("reward_partner");
  const { selectedId, setSelectedId } = useDrawerQueryId();
  const lastDrawerId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedId || selectedId === lastDrawerId.current) return;
    lastDrawerId.current = selectedId;
    trackOpsEvent("drawer_opened", {
      surface: "partner_operations",
      organisationId: selectedId,
    });
  }, [selectedId]);

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

      <PartnerOperationsTablePanel
        organisations={data ?? []}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
        onSelectPartner={(org) => setSelectedId(org.id)}
        onAfterMutation={() => void refetch()}
      />

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
    </div>
  );
}
