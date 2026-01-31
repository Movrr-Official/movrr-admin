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
} from "lucide-react";
import { WaitlistTable } from "@/components/waitlist/WaitlistTable";
import { useWaitlistData } from "@/hooks/useWaitlistData";
import { StatsCard } from "@/components/stats/StatsCard";

export default function WaitlistOverview() {
  const { data: entries, isLoading, error } = useWaitlistData();

  // Calculate stats
  const totalSignups = entries?.length ?? 0;
  const citiesCount = new Set(entries?.map((entry) => entry.city)).size;
  const bikeOwners = entries?.filter(
    (entry) => entry.bike_ownership === "yes",
  ).length;
  const planningBike = entries?.filter(
    (entry) => entry.bike_ownership === "planning",
  ).length;
  const noBike = entries?.filter(
    (entry) => entry.bike_ownership === "no",
  ).length;

  const cityBreakdown = entries?.reduce(
    (acc, entry) => {
      acc[entry.city] = (acc[entry.city] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const topCities = Object.entries(cityBreakdown ?? {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);

  // Calculate signups in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentSignups = entries?.filter(
    (entry) => new Date(entry.created_at) >= sevenDaysAgo,
  ).length;

  // Calculate daily average
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
  const bikeOwnersPercent =
    totalSignups > 0 ? Math.round(((bikeOwners ?? 0) / totalSignups) * 100) : 0;

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatsCard
            title="Total Signups"
            value={totalSignups}
            icon={Users}
            description={`${dailyAverage} signups/day average`}
            trend={
              (recentSignups ?? 0) > 0
                ? {
                    value: recentSignups ?? 0,
                    type: "increase",
                    label: "this week",
                    icon: TrendingUp,
                  }
                : undefined
            }
          />

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
            animationDelay="0.1s"
          />

          <StatsCard
            title="Bike Owners"
            value={bikeOwners ?? 0}
            icon={Bike}
            trend={{
              value: bikeOwnersPercent,
              type: "increase",
            }}
            badges={[
              {
                label: `${planningBike} planning`,
                className: "bg-primary/10 text-primary border-primary/20",
              },
              {
                label: `${noBike} no bike`,
                className: "bg-muted text-muted-foreground border-border",
              },
            ]}
            animationDelay="0.2s"
          />

          <StatsCard
            title="Growth Rate"
            value={`${dailyAverage}/day`}
            icon={Calendar}
            description="Average signups"
            progress={{
              value: Math.min(
                100,
                ((recentSignups ?? 0) / Math.max(1, dailyAverage * 7)) * 100,
              ),
            }}
            animationDelay="0.3s"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Top Cities */}
          <Card
            className="lg:col-span-1 glass-card border-0 animate-slide-up"
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
