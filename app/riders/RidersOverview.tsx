"use client";

import { Bike, CheckCircle2, Coins, Route } from "lucide-react";

import { RidersTable } from "@/components/riders/RidersTable";
import { StatsCard } from "@/components/stats/StatsCard";
import { useRidersData } from "@/hooks/useRidersData";

export default function RidersOverview() {
  const { data: riders, isLoading, refetch, isRefetching } = useRidersData();

  const totalRiders = riders?.length ?? 0;
  const activeRiders =
    riders?.filter((rider) => rider.status === "active").length ?? 0;
  const ridersOnRoutes =
    riders?.filter((rider) => (rider.activeRoutesCount ?? 0) > 0).length ?? 0;
  const ridersOnCampaigns =
    riders?.filter((rider) => (rider.activeCampaignsCount ?? 0) > 0).length ?? 0;
  const certifiedRiders =
    riders?.filter((rider) => rider.isCertified).length ?? 0;
  const averageProfileCompleteness =
    totalRiders > 0
      ? Math.round(
          (riders?.reduce(
            (total, rider) => total + (rider.profileCompleteness ?? 0),
            0,
          ) ?? 0) / totalRiders,
        )
      : 0;
  const totalPointsExposure =
    riders?.reduce((total, rider) => total + (rider.pointsBalance ?? 0), 0) ?? 0;

  return (
    <div className="min-h-screen gradient-bg px-4 py-8 sm:px-6 md:py-12 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-6">
          <StatsCard
            title="Total Riders"
            value={totalRiders}
            icon={Bike}
            badges={[
              {
                label: `${activeRiders} active`,
                className: "bg-success/10 text-success border-success/30",
              },
            ]}
          />
          <StatsCard
            title="Operational Coverage"
            value={ridersOnRoutes}
            icon={Route}
            badges={[
              {
                label: `${ridersOnCampaigns} on campaign rides`,
                className: "bg-primary/10 text-primary border-primary/30",
              },
            ]}
            description="Riders with active route assignments"
            animationDelay="0.1s"
          />
          <StatsCard
            title="Profile Readiness"
            value={`${averageProfileCompleteness}%`}
            icon={CheckCircle2}
            badges={[
              {
                label: `${certifiedRiders} certified`,
                className: "bg-info/10 text-info border-info/30",
              },
            ]}
            animationDelay="0.2s"
          />
          <StatsCard
            title="Points Exposure"
            value={totalPointsExposure.toLocaleString()}
            icon={Coins}
            description="Current rider point balances"
            animationDelay="0.3s"
          />
        </div>

        <RidersTable
          riders={riders ?? []}
          isLoading={isLoading}
          toolbar={true}
          searchBar={false}
          refetchData={refetch}
          isRefetching={isRefetching}
        />
      </div>
    </div>
  );
}
