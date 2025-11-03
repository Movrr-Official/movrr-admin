"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  MapPin,
  Bike,
  Filter,
  Calendar,
  TrendingUp,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { WaitlistTable } from "@/components/waitlist/WaitlistTable";
import { useWaitlistData } from "@/hooks/useWaitlistData";

export default function WaitlistOverview() {
  const { data: entries, isLoading, error } = useWaitlistData();

  // Calculate stats
  const totalSignups = entries?.length ?? 0;
  const citiesCount = new Set(entries?.map((entry) => entry.city)).size;
  const bikeOwners = entries?.filter(
    (entry) => entry.bike_ownership === "yes"
  ).length;
  const planningBike = entries?.filter(
    (entry) => entry.bike_ownership === "planning"
  ).length;
  const noBike = entries?.filter(
    (entry) => entry.bike_ownership === "no"
  ).length;

  const cityBreakdown = entries?.reduce(
    (acc, entry) => {
      acc[entry.city] = (acc[entry.city] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const topCities = Object.entries(cityBreakdown ?? {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);

  // Calculate signups in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentSignups = entries?.filter(
    (entry) => new Date(entry.created_at) >= sevenDaysAgo
  ).length;

  // Calculate daily average
  const oldestSignup =
    entries && entries.length > 0
      ? new Date(entries[entries.length - 1].created_at)
      : new Date();
  const daysSinceLaunch = Math.max(
    1,
    Math.ceil(
      (new Date().getTime() - oldestSignup.getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  const dailyAverage = Math.round(totalSignups / daysSinceLaunch);

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16">
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <PageHeader
          title="Dashboard"
          description="Real-time insights and management for your pre-launch waitlist"
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <Card className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group animate-slide-up overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Total Signups
              </CardTitle>
              <div className="p-3 bg-blue-100 rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 dark:bg-blue-950">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {totalSignups.toLocaleString()}
              </div>
              <div className="flex items-center gap-2 mb-2">
                {(recentSignups ?? 0) > 0 && (
                  <>
                    <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-full">
                      <TrendingUp className="h-3 w-3 text-primary" />
                      <span className="text-xs text-primary font-semibold">
                        +{recentSignups ?? 0}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      this week
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {dailyAverage} signups/day average
              </p>
            </CardContent>
          </Card>

          <Card
            className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group animate-slide-up overflow-hidden relative"
            style={{ animationDelay: "0.1s" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Active Cities
              </CardTitle>
              <div className="p-3 bg-primary/10 rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {citiesCount}
              </div>
              <div className="flex items-center gap-1 mb-2">
                <Activity className="h-3 w-3 text-primary" />
                <span className="text-xs text-primary font-semibold">
                  Markets
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Geographic reach</p>
            </CardContent>
          </Card>

          <Card
            className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group animate-slide-up overflow-hidden relative"
            style={{ animationDelay: "0.2s" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Bike Owners
              </CardTitle>
              <div className="p-3 bg-purple-100 rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 dark:bg-purple-950">
                <Bike className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {bikeOwners}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {totalSignups > 0
                  ? Math.round(((bikeOwners ?? 0) / totalSignups) * 100)
                  : 0}
                % of signups
              </p>
              <div className="flex gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="text-xs bg-primary/10 text-primary border-primary/20 font-medium"
                >
                  {planningBike} planning
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs bg-muted text-muted-foreground border-border font-medium"
                >
                  {noBike} no bike
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card
            className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group animate-slide-up overflow-hidden relative"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Growth Rate
              </CardTitle>
              <div className="p-3 bg-amber-100 rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 dark:bg-amber-950">
                <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {dailyAverage}/day
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Average signups
              </p>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${Math.min(100, ((recentSignups ?? 0) / Math.max(1, dailyAverage * 7)) * 100)}%`,
                  }}
                ></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Top Cities */}
          <Card
            className="lg:col-span-1 glass-card border-0 shadow-lg animate-slide-up"
            style={{ animationDelay: "0.4s" }}
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
                {topCities.map(([city, count], index) => (
                  <div
                    key={city}
                    className="flex items-center justify-between group hover:bg-muted/50 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground group-hover:scale-110 transition-transform shadow-md">
                        {index + 1}
                      </div>
                      <span className="font-semibold text-foreground">
                        {city}
                      </span>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary border-primary/20 font-semibold px-3 py-1"
                    >
                      {count as number}
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

          {/* Waitlist Table */}
          <WaitlistTable
            entries={entries ?? []}
            isLoading={isLoading}
            className="lg:col-span-2"
          />
        </div>
      </div>
    </div>
  );
}
