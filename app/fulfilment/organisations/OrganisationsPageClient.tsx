"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import { OrganisationsDirectoryPanel } from "@/components/rewards/organisations/OrganisationsDirectoryPanel";
import { OrganisationDetailsDrawer } from "@/components/rewards/organisations/OrganisationDetailsDrawer";
import { CreateOrganisationDialog } from "@/components/rewards/organisations/CreateOrganisationDialog";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
import { trackOpsEvent } from "@/lib/opsTelemetry";
import {
  computeOrganisationDirectoryKpis,
  formatOrganisationType,
} from "@/features/organisations/presentation";

export default function OrganisationsPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrganisations();
  const { selectedId, setSelectedId } = useDrawerQueryId();
  const [createOpen, setCreateOpen] = useState(false);
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

  const kpis = useMemo(
    () => computeOrganisationDirectoryKpis(data ?? []),
    [data],
  );

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

      <OrganisationsDirectoryPanel
        organisations={data ?? []}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
        onSelectOrg={(org) => setSelectedId(org.id)}
        onCreateOrganisation={() => setCreateOpen(true)}
      />

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
