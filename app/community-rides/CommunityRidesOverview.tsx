"use client";

import { Users, CalendarClock, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { CommunityRidesTable } from "@/components/community-rides/CommunityRidesTable";
import { useCommunityRidesData } from "@/hooks/useCommunityRidesData";
import { StatsCard } from "@/components/stats/StatsCard";

export default function CommunityRidesOverview() {
  const {
    data: rides,
    isLoading,
    isFetching,
    refetch,
  } = useCommunityRidesData();

  const total = rides?.length ?? 0;
  const upcoming = rides?.filter((r) => r.status === "upcoming").length ?? 0;
  const active = rides?.filter((r) => r.status === "active").length ?? 0;
  const completed = rides?.filter((r) => r.status === "completed").length ?? 0;
  const cancelled = rides?.filter((r) => r.status === "cancelled").length ?? 0;

  const totalParticipants =
    rides?.reduce((sum, r) => sum + r.participantCount, 0) ?? 0;
  const avgParticipants =
    total > 0 ? Math.round(totalParticipants / total) : 0;

  const fullRides =
    rides?.filter((r) => r.participantCount >= r.maxParticipants).length ?? 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentRides =
    rides?.filter((r) => new Date(r.createdAt) >= sevenDaysAgo).length ?? 0;

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatsCard
            title="Total Rides"
            value={total}
            icon={CalendarClock}
            trend={
              recentRides > 0
                ? {
                    value: recentRides,
                    type: "increase",
                    label: "this week",
                    icon: TrendingUp,
                  }
                : undefined
            }
            badges={[
              {
                label: `${upcoming} upcoming`,
                className: "bg-info/10 text-info border-info/30",
              },
              ...(active > 0
                ? [
                    {
                      label: `${active} active`,
                      className: "bg-success/10 text-success border-success/30",
                    },
                  ]
                : []),
            ]}
          />

          <StatsCard
            title="Upcoming Rides"
            value={upcoming}
            icon={CalendarClock}
            badges={[
              ...(fullRides > 0
                ? [
                    {
                      label: `${fullRides} full`,
                      className:
                        "bg-warning/10 text-warning border-warning/30",
                    },
                  ]
                : []),
            ]}
            animationDelay="0.1s"
          />

          <StatsCard
            title="Total Participants"
            value={totalParticipants}
            icon={Users}
            description={`avg ${avgParticipants} per ride`}
            badges={[
              {
                label: `${completed} completed`,
                className: "bg-success/10 text-success border-success/30",
              },
            ]}
            animationDelay="0.2s"
          />

          <StatsCard
            title="Completion Rate"
            value={
              total > 0
                ? `${Math.round((completed / total) * 100)}%`
                : "—"
            }
            icon={CheckCircle2}
            badges={[
              ...(cancelled > 0
                ? [
                    {
                      label: `${cancelled} cancelled`,
                      className:
                        "bg-destructive/10 text-destructive border-destructive/30",
                    },
                  ]
                : []),
            ]}
            animationDelay="0.3s"
          />
        </div>

        {/* Table */}
        <CommunityRidesTable
          rides={rides ?? []}
          isLoading={isLoading}
          isRefetching={isFetching}
          toolbar={true}
          refetchData={refetch}
        />
      </div>
    </div>
  );
}
