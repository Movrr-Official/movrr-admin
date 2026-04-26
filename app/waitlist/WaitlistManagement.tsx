"use client";

import {
  Users,
  TrendingUp,
  CheckCircle,
  Clock,
  MapPin,
  Bike,
  Calendar,
  Filter,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WaitlistTable } from "@/components/waitlist/WaitlistTable";
import { useWaitlistData } from "@/hooks/useWaitlistData";
import { StatsCard } from "@/components/stats/StatsCard";

export default function WaitlistManagement() {
  const {
    data: entries,
    refetch,
    isLoading,
    isFetching,
    error,
  } = useWaitlistData();

  const totalSignups = entries?.length ?? 0;
  const approvedCount =
    entries?.filter((e) => e.status === "approved").length ?? 0;
  const pendingCount =
    entries?.filter((e) => e.status === "pending").length ?? 0;
  const approvalRate =
    totalSignups > 0 ? Math.round((approvedCount / totalSignups) * 100) : 0;

  const citiesCount = new Set(entries?.map((e) => e.city)).size;
  const bikeOwners =
    entries?.filter((e) => e.bike_ownership === "own").length ?? 0;
  const planningBike =
    entries?.filter((e) => e.bike_ownership === "planning").length ?? 0;
  const noBike =
    entries?.filter((e) => e.bike_ownership === "interested").length ?? 0;
  const bikeOwnersPercent =
    totalSignups > 0 ? Math.round((bikeOwners / totalSignups) * 100) : 0;

  const riderCount = entries?.filter((e) => e.audience === "rider").length ?? 0;
  const brandCount = entries?.filter((e) => e.audience === "brand").length ?? 0;
  const partnerCount =
    entries?.filter((e) => e.audience === "partner").length ?? 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentSignups =
    entries?.filter((e) => new Date(e.created_at) >= sevenDaysAgo).length ?? 0;

  const oldestSignup =
    entries && entries.length > 0
      ? new Date(entries[entries.length - 1].created_at)
      : new Date();
  const daysSinceLaunch = Math.max(
    1,
    Math.ceil(
      (new Date().getTime() - oldestSignup.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  const dailyAverage = Math.round(totalSignups / daysSinceLaunch);

  const cityBreakdown = entries?.reduce(
    (acc, entry) => {
      const key = (entry.city ?? "").trim().toLowerCase();
      if (!key) return acc;
      if (!acc[key])
        acc[key] = { display: (entry.city ?? "").trim(), count: 0 };
      acc[key].count += 1;
      return acc;
    },
    {} as Record<string, { display: string; count: number }>,
  );
  const topCities = Object.values(cityBreakdown ?? {})
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl animate-float"></div>
        <div
          className="absolute top-40 right-20 w-48 h-48 bg-primary/3 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="absolute bottom-20 left-1/3 w-40 h-40 bg-primary/4 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "4s" }}
        ></div>
      </div>

      <div className="space-y-6 md:space-y-8">
        {/* Row 1 — Operational stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatsCard
            title="Total Signups"
            value={totalSignups}
            icon={Users}
            description={`${dailyAverage} signups/day average`}
            trend={
              recentSignups > 0
                ? {
                    value: recentSignups,
                    type: "increase",
                    label: "this week",
                    icon: TrendingUp,
                  }
                : undefined
            }
            animationDelay="0s"
          />
          <StatsCard
            title="Approved"
            value={approvedCount}
            icon={CheckCircle}
            animationDelay="0.1s"
          />
          <StatsCard
            title="Pending"
            value={pendingCount}
            icon={Clock}
            animationDelay="0.2s"
          />
          <StatsCard
            title="Approval Rate"
            value={`${approvalRate}%`}
            icon={TrendingUp}
            animationDelay="0.3s"
          />
        </div>

        {/* Row 2 — Left: insight stats above table · Right: Top Cities sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 items-start">
          {/* Left column (3/4): stats row then table */}
          <div className="lg:col-span-3 flex flex-col gap-4 md:gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <StatsCard
                title="Active Cities"
                value={citiesCount}
                icon={MapPin}
                badges={[
                  {
                    label: "Markets",
                    className: "bg-primary/10 text-primary border-primary/20",
                  },
                ]}
                animationDelay="0.4s"
              />
              <StatsCard
                title="Bike Owners"
                value={bikeOwners}
                icon={Bike}
                trend={{ value: bikeOwnersPercent, type: "increase" }}
                badges={[
                  {
                    label: `${planningBike} planning`,
                    className: "bg-primary/10 text-primary border-primary/20",
                  },
                  {
                    label: `${noBike} interested`,
                    className: "bg-muted text-muted-foreground border-border",
                  },
                ]}
                animationDelay="0.5s"
              />
              <StatsCard
                title="Audience"
                value={riderCount}
                icon={Users}
                badges={[
                  {
                    label: `${brandCount} brands`,
                    className: "bg-primary/10 text-primary border-primary/20",
                  },
                  {
                    label: `${partnerCount} partners`,
                    className: "bg-muted text-muted-foreground border-border",
                  },
                ]}
                animationDelay="0.55s"
              />
              <StatsCard
                title="Growth Rate"
                value={`${dailyAverage}/day`}
                icon={Calendar}
                description="Average signups"
                progress={{
                  value: Math.min(
                    100,
                    (recentSignups / Math.max(1, dailyAverage * 7)) * 100,
                  ),
                }}
                animationDelay="0.65s"
              />
            </div>

            <WaitlistTable
              entries={entries ?? []}
              isLoading={isLoading}
              isRefetching={isFetching}
              toolbar={true}
              searchBar={false}
              refetchData={refetch}
            />
          </div>

          {/* Right column (1/4): Top Cities sidebar */}
          <Card
            className="glass-card border-0 animate-slide-up"
            style={{ animationDelay: "0.7s" }}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl font-bold">
                    Top Cities
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Cities with the most signups
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topCities.map(({ display, count }, index) => (
                  <div
                    key={display}
                    className="flex items-center justify-between group hover:bg-muted/50 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground group-hover:scale-110 transition-transform shadow-md">
                        {index + 1}
                      </div>
                      <span className="font-semibold text-foreground">
                        {display}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-xs font-medium tabular-nums"
                    >
                      {count}
                    </Badge>
                  </div>
                ))}
                {topCities.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No cities yet</p>
                    <p className="text-sm">Waiting for signups</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
