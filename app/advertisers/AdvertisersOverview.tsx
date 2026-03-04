"use client";

import { Building2, CheckCircle2, Megaphone, TrendingUp } from "lucide-react";

import { AdvertisersTable } from "@/components/advertisers/AdvertisersTable";
import { StatsCard } from "@/components/stats/StatsCard";
import { useAdvertisersData } from "@/hooks/useAdvertisersData";

export default function AdvertisersOverview() {
  const { data: advertisers, isLoading, refetch, isRefetching } =
    useAdvertisersData();

  const totalAdvertisers = advertisers?.length ?? 0;
  const activeAdvertisers =
    advertisers?.filter((advertiser) => advertiser.status === "active").length ??
    0;
  const pendingAdvertisers =
    advertisers?.filter((advertiser) => advertiser.status === "pending").length ??
    0;
  const verifiedAdvertisers =
    advertisers?.filter((advertiser) => advertiser.verified).length ?? 0;

  const totalCampaigns =
    advertisers?.reduce(
      (total, advertiser) => total + advertiser.totalCampaigns,
      0,
    ) ?? 0;
  const activeCampaigns =
    advertisers?.reduce(
      (total, advertiser) => total + advertiser.activeCampaigns,
      0,
    ) ?? 0;

  const totalImpressions =
    advertisers?.reduce(
      (total, advertiser) => total + advertiser.totalImpressions,
      0,
    ) ?? 0;

  return (
    <div className="min-h-screen gradient-bg px-4 py-8 sm:px-6 md:py-12 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-6">
          <StatsCard
            title="Total Advertisers"
            value={totalAdvertisers}
            icon={Building2}
            badges={[
              {
                label: `${activeAdvertisers} active`,
                className: "bg-success/10 text-success border-success/30",
              },
              ...(pendingAdvertisers > 0
                ? [
                    {
                      label: `${pendingAdvertisers} pending`,
                      className: "bg-info/10 text-info border-info/30",
                    },
                  ]
                : []),
            ]}
          />
          <StatsCard
            title="Verified Profiles"
            value={verifiedAdvertisers}
            icon={CheckCircle2}
            trend={{
              value:
                totalAdvertisers > 0
                  ? Math.round((verifiedAdvertisers / totalAdvertisers) * 100)
                  : 0,
              type: "increase",
            }}
            animationDelay="0.1s"
          />
          <StatsCard
            title="Campaign Portfolio"
            value={totalCampaigns}
            icon={Megaphone}
            badges={[
              {
                label: `${activeCampaigns} active campaigns`,
                className: "bg-primary/10 text-primary border-primary/30",
              },
            ]}
            animationDelay="0.2s"
          />
          <StatsCard
            title="Total Impressions"
            value={totalImpressions.toLocaleString()}
            icon={TrendingUp}
            description="Across all advertisers"
            animationDelay="0.3s"
          />
        </div>

        <AdvertisersTable
          advertisers={advertisers ?? []}
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

