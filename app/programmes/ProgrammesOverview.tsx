"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Building2, Landmark, Megaphone, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { CampaignsTable } from "@/components/campaigns/CampaignsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import { useCampaignsData } from "@/hooks/useCampaignsData";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { formatOrganisationType } from "@/features/organisations/presentation";
import { campaignLifecycleLabel } from "@/features/platform/vocabulary";

export default function ProgrammesOverview() {
  const {
    data: campaigns,
    isLoading: campaignsLoading,
    isFetching: campaignsFetching,
    refetch: refetchCampaigns,
  } = useCampaignsData({ status: "all" });

  const {
    data: governmentOrgs,
    isLoading: orgsLoading,
    isFetching: orgsFetching,
    refetch: refetchOrgs,
  } = useOrganisations("government");

  const activeCampaigns =
    campaigns?.filter((campaign) =>
      ["active", "confirmed", "open_for_signup"].includes(campaign.status),
    ).length ?? 0;

  const isRefreshing = campaignsFetching || orgsFetching;

  return (
    <div className="min-h-screen page-canvas">
      <div className="space-y-6">
        <PageHeader
          title="Programmes"
          description="Cross-organisation oversight for campaigns and government programme partners."
          actions={[
            {
              label: isRefreshing ? "Refreshing…" : "Refresh",
              icon: <RefreshCw className="h-4 w-4" />,
              onClick: () => {
                void refetchCampaigns();
                void refetchOrgs();
              },
              variant: "outline",
            },
            {
              label: "All campaigns",
              href: "/campaigns",
              variant: "outline",
            },
          ]}
        />

        <OpsKpiGrid
          isLoading={campaignsLoading || orgsLoading}
          title="Programme posture"
          description="Campaign activity and government institution coverage."
          items={[
            {
              id: "campaigns",
              label: "Total campaigns",
              value: campaigns?.length ?? 0,
            },
            {
              id: "active",
              label: "Active / enrolling",
              value: activeCampaigns,
              tone: activeCampaigns > 0 ? "success" : "muted",
            },
            {
              id: "government",
              label: "Government orgs",
              value: governmentOrgs?.length ?? 0,
            },
            {
              id: "members",
              label: "Gov members",
              value:
                governmentOrgs?.reduce(
                  (sum, org) => sum + (org.memberCount ?? 0),
                  0,
                ) ?? 0,
            },
          ]}
        />

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
              Campaign programmes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignsTable
              campaigns={campaigns ?? []}
              isLoading={campaignsLoading}
              isRefetching={campaignsFetching}
              refetchData={() => void refetchCampaigns()}
            />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <Landmark className="h-5 w-5 text-muted-foreground" />
              Government organisations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orgsLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading government organisations…
              </p>
            ) : !governmentOrgs?.length ? (
              <OpsEmptyState
                title="No government organisations"
                description="Government programme partners will appear here once registered."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-3 pr-4 font-medium">Organisation</th>
                      <th className="pb-3 pr-4 font-medium">Type</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Members</th>
                      <th className="pb-3 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {governmentOrgs.map((org) => (
                      <tr
                        key={org.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2 font-medium text-foreground">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {org.name}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatOrganisationType(org.type)}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="outline">{org.status}</Badge>
                        </td>
                        <td className="py-3 pr-4">{org.memberCount ?? 0}</td>
                        <td className="py-3 text-muted-foreground">
                          {org.updatedAt
                            ? formatDistanceToNow(new Date(org.updatedAt), {
                                addSuffix: true,
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {campaigns?.length ? (
          <p className="text-xs text-muted-foreground">
            Campaign lifecycle labels use unified vocabulary (
            {campaignLifecycleLabel("active")}, etc.).
          </p>
        ) : null}
      </div>
    </div>
  );
}
