"use client";

import { Lightbulb, Eye, EyeOff, TrendingUp } from "lucide-react";
import { ProTipsTable } from "@/components/pro-tips/ProTipsTable";
import { useProTipsData } from "@/hooks/useProTipsData";
import { StatsCard } from "@/components/stats/StatsCard";

export default function ProTipsOverview() {
  const { data: tips, isLoading, isFetching, refetch } = useProTipsData();

  const total = tips?.length ?? 0;
  const active = tips?.filter((t) => t.isActive).length ?? 0;
  const inactive = total - active;

  const categoryCounts = tips?.reduce(
    (acc, t) => {
      if (t.category) {
        acc[t.category] = (acc[t.category] ?? 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const topCategory =
    categoryCounts &&
    Object.entries(categoryCounts).sort(([, a], [, b]) => b - a)[0]?.[0];

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pro Tips</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage tips shown to riders on the Home screen. Active tips rotate
            every 30 seconds.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          <StatsCard
            title="Total Tips"
            value={total}
            icon={Lightbulb}
            badges={[
              {
                label: `${active} active`,
                className: "bg-success/10 text-success border-success/30",
              },
            ]}
          />

          <StatsCard
            title="Active Tips"
            value={active}
            icon={Eye}
            description="Shown to riders"
            animationDelay="0.1s"
          />

          <StatsCard
            title="Inactive Tips"
            value={inactive}
            icon={EyeOff}
            description={
              topCategory ? `Top category: ${topCategory}` : undefined
            }
            animationDelay="0.2s"
          />
        </div>

        {/* Table */}
        <ProTipsTable
          tips={tips ?? []}
          isLoading={isLoading}
          isRefetching={isFetching}
          refetchData={refetch}
        />
      </div>
    </div>
  );
}
