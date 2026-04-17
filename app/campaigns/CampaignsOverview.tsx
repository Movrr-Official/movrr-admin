"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone,
  TrendingUp,
  Euro,
  Target,
  PlayCircle,
  Eye,
  MousePointerClick,
} from "lucide-react";
import { CampaignsTable } from "@/components/campaigns/CampaignsTable";
import { useCampaignsData } from "@/hooks/useCampaignsData";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getCampaignAnalyticsData } from "@/app/actions/campaigns";
import { CampaignEngagementByCityChart } from "@/components/campaigns/CampaignEngagementByCityChart";
import { CampaignDailyImpressionsChart } from "@/components/campaigns/CampaignDailyImpressionsChart";
import { BoostedRiderAllocationChart } from "@/components/campaigns/CampaignRiderAllocationChart";
import { StatsCard } from "@/components/stats/StatsCard";
import { formatCurrencyEUR, formatCurrencyEURCompact } from "@/lib/currency";

export default function CampaignsOverview() {
  const router = useRouter();
  const {
    data: campaigns,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useCampaignsData();

  // Real analytics sourced from ride_session, campaign_assignment, rider_route.
  // Scoped to active/confirmed campaign IDs so charts reflect live activity.
  const activeCampaignIds = React.useMemo(
    () =>
      (campaigns ?? [])
        .filter((c) =>
          ["active", "confirmed", "open_for_signup", "selection_in_progress"].includes(
            c.status,
          ),
        )
        .map((c) => c.id),
    [campaigns],
  );

  const { data: analyticsResult } = useQuery({
    queryKey: ["campaignAnalytics", activeCampaignIds],
    queryFn: () => getCampaignAnalyticsData(activeCampaignIds, 30),
    enabled: (campaigns?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 5,
  });

  const realAnalytics = analyticsResult?.data;

  // Calculate comprehensive stats for campaign management
  const totalCampaigns = campaigns?.length ?? 0;
  const activeCampaigns =
    campaigns?.filter((c) => c.status === "active").length ?? 0;
  const pausedCampaigns =
    campaigns?.filter((c) => c.status === "paused").length ?? 0;
  const completedCampaigns =
    campaigns?.filter((c) => c.status === "completed").length ?? 0;
  const draftCampaigns =
    campaigns?.filter((c) => c.status === "draft").length ?? 0;

  // Calculate total budget and spent
  const totalBudget =
    campaigns?.reduce((sum, c) => sum + (c.budget || 0), 0) ?? 0;
  const totalSpent =
    campaigns?.reduce((sum, c) => sum + (c.spent || 0), 0) ?? 0;
  const budgetUtilization =
    totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  // Calculate total impressions and QR scans
  const totalImpressions =
    campaigns?.reduce((sum, c) => sum + (c.impressions || 0), 0) ?? 0;
  const totalScans =
    campaigns?.reduce((sum, c) => sum + (c.qrScans || 0), 0) ?? 0;
  const averageScanRate =
    totalImpressions > 0
      ? ((totalScans / totalImpressions) * 100).toFixed(2)
      : "0.00";

  // Calculate campaigns created in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentCampaigns =
    campaigns?.filter(
      (campaign) => new Date(campaign.createdAt) >= sevenDaysAgo,
    ).length ?? 0;

  // Calculate campaigns by type
  const destinationRideCampaigns =
    campaigns?.filter((c) => c.campaignType === "destination_ride").length ?? 0;
  const swarmCampaigns =
    campaigns?.filter((c) => c.campaignType === "swarm").length ?? 0;

  // Calculate total progress (average)
  const averageProgress =
    campaigns && campaigns.length > 0
      ? Math.round(
          campaigns.reduce((sum, c) => sum + (c.progress || 0), 0) /
            campaigns.length,
        )
      : 0;

  // Real analytics derived from live Supabase data.
  const aggregatedAnalytics = {
    engagementByCity: realAnalytics?.engagementByCity ?? [],
    dailyImpressions: realAnalytics?.dailyImpressions ?? [],
    riderAllocation: realAnalytics?.riderAllocation ?? [],
  };

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        {/* Stats Cards - Optimized for Campaign Management */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatsCard
            title="Total Campaigns"
            value={totalCampaigns}
            icon={Megaphone}
            trend={
              recentCampaigns > 0
                ? {
                    value: recentCampaigns,
                    type: "increase",
                    label: "this week",
                    icon: TrendingUp,
                  }
                : undefined
            }
            badges={[
              {
                label: `${activeCampaigns} active`,
                className: "bg-success/10 text-success border-success/30",
              },
              ...(pausedCampaigns > 0
                ? [
                    {
                      label: `${pausedCampaigns} paused`,
                      className: "bg-warning/10 text-warning border-warning/30",
                    },
                  ]
                : []),
            ]}
          />

          <StatsCard
            title="Active Campaigns"
            value={activeCampaigns}
            icon={PlayCircle}
            trend={{
              value:
                totalCampaigns > 0
                  ? Math.round((activeCampaigns / totalCampaigns) * 100)
                  : 0,
              type: "increase",
            }}
            badges={[
              ...(completedCampaigns > 0
                ? [
                    {
                      label: `${completedCampaigns} completed`,
                      className: "bg-success/10 text-success border-success/30",
                    },
                  ]
                : []),
              ...(draftCampaigns > 0
                ? [
                    {
                      label: `${draftCampaigns} draft`,
                      className: "bg-muted text-muted-foreground border-border",
                    },
                  ]
                : []),
            ]}
            animationDelay="0.1s"
          />

          <StatsCard
            title="Budget Performance"
            value={formatCurrencyEURCompact(totalSpent)}
            icon={Euro}
            description={`of ${formatCurrencyEUR(totalBudget)} budget`}
            progress={{
              value: budgetUtilization,
              label: `${budgetUtilization}% utilized`,
              showLabel: true,
            }}
            valueSize="md"
            animationDelay="0.2s"
          />

          <StatsCard
            title="Performance"
            value=""
            icon={Target}
            metrics={[
              {
                label: "Campaign Impressions",
                value: totalImpressions,
                icon: Eye,
                iconColor: "text-primary",
              },
              {
                label: "QR Scans",
                value: totalScans.toLocaleString(),
                icon: MousePointerClick,
                iconColor: "text-info",
              },
              {
                label: "Scan Rate",
                value: `${averageScanRate}%`,
                icon: TrendingUp,
                iconColor: "text-success",
              },
            ]}
            animationDelay="0.3s"
          />
        </div>

        {/* Data Visualizations */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {/* Engagement by City Chart */}
          <CampaignEngagementByCityChart
            data={aggregatedAnalytics.engagementByCity}
          />

          {/* Daily Impressions Chart */}
          <CampaignDailyImpressionsChart
            data={aggregatedAnalytics.dailyImpressions}
          />

          {/* Rider Allocation Chart */}
          <BoostedRiderAllocationChart
            data={aggregatedAnalytics.riderAllocation}
          />
        </div>

        {/* Campaigns Table + Right-side Insights */}
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
          {/* Campaigns Table with Toolbar */}
          <CampaignsTable
            campaigns={campaigns ?? []}
            isLoading={isLoading}
            isRefetching={isFetching}
            toolbar={true}
            searchBar={false}
            refetchData={refetch}
            enableGridView={true}
          />

          {/* Campaign Type Distribution */}
          <div className="space-y-4 md:space-y-6">
            <Card
              className="glass-card border-0 animate-slide-up"
              style={{ animationDelay: "0.4s" }}
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold">
                  Campaign Types
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-info/10 rounded-lg">
                        <Megaphone className="h-4 w-4 text-info" />
                      </div>
                      <span className="font-semibold text-foreground">
                        Destination Ride
                      </span>
                    </div>
                    <Badge variant="info">{destinationRideCampaigns}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-success/10 rounded-lg">
                        <Target className="h-4 w-4 text-success" />
                      </div>
                      <span className="font-semibold text-foreground">
                        Swarm
                      </span>
                    </div>
                    <Badge variant="success">{swarmCampaigns}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="glass-card border-0 animate-slide-up"
              style={{ animationDelay: "0.5s" }}
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold">
                  Average Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">
                      Overall Progress
                    </span>
                    <span className="text-2xl font-bold text-foreground">
                      {averageProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-primary to-primary/80 h-3 rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${averageProgress}%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average completion across all campaigns
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
