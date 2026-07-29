"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  Handshake,
  Package,
  RefreshCw,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/stats/StatsCard";
import { FulfilmentQueueTable } from "@/components/rewards/fulfilment/FulfilmentQueueTable";
import { ResourcePoolTable } from "@/components/rewards/resources/ResourcePoolTable";
import { OrganisationListTable } from "@/components/rewards/organisations/OrganisationListTable";
import { TodaysRedemptionsCrossLink } from "@/components/rewards/RewardsCrossLink";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { useResourcePools } from "@/hooks/useResourcePoolsData";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";
import {
  countByQueueHealth,
  deriveOpsHealth,
} from "@/lib/fulfilmentOpsMetrics";

export default function FulfilmentDashboard() {
  const queue = useFulfilmentQueue();
  const pools = useResourcePools();
  const partners = useOrganisations("reward_partner");

  const health = countByQueueHealth(queue.data);
  const ops = deriveOpsHealth(queue.data);
  const recent = (queue.data ?? []).slice(0, 8);
  const lowPools =
    pools.data?.filter(
      (pool) =>
        pool.exhausted ||
        pool.health === "low" ||
        (typeof pool.availableCount === "number" && pool.availableCount <= 5),
    ) ?? [];
  const timelinePreview = (queue.data ?? []).slice(0, 10);

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Package className="h-6 w-6" aria-hidden="true" />
            Fulfilment Operations
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Operational health of every redeemed reward — queue, capacity,
            partner collections, and completion.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void queue.refetch();
            void pools.refetch();
            void partners.refetch();
          }}
          disabled={queue.isFetching || pools.isFetching || partners.isFetching}
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      <TodaysRedemptionsCrossLink />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatsCard
          title="Processing"
          value={health.processing}
          icon={Timer}
          size="mini"
          description="Created / reserved / processing"
        />
        <StatsCard
          title="Ready"
          value={health.ready}
          icon={CheckCircle2}
          size="mini"
          description="Ready for rider or partner"
        />
        <StatsCard
          title="Awaiting collection"
          value={health.awaiting_collection}
          icon={Clock3}
          size="mini"
          description="Pending partner collection"
        />
        <StatsCard
          title="Failed"
          value={health.failed}
          icon={ShieldAlert}
          iconColor="destructive"
          size="mini"
          description="Failed / expired / cancelled"
        />
        <StatsCard
          title="Refunded"
          value={health.refunded}
          icon={AlertTriangle}
          iconColor="warning"
          size="mini"
          description="Refunded / reversed"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
        <Card className="border-border xl:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Live fulfilment queue</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Recent fulfilments with status, partner, and type.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={FULFILMENT_ROUTES.queue}>Open queue</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {queue.isError ? (
              <p className="py-8 text-center text-sm text-destructive">
                {(queue.error as Error)?.message ?? "Failed to load queue"}
              </p>
            ) : (
              <FulfilmentQueueTable
                rows={recent}
                isLoading={queue.isLoading}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-border xl:col-span-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Operational health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Success rate</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {ops.successRate}%
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">In flight</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {ops.inFlight}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Failure rate</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {ops.failureRate}%
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Refund rate</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {ops.refundRate}%
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={FULFILMENT_ROUTES.analytics}>View analytics</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
        <Card className="border-border xl:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Boxes className="h-4 w-4" />
                Resource pools
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Operational capacity and low-inventory warnings.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={FULFILMENT_ROUTES.resourcePools}>Manage pools</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {lowPools.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span>
                  {lowPools.length} pool
                  {lowPools.length === 1 ? "" : "s"} need attention
                </span>
                {lowPools.slice(0, 3).map((pool) => (
                  <Badge key={pool.id} variant="outline">
                    {pool.name ?? pool.id.slice(0, 8)}
                  </Badge>
                ))}
              </div>
            )}
            {pools.isError ? (
              <p className="py-6 text-center text-sm text-destructive">
                {(pools.error as Error)?.message ?? "Failed to load pools"}
              </p>
            ) : (
              <ResourcePoolTable
                rows={(pools.data ?? []).slice(0, 5)}
                isLoading={pools.isLoading}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-border xl:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Handshake className="h-4 w-4" />
                Partner operations
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Reward partners available for collection and validation.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={FULFILMENT_ROUTES.partners}>Partners</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {partners.isError ? (
              <p className="py-6 text-center text-sm text-destructive">
                {(partners.error as Error)?.message ?? "Failed to load partners"}
              </p>
            ) : (
              <OrganisationListTable
                rows={(partners.data ?? []).slice(0, 5)}
                isLoading={partners.isLoading}
                detailHref={(org) => FULFILMENT_ROUTES.partnerDetail(org.id)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Fulfilment timeline</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Recent operational states across the live queue.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={FULFILMENT_ROUTES.timeline}>Open timeline</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {queue.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading timeline…
            </p>
          ) : timelinePreview.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No fulfilment events yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {timelinePreview.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={FULFILMENT_ROUTES.detail(row.id)}
                      className="text-sm font-medium hover:underline"
                    >
                      {row.id.slice(0, 8)}…
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.fulfilmentType}
                      {row.partnerOrgId
                        ? ` · partner ${row.partnerOrgId.slice(0, 8)}…`
                        : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">{row.state}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
