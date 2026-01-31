"use client";

import { Route, TrendingUp, CheckCircle2, Activity, Plus } from "lucide-react";
import { RoutesTable } from "@/components/routes/RoutesTable";
import { useRouteData } from "@/hooks/useRouteData";
import { StatsCard } from "@/components/stats/StatsCard";
import { RouteLocationsMap } from "@/components/routes/RouteLocationsMap";
import { RouteOptimizer } from "@/components/routes/RouteOptimizer";
import { RouteAnalytics } from "@/components/routes/RouteAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteDetailsCard } from "@/components/routes/RouteDetailsCard";
import { AvailableRidersCard } from "@/components/routes/AvailableRidersCard";
import { RouteTemplatesPanel } from "@/components/routes/RouteTemplatesPanel";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { useCampaignsData } from "@/hooks/useCampaignsData";
import { getCampaignHotZones, getCampaignZones } from "@/app/actions/campaigns";
import { getRouteStops } from "@/app/actions/routes";
import { shouldUseMockData } from "@/lib/dataSource";

export default function RoutesOverview() {
  const { data: routes, isLoading, refetch } = useRouteData();
  const { data: campaigns } = useCampaignsData();
  const [optimizing, setOptimizing] = useState(false);

  const getRouteWithPriority = (routesList: typeof routes) => {
    if (!routesList || routesList.length === 0) return null;

    const sortByAssignedDate = [...routesList].sort((a, b) => {
      const dateA = new Date(a.assignedDate).getTime();
      const dateB = new Date(b.assignedDate).getTime();
      return dateB - dateA;
    });

    return (
      routesList.find((route) => route.status === "in-progress") ??
      routesList.find((route) => route.status === "assigned") ??
      sortByAssignedDate[0] ??
      null
    );
  };

  const handleOptimizeRoute = async () => {
    setOptimizing(true);

    try {
      // Build payload from current route or first available route
      const routeSource = getRouteWithPriority(routes);
      const locations = [] as Array<{ id: string; lat: number; lng: number }>;
      const useMockData = shouldUseMockData();
      const campaignId =
        routeSource?.campaignIdPrimary ?? routeSource?.campaignId?.[0] ?? null;
      const campaign = campaignId
        ? campaigns?.find((entry) => entry.id === campaignId)
        : undefined;

      if (routeSource && Array.isArray(routeSource.waypoints)) {
        // Map waypoints into optimizer payload
        routeSource.waypoints
          .slice()
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .forEach((wp: any, idx: number) => {
            if (typeof wp.lat === "number" && typeof wp.lng === "number") {
              locations.push({
                id: wp.name || String(idx),
                lat: wp.lat,
                lng: wp.lng,
              });
            }
          });
      }

      const [zonesResult, hotZonesResult, stopsResult] = await Promise.all([
        campaignId && !useMockData ? getCampaignZones(campaignId) : null,
        campaignId && !useMockData ? getCampaignHotZones(campaignId) : null,
        routeSource?.routeId || routeSource?.id
          ? getRouteStops(routeSource.routeId ?? routeSource.id)
          : null,
      ]);

      const campaignZones =
        zonesResult && "data" in zonesResult
          ? (zonesResult.data ?? []).map((zone: any) => ({
              id: zone.id,
              name: zone.name ?? "",
              geojson: zone.geom ? JSON.stringify(zone.geom) : "",
            }))
          : [];
      const hotZones =
        hotZonesResult && "data" in hotZonesResult
          ? (hotZonesResult.data ?? [])
          : [];
      const strategicStops =
        stopsResult && stopsResult.success ? (stopsResult.data ?? []) : [];

      const existingRoutes = (routes ?? []).filter((route) => {
        if (!campaignId) return false;
        const ids = Array.isArray(route.campaignId) ? route.campaignId : [];
        return ids.includes(campaignId);
      });

      const campaignMaxRiders = (campaign as any)?.maxRiders as
        | number
        | undefined;

      const analysis = {
        objectives: [
          campaign?.impressionGoal
            ? `Deliver ${campaign.impressionGoal.toLocaleString()} impressions`
            : "Maximize campaign impressions",
          campaign?.campaignType
            ? `Campaign type: ${campaign.campaignType}`
            : "Balanced route coverage",
          campaign?.targetAudience
            ? `Target audience: ${campaign.targetAudience}`
            : "Audience alignment",
        ].filter((item): item is string => Boolean(item)),
        constraints: [
          campaign?.startDate && campaign?.endDate
            ? `Active window: ${campaign.startDate} → ${campaign.endDate}`
            : undefined,
          campaign?.vehicleTypeRequired
            ? `Vehicle required: ${campaign.vehicleTypeRequired}`
            : undefined,
          campaignMaxRiders ? `Max riders: ${campaignMaxRiders}` : undefined,
          routeSource?.tolerance
            ? `Route tolerance: ${routeSource.tolerance}m`
            : undefined,
        ].filter((item): item is string => Boolean(item)),
        preferences: [
          campaign?.targetZones?.length
            ? `Target zones: ${campaign.targetZones.join(", ")}`
            : "Target zones not specified",
          campaignZones.length
            ? `${campaignZones.length} campaign zone(s) configured`
            : "No campaign zone geometries",
          hotZones.length
            ? `${hotZones.length} hot zone(s) configured`
            : "No hot zones configured",
        ].filter((item): item is string => Boolean(item)),
      };

      const campaignContext = campaign
        ? {
            id: campaign.id,
            name: campaign.name,
            campaignType: campaign.campaignType,
            targetAudience: campaign.targetAudience,
            impressionGoal: campaign.impressionGoal,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            vehicleTypeRequired: campaign.vehicleTypeRequired,
            targetZones: campaign.targetZones,
          }
        : undefined;

      // small pause to keep UX consistent with previous simulation
      await new Promise((resolve) => setTimeout(resolve, 800));

      setOptimizing(false);

      if (!routeSource) {
        return;
      }

      if (locations.length < 2) {
        throw new Error(
          "Route must include at least 2 valid waypoints before optimizing.",
        );
      }

      if (locations.length === 0) {
        // Return void; the RouteOptimizer will decide whether to use mocks
        return;
      }

      return {
        start_index: 0,
        locations,
        context: {
          campaign: campaignContext,
          campaignId: campaignId ?? undefined,
          analysis,
          existingRoutes: existingRoutes.map((route) => ({
            id: route.id,
            name: route.name,
            waypoints: route.waypoints ?? [],
            routeId: route.routeId,
          })),
          campaignZones,
          hotZones,
          strategicStops,
        },
      };
    } catch (e) {
      setOptimizing(false);
      return;
    }
  };

  // Calculate comprehensive stats for route management
  const totalRoutes = routes?.length ?? 0;
  const assignedRoutes =
    routes?.filter((r) => r.status === "assigned").length ?? 0;
  const inProgressRoutes =
    routes?.filter((r) => r.status === "in-progress").length ?? 0;
  const completedRoutes =
    routes?.filter((r) => r.status === "completed").length ?? 0;

  // Calculate performance metrics
  const highPerformanceRoutes =
    routes?.filter((r) => r.performance === "high").length ?? 0;
  const mediumPerformanceRoutes =
    routes?.filter((r) => r.performance === "medium").length ?? 0;
  const lowPerformanceRoutes =
    routes?.filter((r) => r.performance === "low").length ?? 0;

  // Calculate average coverage
  const routesWithCoverage =
    routes?.filter((r) => r.coverage !== undefined) ?? [];
  const averageCoverage =
    routesWithCoverage.length > 0
      ? Math.round(
          routesWithCoverage.reduce((sum, r) => sum + (r.coverage || 0), 0) /
            routesWithCoverage.length,
        )
      : 0;

  // Calculate routes created in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentRoutes =
    routes?.filter((route) => new Date(route.assignedDate) >= sevenDaysAgo)
      .length ?? 0;

  // Calculate completion rate
  const completionRate =
    totalRoutes > 0
      ? Math.round(((completedRoutes ?? 0) / totalRoutes) * 100)
      : 0;

  // Calculate average completion time
  const completedRoutesWithTime =
    routes?.filter(
      (r) => r.status === "completed" && r.completionTime !== undefined,
    ) ?? [];
  const averageCompletionTime =
    completedRoutesWithTime.length > 0
      ? Math.round(
          completedRoutesWithTime.reduce(
            (sum, r) => sum + (r.completionTime || 0),
            0,
          ) / completedRoutesWithTime.length,
        )
      : 0;

  const currentRoute = getRouteWithPriority(routes);

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        {/* Stats Cards - Optimized for Route Management */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatsCard
            title="Total Routes"
            value={totalRoutes}
            icon={Route}
            trend={
              recentRoutes > 0
                ? {
                    value: recentRoutes,
                    type: "increase",
                    label: "this week",
                    icon: TrendingUp,
                  }
                : undefined
            }
            badges={[
              {
                label: `${completedRoutes} completed`,
                className:
                  "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
              },
              ...(inProgressRoutes > 0
                ? [
                    {
                      label: `${inProgressRoutes} in progress`,
                      className:
                        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
                    },
                  ]
                : []),
            ]}
          />

          <StatsCard
            title="Active Routes"
            value={assignedRoutes + inProgressRoutes}
            icon={Activity}
            badges={[
              ...(assignedRoutes > 0
                ? [
                    {
                      label: `${assignedRoutes} assigned`,
                      className:
                        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
                    },
                  ]
                : []),
              ...(inProgressRoutes > 0
                ? [
                    {
                      label: `${inProgressRoutes} in progress`,
                      className:
                        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
                    },
                  ]
                : []),
            ]}
            animationDelay="0.1s"
          />

          <StatsCard
            title="Performance"
            value={`${averageCoverage}%`}
            icon={TrendingUp}
            description="Average coverage"
            progress={{
              value: averageCoverage,
            }}
            badges={[
              ...(highPerformanceRoutes > 0
                ? [
                    {
                      label: `${highPerformanceRoutes} high`,
                      className:
                        "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
                    },
                  ]
                : []),
              ...(mediumPerformanceRoutes > 0
                ? [
                    {
                      label: `${mediumPerformanceRoutes} medium`,
                      className:
                        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
                    },
                  ]
                : []),
            ]}
            animationDelay="0.2s"
          />

          <StatsCard
            title="Route Health"
            value={
              averageCompletionTime > 0 ? `${averageCompletionTime} min` : "—"
            }
            icon={CheckCircle2}
            description="Average completion time"
            progress={{
              value: completionRate,
            }}
            badges={[
              {
                label: `${completedRoutes} completed`,
                className:
                  "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
              },
            ]}
            animationDelay="0.3s"
          />
        </div>

        {/* Main Content */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
          {/* Location Map */}
          <div className="self-start space-y-6">
            <RouteLocationsMap routes={routes ?? []} />

            {/* Tabs for Route Analytics and Routes Table */}
            <Tabs defaultValue="table" className="w-full mt-16">
              <TabsList className="grid w-full max-w-[520px] grid-cols-3">
                <TabsTrigger value="table">Routes Table</TabsTrigger>
                <TabsTrigger value="templates">Route Templates</TabsTrigger>
                <TabsTrigger value="analytics">Route Analytics</TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="space-y-4 mt-4">
                <RoutesTable
                  routes={routes ?? []}
                  isLoading={isLoading}
                  toolbar={true}
                  searchBar={false}
                  refetchData={refetch}
                />
              </TabsContent>

              <TabsContent value="templates" className="space-y-4 mt-4">
                <RouteTemplatesPanel />
              </TabsContent>

              <TabsContent value="analytics" className="space-y-4 mt-4">
                <RouteAnalytics routes={routes ?? []} />
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <RouteOptimizer
              onOptimize={handleOptimizeRoute}
              isOptimizing={optimizing}
            />
            <RouteDetailsCard route={currentRoute} />
            <AvailableRidersCard />
          </div>
        </div>
      </div>
    </div>
  );
}
