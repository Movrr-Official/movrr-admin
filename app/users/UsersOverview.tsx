"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Users,
  Shield,
  Building2,
  Bike,
  TrendingUp,
  Activity,
  UserCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { UsersTable } from "@/components/users/UsersTable";
import { useUsersData } from "@/hooks/useUsersData";
import { useUserStats } from "@/hooks/useUserStats";
import { StatsCard } from "@/components/stats/StatsCard";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function UsersOverview() {
  const router = useRouter();
  const { data: users, isLoading, error, refetch } = useUsersData();
  const { data: stats } = useUserStats();

  // Calculate comprehensive stats for user management
  const totalUsers = users?.length ?? 0;
  const activeUsers = stats?.active ?? 0;
  const inactiveUsers = stats?.inactive ?? 0;
  const pendingUsers = users?.filter((u) => u.status === "pending").length ?? 0;

  const ridersCount = stats?.roleCounts?.rider ?? 0;
  const advertisersCount = stats?.roleCounts?.advertiser ?? 0;
  const adminsCount = stats?.roleCounts?.admin ?? 0;
  const moderatorsCount = stats?.roleCounts?.moderator ?? 0;
  const supportCount = stats?.roleCounts?.support ?? 0;

  // Calculate users in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentUsers =
    users?.filter((user) => new Date(user.createdAt) >= sevenDaysAgo).length ??
    0;

  // Calculate users active in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentlyActiveUsers =
    users?.filter(
      (user) => user.lastLogin && new Date(user.lastLogin) >= thirtyDaysAgo,
    ).length ?? 0;

  // Calculate daily average
  const oldestUser =
    users && users.length > 0
      ? new Date(
          [...users].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )[0].createdAt,
        )
      : new Date();
  const daysSinceLaunch = Math.max(
    1,
    Math.ceil(
      (new Date().getTime() - oldestUser.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  const dailyAverage = Math.round(totalUsers / daysSinceLaunch);

  // Calculate activity rate
  const activityRate =
    totalUsers > 0
      ? Math.round(((recentlyActiveUsers ?? 0) / totalUsers) * 100)
      : 0;

  // Calculate verified users
  const verifiedUsers = users?.filter((u) => u.isVerified).length ?? 0;
  const verificationRate =
    totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 100) : 0;

  // Calculate users created in last 30 days
  const usersLast30Days =
    users?.filter((user) => new Date(user.createdAt) >= thirtyDaysAgo).length ??
    0;

  // Calculate growth rate (comparing last 30 days to previous 30 days)
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const usersPrevious30Days =
    users?.filter((user) => {
      const createdAt = new Date(user.createdAt);
      return createdAt >= sixtyDaysAgo && createdAt < thirtyDaysAgo;
    }).length ?? 0;
  const growthRate =
    usersPrevious30Days > 0
      ? Math.round(
          ((usersLast30Days - usersPrevious30Days) / usersPrevious30Days) * 100,
        )
      : usersLast30Days > 0
        ? 100
        : 0;

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        {/* Stats Cards Grid - 2 columns layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Left Side - 2x2 Stats Cards Grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            <StatsCard
              title="Total Users"
              value={totalUsers}
              icon={Users}
              description={`${dailyAverage} users/day average`}
              trend={
                recentUsers > 0
                  ? {
                      value: recentUsers,
                      type: "increase",
                      label: "this week",
                      icon: TrendingUp,
                    }
                  : undefined
              }
            />

            <StatsCard
              title="Active Users"
              value={activeUsers}
              icon={UserCheck}
              trend={{
                value: activityRate,
                type: "increase",
              }}
              badges={[
                ...(inactiveUsers > 0
                  ? [
                      {
                        label: `${inactiveUsers} inactive`,
                        className:
                          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
                      },
                    ]
                  : []),
                ...(pendingUsers > 0
                  ? [
                      {
                        label: `${pendingUsers} pending`,
                        className:
                          "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
                      },
                    ]
                  : []),
              ]}
              animationDelay="0.1s"
            />

            <StatsCard
              title="Role Distribution"
              value=""
              icon={Shield}
              metrics={[
                {
                  label: "Riders",
                  value: ridersCount,
                  icon: Bike,
                  iconColor: "text-primary",
                },
                {
                  label: "Advertisers",
                  value: advertisersCount,
                  icon: Building2,
                  iconColor: "text-blue-600",
                },
                {
                  label: "Admins",
                  value: adminsCount + moderatorsCount + supportCount,
                  icon: Shield,
                  iconColor: "text-amber-600",
                },
              ]}
              animationDelay="0.2s"
            />

            <StatsCard
              title="User Health"
              value={`${activityRate}%`}
              icon={Activity}
              description="Active in last 30 days"
              progress={{
                value: activityRate,
              }}
              badges={[
                {
                  label: `${recentlyActiveUsers} recently active`,
                  className:
                    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
                },
              ]}
              animationDelay="0.3s"
            />
          </div>

          {/* Right Side - User Growth & Verification Card */}
          <Card
            className="glass-card border-0 animate-slide-up"
            style={{ animationDelay: "0.4s" }}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">
                    User Growth
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Registration trends and verification
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Growth Rate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    30-Day Growth
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-semibold",
                      growthRate >= 0
                        ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300"
                        : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
                    )}
                  >
                    {growthRate >= 0 ? "+" : ""}
                    {growthRate}%
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {usersLast30Days} new users this month
                  </span>
                </div>
              </div>

              <Separator />

              {/* Verification Status */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Verified Accounts
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    {verifiedUsers}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: `${verificationRate}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {verificationRate}% verified
                  </span>
                  <span className="text-muted-foreground">
                    {totalUsers - verifiedUsers} pending
                  </span>
                </div>
              </div>

              <Separator />

              {/* Recent Activity */}
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Recent Activity
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-xs text-foreground">This Week</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      +{recentUsers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs text-foreground">Pending</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {pendingUsers}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table with Toolbar */}
        <UsersTable
          users={users ?? []}
          isLoading={isLoading}
          toolbar={true}
          searchBar={false}
          refetchData={refetch}
        />
      </div>
    </div>
  );
}
