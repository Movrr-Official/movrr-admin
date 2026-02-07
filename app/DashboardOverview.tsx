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
  ClipboardCheck,
  Users,
  Bike,
  Award,
  Plus,
  FileText,
  Download,
  CheckSquare,
  MoreVertical,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

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

  const buildMonthlyBuckets = (from: Date, to: Date) => {
    const start = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "2-digit",
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

  const buildWeekBuckets = (from: Date, to: Date) => {
    const start = new Date(from);
    const end = new Date(to);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const totalDays =
      Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000)) + 1;
    const bucketSize = Math.max(1, Math.ceil(totalDays / 4));

    return Array.from({ length: 4 }).map((_, index) => {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + index * bucketSize);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + bucketSize - 1);
      bucketEnd.setHours(23, 59, 59, 999);
      return {
        label: `Week ${index + 1}`,
        start: bucketStart,
        end: bucketEnd,
      };
    });
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
  const userGrowthYear = activeDateRange?.to
    ? activeDateRange.to.getFullYear()
    : new Date().getFullYear();
  const userGrowthBuckets = monthLabels.map((label, index) => {
    if (!activeDateRange) {
      return {
        label,
        monthIndex: index,
        start: null as Date | null,
        end: null as Date | null,
      };
    }
    const monthStart = new Date(userGrowthYear, index, 1);
    const monthEnd = new Date(userGrowthYear, index + 1, 0, 23, 59, 59, 999);
    return {
      label,
      monthIndex: index,
      start: monthStart,
      end: monthEnd,
    };
  });

  const campaignRange =
    activeDateRange ??
    getDateBounds(filteredCampaigns.map((campaign) => campaign.startDate)) ??
    getFallbackRange(1);
  const campaignBuckets = buildWeekBuckets(
    campaignRange.from,
    campaignRange.to,
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
  const buildUserGrowthSeries = (role: "rider" | "advertiser") => {
    return userGrowthBuckets.reduce<Array<{ name: string; value: number }>>(
      (acc, bucket) => {
        const createdCount = usersCreated.filter((user) => {
          if (user.role !== role) return false;
          const createdAt = new Date(user.createdAt);
          if (Number.isNaN(createdAt.getTime())) return false;
          if (!activeDateRange) {
            return createdAt.getMonth() === bucket.monthIndex;
          }
          const monthStart = bucket.start;
          const monthEnd = bucket.end;
          if (!monthStart || !monthEnd) return false;
          return createdAt >= monthStart && createdAt <= monthEnd;
        }).length;
        const previousTotal = acc.length ? acc[acc.length - 1].value : 0;
        acc.push({ name: bucket.label, value: previousTotal + createdCount });
        return acc;
      },
      [],
    );
  };
  const userGrowthRiders = buildUserGrowthSeries("rider");
  const userGrowthAdvertisers = buildUserGrowthSeries("advertiser");
  const userGrowthSeries =
    userGrowthView === "riders" ? userGrowthRiders : userGrowthAdvertisers;
  const userGrowthData = userGrowthBuckets.reduce<
    Array<{ name: string; users: number }>
  >((acc, bucket) => {
    const createdCount = usersCreated.filter((user) => {
      const createdAt = new Date(user.createdAt);
      if (Number.isNaN(createdAt.getTime())) return false;
      if (!activeDateRange) {
        return createdAt.getMonth() === bucket.monthIndex;
      }
      const monthStart = bucket.start;
      const monthEnd = bucket.end;
      if (!monthStart || !monthEnd) return false;
      return createdAt >= monthStart && createdAt <= monthEnd;
    }).length;
    const previousTotal = acc.length ? acc[acc.length - 1].users : 0;
    acc.push({ name: bucket.label, users: previousTotal + createdCount });
    return acc;
  }, []);

  const campaignPerformanceData = campaignBuckets.map((bucket) => {
    const monthStart = bucket.start;
    const monthEnd = bucket.end;
    const monthlyCampaigns = filteredCampaigns.filter((campaign) => {
      const startDate = new Date(campaign.startDate);
      return startDate >= monthStart && startDate <= monthEnd;
    });
    const impressions = monthlyCampaigns.reduce(
      (sum, campaign) => sum + (campaign.impressions ?? 0),
      0,
    );
    const revenue = monthlyCampaigns.reduce(
      (sum, campaign) => sum + (campaign.spent ?? 0),
      0,
    );
    return { name: bucket.label, impressions, revenue };
  });

  const campaignPerformanceChartData = campaignPerformanceData.map((item) => ({
    name: item.name,
    impressions: item.impressions,
    engagements: item.revenue,
  }));
  const campaignPerformanceMax = campaignPerformanceChartData.reduce(
    (max, item) => Math.max(max, item.impressions, item.engagements),
    0,
  );
  const campaignPerformanceDomainMax = Math.max(
    10000,
    Math.ceil(campaignPerformanceMax / 5000) * 5000,
  );

  const pointsYear = activeDateRange?.to
    ? activeDateRange.to.getFullYear()
    : new Date().getFullYear();
  const pointsTrendData = monthLabels.map((label, index) => {
    const monthStart = new Date(pointsYear, index, 1);
    const monthEnd = new Date(pointsYear, index + 1, 0, 23, 59, 59, 999);
    const trends = (rewardStats?.dailyTrends ?? []).filter((trend) => {
      const date = new Date(trend.date);
      return date >= monthStart && date <= monthEnd;
    });
    const awarded = trends.reduce((sum, trend) => sum + trend.awarded, 0);
    const redeemed = trends.reduce((sum, trend) => sum + trend.redeemed, 0);
    return {
      name: label,
      awarded,
      redeemed,
    };
  });

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
      };
    },
  );

  const routeCompletionChartData =
    routeCompletionView === "weekly"
      ? routeCompletionWeeklyData
      : routeCompletionView === "daily"
        ? routeCompletionDailyData
        : routeCompletionMonthlyYearData;

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
      label: "Manage users",
      href: "/users",
      icon: Users,
    },
    {
      label: "Export data",
      onClick: handleExportData,
      disabled: !campaigns?.length,
      icon: Download,
    },
    {
      label: "View rewards",
      href: "/rewards",
      icon: FileText,
    },
    {
      label: "View pending approvals",
      href: "/waitlist",
      icon: CheckSquare,
    },
  ];

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
              label: "Create Campaign",
              href: "/campaigns/create",
              icon: <Plus className="mr-2 h-4 w-4" />,
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
            title="Active Campaigns"
            value={statsLoading ? "—" : statsError ? "N/A" : activeCampaigns}
            icon={ClipboardCheck}
            animationDelay="0.2s"
          />
          <StatsCard
            title="Points Awarded"
            value={statsLoading ? "—" : statsError ? "N/A" : totalPointsAwarded}
            icon={Award}
            animationDelay="0.3s"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 md:gap-8">
          <Card className="glass-card border-0 lg:col-span-8">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl font-bold">User Growth</CardTitle>
                <div className="flex items-center gap-2 rounded-full bg-muted px-1 py-1">
                  <button
                    type="button"
                    onClick={() => setUserGrowthView("riders")}
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
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsAreaChart data={userGrowthSeries}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) =>
                          value >= 1000 ? `${Math.round(value / 1000)}k` : value
                        }
                      />
                      <Tooltip content={<ChartTooltipContent />} />
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
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl font-bold">
                  Campaign Performance
                </CardTitle>
                {/* <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-mr-2 h-8 w-8 text-muted-foreground"
                  aria-label="Open menu"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button> */}
              </div>
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
                        tickMargin={10}
                        interval={0}
                        fontSize={12}
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
                        fontSize={12}
                      />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="impressions" fill="#6D5BD0" radius={0} />
                      <Bar
                        dataKey="engagements"
                        fill="var(--chart-1)"
                        radius={0}
                      />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-5 flex items-center gap-6 pl-12 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3"
                    style={{ backgroundColor: "#6D5BD0" }}
                    aria-hidden="true"
                  />
                  <span>Impressions</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3"
                    style={{ backgroundColor: "var(--chart-1)" }}
                    aria-hidden="true"
                  />
                  <span>Engagements</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-0">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl font-bold">
                  Points Awarded vs Redeemed
                </CardTitle>
              </div>
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
                        tickMargin={10}
                        interval="preserveStartEnd"
                        fontSize={12}
                        tickFormatter={(value) => String(value).slice(0, 3)}
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
                        fontSize={12}
                      />
                      <Tooltip content={<ChartTooltipContent />} />
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
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 md:gap-8"></div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 md:gap-8">
          <Card className="glass-card border-0 lg:col-span-8">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl font-bold">
                  Route Completion Rates
                </CardTitle>
                <div className="flex items-center gap-2 rounded-full bg-muted px-1 py-1">
                  <button
                    type="button"
                    onClick={() => setRouteCompletionView("daily")}
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
                        tickMargin={10}
                        interval={routeCompletionXAxisInterval}
                        fontSize={12}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        domain={[0, 100]}
                        ticks={[0, 20, 40, 60, 80, 100]}
                        tickFormatter={(value) => `${value}%`}
                        fontSize={12}
                      />
                      <Tooltip content={<ChartTooltipContent />} />
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
                            {log.affectedEntity?.name ?? "System"} ·{" "}
                            {new Date(log.timestamp).toLocaleString("en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
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
