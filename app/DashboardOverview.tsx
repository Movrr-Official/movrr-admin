"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats/StatsCard";
import { ChartTooltipContent } from "@/components/charts/ChartTooltipContent";
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart as RechartsBarChart,
  Cell,
  Line,
  LineChart as RechartsLineChart,
} from "recharts";
import { useUserStats } from "@/hooks/useUserStats";
import { useUsersData } from "@/hooks/useUsersData";
import { useRidersData } from "@/hooks/useRidersData";
import { useRouteData } from "@/hooks/useRouteData";
import { useCampaignsData } from "@/hooks/useCampaignsData";
import { useRewardStats } from "@/hooks/useRewardsData";
import { useAuditLogsData } from "@/hooks/useAuditLogsData";
import {
  buildCampaignPerformanceSeries,
  buildCumulativeUserSeries,
  buildPointsTrendSeries,
} from "@/lib/dashboard/series";
import {
  ClipboardCheck,
  Users,
  Bike,
  Award,
  Plus,
  FileText,
  Download,
  CheckSquare,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const DASHBOARD_LOCALE = "nl-NL";
const DASHBOARD_TIMEZONE = "Europe/Amsterdam";
const CHART_AXIS_FONT_SIZE = 12;
const CHART_X_TICK_MARGIN = 10;
const CHART_Y_TICK_MARGIN = 10;
const MAX_MONTH_BUCKETS = 120;

const toDisplayCase = (value: string) =>
  value
    .split(" ")
    .map((part) =>
      part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join(" ");

export default function DashboardOverview() {
  const [selectedRange, setSelectedRange] = useState<
    "all" | "7d" | "30d" | "90d" | "180d" | "365d"
  >("all");
  const [userGrowthView, setUserGrowthView] = useState<
    "riders" | "advertisers"
  >("riders");
  const [routeCompletionView, setRouteCompletionView] = useState<
    "daily" | "weekly" | "monthly"
  >("weekly");
  const rangeDays = useMemo(
    () => ({
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "180d": 180,
      "365d": 365,
    }),
    [],
  );

  const activeDateRange = useMemo(() => {
    if (selectedRange === "all") return undefined;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - (rangeDays[selectedRange] - 1));
    start.setHours(0, 0, 0, 0);
    return { from: start, to: end };
  }, [rangeDays, selectedRange]);

  const getDateBounds = (values: Array<string | null | undefined>) => {
    const dates = values
      .map((value) => (value ? new Date(value) : null))
      .filter((value): value is Date =>
        value ? !Number.isNaN(value.getTime()) : false,
      );

    if (!dates.length) return null;
    const times = dates.map((date) => date.getTime());
    return {
      from: new Date(Math.min(...times)),
      to: new Date(Math.max(...times)),
    };
  };

  const getFallbackRange = (months: number) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setMonth(end.getMonth() - (months - 1));
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: end };
  };

  const capRangeToMaxMonths = (range: { from: Date; to: Date }) => {
    const monthSpan =
      (range.to.getFullYear() - range.from.getFullYear()) * 12 +
      (range.to.getMonth() - range.from.getMonth()) +
      1;
    if (monthSpan <= MAX_MONTH_BUCKETS) return range;

    const from = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
    from.setMonth(from.getMonth() - (MAX_MONTH_BUCKETS - 1));
    from.setHours(0, 0, 0, 0);
    return { from, to: range.to };
  };

  const resolveMonthlyRange = (values: Array<string | null | undefined>) => {
    if (activeDateRange) {
      return capRangeToMaxMonths(activeDateRange);
    }
    const bounds = getDateBounds(values);
    if (!bounds) return getFallbackRange(12);
    return capRangeToMaxMonths(bounds);
  };

  const buildMonthlyBuckets = (from: Date, to: Date) => {
    const start = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    const formatter = new Intl.DateTimeFormat(DASHBOARD_LOCALE, {
      month: "short",
      year: "2-digit",
      timeZone: DASHBOARD_TIMEZONE,
    });

    const buckets: Array<{
      key: string;
      label: string;
      start: Date;
      end: Date;
    }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const bucketStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const bucketEnd = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        0,
      );
      buckets.push({
        key: `${bucketStart.getFullYear()}-${String(
          bucketStart.getMonth() + 1,
        ).padStart(2, "0")}`,
        label: formatter.format(bucketStart),
        start: bucketStart,
        end: bucketEnd,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return buckets;
  };

  const buildLabeledMonthlyBuckets = (from: Date, to: Date) => {
    const buckets = buildMonthlyBuckets(from, to);
    const crossesYears = from.getFullYear() !== to.getFullYear();
    const formatter = new Intl.DateTimeFormat(DASHBOARD_LOCALE, {
      month: "short",
      ...(crossesYears ? { year: "2-digit" as const } : {}),
      timeZone: DASHBOARD_TIMEZONE,
    });
    return buckets.map((bucket) => ({
      label: toDisplayCase(formatter.format(bucket.start)),
      start: bucket.start,
      end: bucket.end,
    }));
  };

  const {
    data: userStats,
    isLoading: userStatsLoading,
    isError: userStatsError,
  } = useUserStats(
    activeDateRange ? { dateRange: activeDateRange } : undefined,
  );
  const {
    data: users,
    isLoading: usersLoading,
    isError: usersError,
  } = useUsersData(
    activeDateRange ? { dateRange: activeDateRange } : undefined,
  );
  const {
    data: riders,
    isLoading: ridersLoading,
    isError: ridersError,
  } = useRidersData({ status: "active" });
  const {
    data: routes,
    isLoading: routesLoading,
    isError: routesError,
  } = useRouteData();
  const {
    data: campaigns,
    isLoading: campaignsLoading,
    isError: campaignsError,
  } = useCampaignsData(
    activeDateRange
      ? { status: "all", dateRange: activeDateRange }
      : { status: "all" },
  );
  const {
    data: rewardStats,
    isLoading: rewardStatsLoading,
    isError: rewardStatsError,
  } = useRewardStats(
    activeDateRange ? { dateRange: activeDateRange } : undefined,
  );
  const {
    data: auditLogs = [],
    isLoading: auditLogsLoading,
    isError: auditLogsError,
  } = useAuditLogsData(
    activeDateRange ? { dateRange: activeDateRange } : undefined,
  );

  const isDateWithinRange = (value?: string | null) => {
    if (!value) return false;
    if (!activeDateRange) return true;
    const date = new Date(value);
    return date >= activeDateRange.from && date <= activeDateRange.to;
  };

  const filteredCampaigns = (campaigns ?? []).filter((campaign) =>
    isDateWithinRange(campaign.startDate),
  );

  const activeCampaigns = filteredCampaigns.filter(
    (campaign) => campaign.status === "active",
  ).length;
  const activeRiders =
    (riders ?? []).filter((rider) => isDateWithinRange(rider.createdAt))
      .length ?? 0;
  const totalUsers = userStats?.total ?? 0;
  const totalPointsAwarded = rewardStats?.totalPointsAwarded ?? 0;

  const statsLoading =
    userStatsLoading || ridersLoading || campaignsLoading || rewardStatsLoading;
  const statsError =
    userStatsError || ridersError || campaignsError || rewardStatsError;

  const campaignStatusCounts = filteredCampaigns.reduce(
    (acc, campaign) => {
      acc[campaign.status] = (acc[campaign.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const recentActivity = auditLogs.slice(0, 6);

  const monthLabels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const usersCreated = users ?? [];
  const userGrowthRange = resolveMonthlyRange(
    usersCreated.map((user) => user.createdAt),
  );
  const userGrowthBuckets = buildLabeledMonthlyBuckets(
    userGrowthRange.from,
    userGrowthRange.to,
  );

  const routeRange =
    activeDateRange ??
    getDateBounds((routes ?? []).map((route) => route.assignedDate)) ??
    getFallbackRange(6);
  const routeBuckets = buildMonthlyBuckets(routeRange.from, routeRange.to);
  const routeMonthlyYear = activeDateRange?.to
    ? activeDateRange.to.getFullYear()
    : new Date().getFullYear();
  const routeMonthlyYearBuckets = monthLabels.map((label, index) => {
    const monthStart = new Date(routeMonthlyYear, index, 1);
    const monthEnd = new Date(routeMonthlyYear, index + 1, 0, 23, 59, 59, 999);
    return {
      label,
      start: monthStart,
      end: monthEnd,
    };
  });
  const userGrowthRiders = buildCumulativeUserSeries(
    usersCreated,
    userGrowthBuckets,
    "rider",
  );
  const userGrowthAdvertisers = buildCumulativeUserSeries(
    usersCreated,
    userGrowthBuckets,
    "advertiser",
  );
  const userGrowthSeries =
    userGrowthView === "riders" ? userGrowthRiders : userGrowthAdvertisers;
  const hasUserGrowthData = userGrowthSeries.some((item) => item.value > 0);

  const campaignRange = resolveMonthlyRange(
    filteredCampaigns.map((campaign) => campaign.startDate),
  );
  const campaignBuckets = buildLabeledMonthlyBuckets(
    campaignRange.from,
    campaignRange.to,
  );

  const campaignPerformanceChartData = buildCampaignPerformanceSeries(
    filteredCampaigns,
    campaignBuckets,
  );
  const hasCampaignPerformanceData = campaignPerformanceChartData.some(
    (item) => item.impressions > 0 || item.revenue > 0,
  );
  const campaignPerformanceMax = campaignPerformanceChartData.reduce(
    (max, item) => Math.max(max, item.impressions, item.revenue),
    0,
  );
  const campaignPerformanceDomainMax = Math.max(
    10000,
    Math.ceil(campaignPerformanceMax / 5000) * 5000,
  );
  const pointsRange = resolveMonthlyRange(
    (rewardStats?.dailyTrends ?? []).map((trend) => trend.date),
  );
  const pointsBuckets = buildLabeledMonthlyBuckets(
    pointsRange.from,
    pointsRange.to,
  );

  const pointsTrendData = buildPointsTrendSeries(
    rewardStats?.dailyTrends ?? [],
    pointsBuckets,
  );
  const hasPointsData = pointsTrendData.some(
    (item) => item.awarded > 0 || item.redeemed > 0,
  );

  const pointsChartMax = pointsTrendData.reduce(
    (max, item) => Math.max(max, item.awarded, item.redeemed),
    0,
  );
  const pointsChartMin = pointsTrendData.reduce(
    (min, item) => {
      const localMin = Math.min(item.awarded, item.redeemed);
      return min === null ? localMin : Math.min(min, localMin);
    },
    null as number | null,
  );
  const pointsAxisStep = 20000;
  const pointsDomainMax =
    pointsChartMax > 0
      ? Math.ceil(pointsChartMax / pointsAxisStep) * pointsAxisStep
      : pointsAxisStep;
  const pointsDomainMin =
    pointsChartMin !== null
      ? Math.max(
          0,
          Math.floor(pointsChartMin / pointsAxisStep) * pointsAxisStep,
        )
      : 0;
  const pointsTicks = Array.from({
    length:
      pointsDomainMax >= pointsDomainMin
        ? Math.floor((pointsDomainMax - pointsDomainMin) / pointsAxisStep) + 1
        : 0,
  })
    .map((_, index) => pointsDomainMin + index * pointsAxisStep)
    .filter((value) => value !== 0);

  const routeCompletionData = routeBuckets.map((bucket) => {
    const monthStart = bucket.start;
    const monthEnd = bucket.end;
    const monthlyRoutes = (routes ?? []).filter((route) => {
      const assigned = route.assignedDate ? new Date(route.assignedDate) : null;
      return assigned
        ? assigned >= monthStart &&
            assigned <= monthEnd &&
            isDateWithinRange(route.assignedDate)
        : false;
    });
    const completed = monthlyRoutes.filter(
      (route) => route.status === "completed",
    ).length;
    const total = monthlyRoutes.length || 1;
    const completionRate = Math.round((completed / total) * 100);
    return {
      name: bucket.label,
      completionRate,
      completed,
      total: monthlyRoutes.length,
    };
  });

  const routeCompletionWeeklyData = (() => {
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const startOfWeek = (() => {
      const date = activeDateRange?.to
        ? new Date(activeDateRange.to)
        : new Date();
      const day = date.getDay();
      const diff = (day + 6) % 7;
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - diff);
      return date;
    })();

    return dayLabels.map((label, index) => {
      const dayStart = new Date(startOfWeek);
      dayStart.setDate(startOfWeek.getDate() + index);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dailyRoutes = (routes ?? []).filter((route) => {
        const assigned = route.assignedDate
          ? new Date(route.assignedDate)
          : null;
        return assigned
          ? assigned >= dayStart &&
              assigned <= dayEnd &&
              isDateWithinRange(route.assignedDate)
          : false;
      });

      const completed = dailyRoutes.filter(
        (route) => route.status === "completed",
      ).length;
      const total = dailyRoutes.length;
      const completionRate = total ? Math.round((completed / total) * 100) : 0;

      return {
        name: label,
        completionRate,
        total,
      };
    });
  })();

  const routeCompletionDailyData = (() => {
    const now = activeDateRange?.to ? new Date(activeDateRange.to) : new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const formatHourLabel = (hour24: number) => {
      const suffix = hour24 >= 12 ? "p" : "a";
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      return `${hour12}${suffix}`;
    };

    return Array.from({ length: 24 }).map((_, hour) => {
      const hourStart = new Date(start);
      hourStart.setHours(hour, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hour, 59, 59, 999);

      const hourlyRoutes = (routes ?? []).filter((route) => {
        const assigned = route.assignedDate
          ? new Date(route.assignedDate)
          : null;
        return assigned
          ? assigned >= hourStart &&
              assigned <= hourEnd &&
              isDateWithinRange(route.assignedDate)
          : false;
      });

      const completed = hourlyRoutes.filter(
        (route) => route.status === "completed",
      ).length;
      const total = hourlyRoutes.length;
      const completionRate = total ? Math.round((completed / total) * 100) : 0;

      return {
        name: formatHourLabel(hour),
        completionRate,
        total,
      };
    });
  })();

  const routeCompletionMonthlyYearData = routeMonthlyYearBuckets.map(
    (bucket) => {
      const monthStart = bucket.start;
      const monthEnd = bucket.end;

      const monthlyRoutes = (routes ?? []).filter((route) => {
        const assigned = route.assignedDate
          ? new Date(route.assignedDate)
          : null;
        return assigned
          ? assigned >= monthStart &&
              assigned <= monthEnd &&
              isDateWithinRange(route.assignedDate)
          : false;
      });

      const completed = monthlyRoutes.filter(
        (route) => route.status === "completed",
      ).length;
      const total = monthlyRoutes.length;
      const completionRate = total ? Math.round((completed / total) * 100) : 0;

      return {
        name: bucket.label,
        completionRate,
        total,
      };
    },
  );

  const routeCompletionChartData =
    routeCompletionView === "weekly"
      ? routeCompletionWeeklyData
      : routeCompletionView === "daily"
        ? routeCompletionDailyData
        : routeCompletionMonthlyYearData;
  const hasRouteCompletionData =
    routeCompletionView === "monthly"
      ? routeCompletionMonthlyYearData.some((item) => item.total > 0)
      : routeCompletionView === "daily"
        ? routeCompletionDailyData.some((item) => item.total > 0)
        : routeCompletionWeeklyData.some((item) => item.total > 0);

  const routeCompletionBarSize =
    routeCompletionView === "weekly"
      ? 110
      : routeCompletionView === "monthly"
        ? 26
        : 14;

  const routeCompletionCategoryGap = routeCompletionView === "daily" ? 6 : 28;

  const routeCompletionXAxisInterval = routeCompletionView === "daily" ? 1 : 0;

  const handleExportData = () => {
    const rows = (campaigns ?? []).map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      budget: campaign.budget,
      spent: campaign.spent,
      impressions: campaign.impressions,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
    }));

    const header = Object.keys(rows[0] ?? {}).join(",");
    const body = rows
      .map((row) =>
        Object.values(row)
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");

    const csv = [header, body].filter(Boolean).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "movrr-dashboard-export.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const quickActions = [
    {
      label: "View rewards",
      href: "/rewards",
      icon: FileText,
    },
    {
      label: "Manage riders",
      href: "/riders",
      icon: Bike,
    },
    {
      label: "Create campaign",
      href: "/campaigns/create",
      icon: Plus,
    },
    {
      label: "Run campaign selection",
      href: "/campaigns",
      icon: CheckSquare,
    },
    {
      label: "Export data",
      onClick: handleExportData,
      disabled: !campaigns?.length,
      icon: Download,
    },
    {
      label: "View pending approvals",
      href: "/waitlist",
      icon: CheckSquare,
    },
  ];

  const renderChartEmptyState = (title: string, description: string) => (
    <div className="h-full rounded-2xl border border-dashed border-border/60 bg-muted/40 px-4 py-6 flex flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          actions={[
            {
              type: "select",
              label:
                selectedRange === "all"
                  ? "All time"
                  : `Last ${rangeDays[selectedRange]} days`,
              placeholder: "Select range",
              options: [
                { label: "All time", value: "all" },
                { label: "Last 7 days", value: "7d" },
                { label: "Last 30 days", value: "30d" },
                { label: "Last 90 days", value: "90d" },
                { label: "Last 180 days", value: "180d" },
                { label: "Last 365 days", value: "365d" },
              ],
              value: selectedRange,
              onValueChange: (value: string) =>
                setSelectedRange(
                  value as "all" | "7d" | "30d" | "90d" | "180d" | "365d",
                ),
            },
            {
              label: "View Riders",
              href: "/riders",
            },
            {
              label: "Create Campaign",
              href: "/campaigns/create",
              icon: <Plus className="mr-2 h-4 w-4" />,
              variant: "outline" as const,
            },
          ]}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
          <StatsCard
            title="Total Users"
            value={statsLoading ? "—" : statsError ? "N/A" : totalUsers}
            icon={Users}
          />
          <StatsCard
            title="Active Riders"
            value={statsLoading ? "—" : statsError ? "N/A" : activeRiders}
            icon={Bike}
            animationDelay="0.1s"
          />
          <StatsCard
            title="Points Awarded"
            value={statsLoading ? "—" : statsError ? "N/A" : totalPointsAwarded}
            icon={Award}
            animationDelay="0.2s"
          />
          <StatsCard
            title="Active Campaigns"
            value={statsLoading ? "—" : statsError ? "N/A" : activeCampaigns}
            icon={ClipboardCheck}
            animationDelay="0.3s"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 md:gap-8">
          <Card className="glass-card border-0 lg:col-span-8">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-xl font-bold">User Growth</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label="User growth audience"
                    className="flex items-center gap-2 rounded-full bg-muted px-1 py-1"
                  >
                    <button
                      type="button"
                      onClick={() => setUserGrowthView("riders")}
                      aria-pressed={userGrowthView === "riders"}
                      className={
                        "rounded-full px-3 py-1 text-xs font-semibold transition " +
                        (userGrowthView === "riders"
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground")
                      }
                    >
                      Riders
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserGrowthView("advertisers")}
                      aria-pressed={userGrowthView === "advertisers"}
                      className={
                        "rounded-full px-3 py-1 text-xs font-semibold transition " +
                        (userGrowthView === "advertisers"
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground")
                      }
                    >
                      Advertisers
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {usersLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading user growth...
                  </div>
                ) : usersError ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Unable to load user growth.
                  </div>
                ) : !hasUserGrowthData ? (
                  renderChartEmptyState(
                    "No user growth data",
                    "No rider or advertiser signups were recorded for this period.",
                  )
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsAreaChart data={userGrowthSeries}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={CHART_X_TICK_MARGIN}
                        fontSize={CHART_AXIS_FONT_SIZE}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={CHART_Y_TICK_MARGIN}
                        fontSize={CHART_AXIS_FONT_SIZE}
                        tickFormatter={(value) =>
                          value >= 1000 ? `${Math.round(value / 1000)}k` : value
                        }
                      />
                      <Tooltip
                        content={
                          <ChartTooltipContent
                            seriesLabelMap={{
                              value:
                                userGrowthView === "riders"
                                  ? "Riders"
                                  : "Advertisers",
                            }}
                          />
                        }
                      />
                      <defs>
                        <linearGradient
                          id="userGrowthFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="var(--chart-1)"
                            stopOpacity={0.18}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--chart-1)"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <Area
                        dataKey="value"
                        type="monotone"
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        fill="url(#userGrowthFill)"
                        dot={false}
                      />
                    </RechartsAreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-0 lg:col-span-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl font-bold">
                Campaign Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {campaignsLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading campaign status...
                </p>
              ) : campaignsError ? (
                <p className="text-sm text-muted-foreground">
                  Unable to load campaign status.
                </p>
              ) : (
                <>
                  {[
                    {
                      key: "active",
                      label: "Running",
                      dotClass: "bg-emerald-500",
                    },
                    {
                      key: "scheduled",
                      label: "Scheduled",
                      dotClass: "bg-blue-500",
                    },
                    {
                      key: "draft",
                      label: "Draft",
                      dotClass: "bg-amber-500",
                    },
                    {
                      key: "paused",
                      label: "Paused",
                      dotClass: "bg-slate-400",
                    },
                    {
                      key: "completed",
                      label: "Ended",
                      dotClass: "bg-red-500",
                    },
                  ].map((status) => (
                    <div
                      key={status.key}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${status.dotClass}`}
                          aria-hidden="true"
                        />
                        <span className="font-medium text-foreground">
                          {status.label}
                        </span>
                      </div>
                      <span className="font-semibold text-foreground">
                        {campaignStatusCounts[status.key] ?? 0}
                      </span>
                    </div>
                  ))}
                  <div className="my-4 h-px w-full bg-border/60" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total Campaigns
                    </p>
                    <p className="text-3xl font-bold text-foreground">
                      {campaigns?.length ?? 0}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 md:gap-8">
          <Card className="glass-card border-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold">
                Campaign Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                {campaignsLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading campaign performance...
                  </div>
                ) : campaignsError ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Unable to load campaign performance.
                  </div>
                ) : !hasCampaignPerformanceData ? (
                  renderChartEmptyState(
                    "No campaign performance data",
                    "No campaign impressions or revenue were recorded for this period.",
                  )
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={campaignPerformanceChartData}
                      barSize={34}
                      barGap={10}
                      barCategoryGap={26}
                      margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine
                        tickMargin={CHART_X_TICK_MARGIN}
                        interval={0}
                        fontSize={CHART_AXIS_FONT_SIZE}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={36}
                        domain={[0, campaignPerformanceDomainMax]}
                        ticks={[0, 5000, 10000]}
                        tickFormatter={(value) =>
                          value === 0 ? "0" : `${Math.round(value / 1000)}k`
                        }
                        fontSize={CHART_AXIS_FONT_SIZE}
                      />
                      <Tooltip
                        content={
                          <ChartTooltipContent
                            seriesLabelMap={{ revenue: "Revenue" }}
                            seriesFormatMap={{ revenue: "currency" }}
                          />
                        }
                      />
                      <Bar dataKey="impressions" fill="#6D5BD0" radius={0} />
                      <Bar dataKey="revenue" fill="var(--chart-1)" radius={0} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                )}
              </div>
              {!campaignsLoading &&
                !campaignsError &&
                hasCampaignPerformanceData && (
                  <div className="mt-5 flex items-center gap-6 pl-12 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3"
                        style={{ backgroundColor: "#6D5BD0" }}
                        aria-hidden="true"
                      />
                      <span>Ad Impressions</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3"
                        style={{ backgroundColor: "var(--chart-1)" }}
                        aria-hidden="true"
                      />
                      <span>Revenue</span>
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>

          <Card className="glass-card border-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold">
                Points Awarded vs Redeemed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                {rewardStatsLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading points trends...
                  </div>
                ) : rewardStatsError ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Unable to load points trends.
                  </div>
                ) : !hasPointsData ? (
                  renderChartEmptyState(
                    "No points data",
                    "No points were awarded or redeemed for this period.",
                  )
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart
                      data={pointsTrendData}
                      margin={{ top: 6, right: 18, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="hsl(var(--border))"
                        strokeOpacity={0.65}
                      />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickMargin={CHART_X_TICK_MARGIN}
                        interval="preserveStartEnd"
                        fontSize={CHART_AXIS_FONT_SIZE}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        domain={[0, pointsDomainMax]}
                        ticks={pointsTicks.length ? pointsTicks : undefined}
                        tickFormatter={(value) =>
                          `${Math.round(Number(value) / 1000)}k`
                        }
                        fontSize={CHART_AXIS_FONT_SIZE}
                      />
                      <Tooltip
                        content={
                          <ChartTooltipContent
                            seriesFormatMap={{
                              awarded: "number",
                              redeemed: "number",
                            }}
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="awarded"
                        stroke="var(--chart-2)"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="redeemed"
                        stroke="var(--chart-1)"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                )}
              </div>
              {!rewardStatsLoading && !rewardStatsError && hasPointsData && (
                <div className="mt-5 flex items-center gap-6 pl-12 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-8"
                      style={{ backgroundColor: "var(--chart-2)" }}
                      aria-hidden="true"
                    />
                    <span>Awarded</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-8"
                      style={{ backgroundColor: "var(--chart-1)" }}
                      aria-hidden="true"
                    />
                    <span>Redeemed</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 md:gap-8"></div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 md:gap-8">
          <Card className="glass-card border-0 lg:col-span-8">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl font-bold">
                  Ride Completion Rates
                </CardTitle>
                <div
                  role="group"
                  aria-label="Ride completion granularity"
                  className="flex items-center gap-2 rounded-full bg-muted px-1 py-1"
                >
                  <button
                    type="button"
                    onClick={() => setRouteCompletionView("daily")}
                    aria-pressed={routeCompletionView === "daily"}
                    className={
                      "rounded-full px-3 py-1 text-xs font-semibold transition " +
                      (routeCompletionView === "daily"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground")
                    }
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteCompletionView("weekly")}
                    aria-pressed={routeCompletionView === "weekly"}
                    className={
                      "rounded-full px-3 py-1 text-xs font-semibold transition  " +
                      (routeCompletionView === "weekly"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground")
                    }
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteCompletionView("monthly")}
                    aria-pressed={routeCompletionView === "monthly"}
                    className={
                      "rounded-full px-3 py-1 text-xs font-semibold transition " +
                      (routeCompletionView === "monthly"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground")
                    }
                  >
                    Monthly
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                {routesLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading route completion...
                  </div>
                ) : routesError ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Unable to load route completion.
                  </div>
                ) : !hasRouteCompletionData ? (
                  renderChartEmptyState(
                    "No route completion data",
                    "No route assignments were recorded for this period.",
                  )
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={routeCompletionChartData}
                      barSize={routeCompletionBarSize}
                      barCategoryGap={routeCompletionCategoryGap}
                      margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="hsl(var(--border))"
                        strokeOpacity={0.65}
                      />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine
                        tickMargin={CHART_X_TICK_MARGIN}
                        interval={routeCompletionXAxisInterval}
                        fontSize={CHART_AXIS_FONT_SIZE}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        domain={[0, 100]}
                        ticks={[0, 20, 40, 60, 80, 100]}
                        tickFormatter={(value) => `${value}%`}
                        fontSize={CHART_AXIS_FONT_SIZE}
                      />
                      <Tooltip
                        content={
                          <ChartTooltipContent
                            seriesFormatMap={{ completionRate: "percent" }}
                          />
                        }
                      />
                      <Bar dataKey="completionRate" radius={0}>
                        {routeCompletionChartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={
                              routeCompletionView === "weekly" &&
                              entry.name === "Sat"
                                ? "var(--chart-1)"
                                : "#4F7CFF"
                            }
                          />
                        ))}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-0 lg:col-span-4">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  Recent activity
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/recent-activity">View all</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditLogsLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading activity...
                  </p>
                ) : auditLogsError ? (
                  <p className="text-sm text-muted-foreground">
                    Unable to load activity.
                  </p>
                ) : (
                  <>
                    {recentActivity.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-wrap items-center justify-between gap-2 bg-background"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {log.action}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {log.affectedEntity?.name ?? "System"} -{" "}
                            {new Date(log.timestamp).toLocaleString(
                              DASHBOARD_LOCALE,
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: DASHBOARD_TIMEZONE,
                              },
                            )}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {log.performedBy?.name ?? "Automated"}
                        </Badge>
                      </div>
                    ))}
                    {!recentActivity.length && (
                      <p className="text-sm text-muted-foreground">
                        No activity logged yet.
                      </p>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const content = (
                <div className="flex h-full w-full flex-col items-start justify-between gap-4">
                  <Icon className="!size-6 text-primary" />
                  <div className="flex w-full items-center justify-between gap-2 text-left">
                    <span className="text-sm font-semibold">
                      {action.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );

              return (
                <Button
                  key={action.label}
                  asChild={Boolean(action.href)}
                  variant="outline"
                  className="w-full aspect-square rounded-2xl p-4 h-26 border border-transparent hover:bg-primary/5 focus:bg-primary/5 transition"
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.href ? (
                    <Link href={action.href}>{content}</Link>
                  ) : (
                    content
                  )}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
