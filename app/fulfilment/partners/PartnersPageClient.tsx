"use client";

import { Plus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { OrganisationListTable } from "@/components/rewards/organisations/OrganisationListTable";
import { OrganisationDetailsDrawer } from "@/components/rewards/organisations/OrganisationDetailsDrawer";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function PartnersPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrganisations("reward_partner");
  const { selectedId, setSelectedId } = useDrawerQueryId();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Operations"
        description="Reward partners for collection, validation, and fulfilment capacity."
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

      <Card className="border-border animate-slide-up">
        <CardHeader>
          <CardTitle className="text-lg">Partners</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(error as Error)?.message ?? "Failed to load partners"}
            </p>
          ) : (
            <OrganisationListTable
              rows={data ?? []}
              isLoading={isLoading}
              onSelectOrg={(org) => setSelectedId(org.id)}
            />
          )}
        </CardContent>
      </Card>

      <OrganisationDetailsDrawer
        organisationId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onOrganisationUpdate={() => void refetch()}
        title="Partner Details"
      />
    </div>
  );
}
