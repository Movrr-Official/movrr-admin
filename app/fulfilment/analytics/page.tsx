"use client";

import Link from "next/link";
import { Activity, AlertTriangle, Boxes, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { StatsCard } from "@/components/stats/StatsCard";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { useResourcePools } from "@/hooks/useResourcePoolsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";
import {
  countByQueueHealth,
  deriveOpsHealth,
} from "@/lib/fulfilmentOpsMetrics";

export default function FulfilmentAnalyticsPage() {
  const queue = useFulfilmentQueue();
  const pools = useResourcePools();
  const health = countByQueueHealth(queue.data);
  const ops = deriveOpsHealth(queue.data);
  const isRefreshing = queue.isFetching || pools.isFetching;
  const lowPools =
    pools.data?.filter(
      (pool) =>
        pool.exhausted ||
        pool.health === "low" ||
        (typeof pool.availableCount === "number" && pool.availableCount <= 5),
    ).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfilment Analytics"
        description="Operational rates derived from live Platform queue and pool read models — no separate analytics API."
        action={{
          label: isRefreshing ? "Refreshing…" : "Refresh",
          icon: <RefreshCw className="h-4 w-4" />,
          onClick: () => {
            void queue.refetch();
            void pools.refetch();
          },
          variant: "outline",
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Success Rate"
          value={`${ops.successRate}%`}
          icon={Activity}
          size="mini"
          description={`${ops.completed} completed / collected`}
        />
        <StatsCard
          title="Failure Rate"
          value={`${ops.failureRate}%`}
          icon={AlertTriangle}
          iconColor="destructive"
          size="mini"
          description={`${ops.failed} failed / expired`}
        />
        <StatsCard
          title="Refund Rate"
          value={`${ops.refundRate}%`}
          icon={AlertTriangle}
          iconColor="warning"
          size="mini"
          description={`${ops.refunded} refunded / reversed`}
        />
        <StatsCard
          title="Queue Throughput"
          value={ops.total}
          icon={Activity}
          size="mini"
          description={`${ops.inFlight} currently in flight`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatsCard title="Processing" value={health.processing} size="mini" />
        <StatsCard title="Ready" value={health.ready} size="mini" />
        <StatsCard
          title="Awaiting Collection"
          value={health.awaiting_collection}
          size="mini"
        />
        <StatsCard
          title="Failed Bucket"
          value={health.failed}
          iconColor="destructive"
          size="mini"
        />
        <StatsCard
          title="Refunded Bucket"
          value={health.refunded}
          iconColor="warning"
          size="mini"
        />
      </div>

      <Card className="border-border animate-slide-up">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Capacity Signals
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Pool inventory health from partner resource read models.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={FULFILMENT_ROUTES.resourcePools}>Resource Pools</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Total Pools</p>
            <p className="text-2xl font-semibold tabular-nums">
              {(pools.data ?? []).length}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Low Inventory</p>
            <p className="text-2xl font-semibold tabular-nums">{lowPools}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Avg Fulfilment Time</p>
            <p className="text-2xl font-semibold tabular-nums">—</p>
            <p className="text-xs text-muted-foreground mt-1">
              Requires createdAt on fulfilment read models
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
