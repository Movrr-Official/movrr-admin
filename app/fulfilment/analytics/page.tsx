"use client";

import Link from "next/link";
import { Activity, AlertTriangle, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const lowPools =
    pools.data?.filter(
      (pool) =>
        pool.exhausted ||
        pool.health === "low" ||
        (typeof pool.availableCount === "number" && pool.availableCount <= 5),
    ).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Fulfilment analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Operational rates derived from live Platform queue and pool read
            models — no separate analytics API.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void queue.refetch();
            void pools.refetch();
          }}
          disabled={queue.isFetching || pools.isFetching}
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Success rate"
          value={`${ops.successRate}%`}
          icon={Activity}
          size="mini"
          description={`${ops.completed} completed / collected`}
        />
        <StatsCard
          title="Failure rate"
          value={`${ops.failureRate}%`}
          icon={AlertTriangle}
          iconColor="destructive"
          size="mini"
          description={`${ops.failed} failed / expired`}
        />
        <StatsCard
          title="Refund rate"
          value={`${ops.refundRate}%`}
          icon={AlertTriangle}
          iconColor="warning"
          size="mini"
          description={`${ops.refunded} refunded / reversed`}
        />
        <StatsCard
          title="Queue throughput"
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
          title="Awaiting collection"
          value={health.awaiting_collection}
          size="mini"
        />
        <StatsCard
          title="Failed bucket"
          value={health.failed}
          iconColor="destructive"
          size="mini"
        />
        <StatsCard
          title="Refunded bucket"
          value={health.refunded}
          iconColor="warning"
          size="mini"
        />
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Capacity signals
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Pool inventory health from partner resource read models.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={FULFILMENT_ROUTES.resourcePools}>Resource pools</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Total pools</p>
            <p className="text-2xl font-semibold tabular-nums">
              {(pools.data ?? []).length}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Low inventory</p>
            <p className="text-2xl font-semibold tabular-nums">{lowPools}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Avg fulfilment time</p>
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
