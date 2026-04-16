"use client";

import {
  Bike,
  CheckCircle2,
  AlertCircle,
  Timer,
  Coins,
  Megaphone,
  ShieldAlert,
} from "lucide-react";

import { RideSessionsTable } from "@/components/ride-sessions/RideSessionsTable";
import { StatsCard } from "@/components/stats/StatsCard";
import { useRideSessionsData } from "@/hooks/useRideSessionsData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function RideSessionsOverview() {
  const {
    data: sessions,
    isLoading,
    isFetching,
    refetch,
  } = useRideSessionsData();

  const total = sessions?.length ?? 0;
  const verified =
    sessions?.filter((s) => s.verificationStatus === "verified").length ?? 0;
  const pending =
    sessions?.filter((s) => s.verificationStatus === "pending").length ?? 0;
  const rejected =
    sessions?.filter((s) => s.verificationStatus === "rejected").length ?? 0;
  const manualReview =
    sessions?.filter((s) => s.verificationStatus === "manual_review").length ??
    0;

  const freeRideSessions =
    sessions?.filter((s) => s.earningMode === "standard_ride").length ?? 0;
  const campaignRideSessions =
    sessions?.filter((s) => s.earningMode === "ad_enhanced_ride").length ?? 0;

  const totalPoints =
    sessions?.reduce((sum, s) => sum + s.pointsAwarded, 0) ?? 0;
  const totalVerifiedMinutes =
    sessions?.reduce((sum, s) => sum + s.verifiedMinutes, 0) ?? 0;

  const verificationRate = total > 0 ? Math.round((verified / total) * 100) : 0;

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatsCard
            title="Total Sessions"
            value={total}
            icon={Timer}
            badges={[
              {
                label: `${freeRideSessions} standard ride`,
                className:
                  "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
              },
              ...(campaignRideSessions > 0
                ? [
                    {
                      label: `${campaignRideSessions} campaign`,
                      className:
                        "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
                    },
                  ]
                : []),
            ]}
          />

          <StatsCard
            title="Verification Rate"
            value={`${verificationRate}%`}
            icon={CheckCircle2}
            progress={{
              value: verificationRate,
              label: `${verified} verified`,
              showLabel: true,
            }}
            badges={[
              ...(pending > 0
                ? [
                    {
                      label: `${pending} pending`,
                      className: "bg-amber-50 text-amber-700 border-amber-200",
                    },
                  ]
                : []),
              ...(manualReview > 0
                ? [
                    {
                      label: `${manualReview} review`,
                      className:
                        "bg-orange-50 text-orange-700 border-orange-200",
                    },
                  ]
                : []),
            ]}
            animationDelay="0.1s"
          />

          <StatsCard
            title="Ride Mode Split"
            value=""
            icon={Bike}
            metrics={[
              {
                label: "Standard Ride Sessions",
                value: freeRideSessions,
                icon: Bike,
                iconColor: "text-sky-600",
              },
              {
                label: "Boosted Ride Sessions",
                value: campaignRideSessions,
                icon: Megaphone,
                iconColor: "text-violet-600",
              },
            ]}
            animationDelay="0.2s"
          />

          <StatsCard
            title="Points & Minutes"
            value=""
            icon={Coins}
            metrics={[
              {
                label: "Points Awarded",
                value: totalPoints.toLocaleString(),
                icon: Coins,
                iconColor: "text-amber-600",
              },
              {
                label: "Verified Minutes",
                value: totalVerifiedMinutes.toLocaleString(),
                icon: Timer,
                iconColor: "text-primary",
              },
              ...(rejected > 0
                ? [
                    {
                      label: "Rejected",
                      value: rejected,
                      icon: AlertCircle,
                      iconColor: "text-red-600",
                    },
                  ]
                : []),
            ]}
            animationDelay="0.3s"
          />
        </div>

        {/* Tabs: All Sessions | Verification Queue */}
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              All Sessions
              <Badge variant="secondary" className="ml-2 text-xs">
                {total}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="queue">
              <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
              Verification Queue
              {pending + rejected + manualReview > 0 && (
                <Badge className="ml-2 text-xs bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300">
                  {pending + rejected + manualReview}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <RideSessionsTable
              sessions={sessions ?? []}
              isLoading={isLoading}
              isRefetching={isFetching}
              toolbar={true}
              searchBar={false}
              refetchData={refetch}
            />
          </TabsContent>

          <TabsContent value="queue" className="mt-4">
            <RideSessionsTable
              sessions={(sessions ?? []).filter(
                (s) =>
                  s.verificationStatus === "pending" ||
                  s.verificationStatus === "rejected" ||
                  s.verificationStatus === "manual_review",
              )}
              isLoading={isLoading}
              isRefetching={isFetching}
              toolbar={true}
              searchBar={false}
              refetchData={refetch}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
