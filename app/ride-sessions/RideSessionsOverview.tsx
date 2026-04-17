"use client";

import { useState } from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bike,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Check,
  Leaf,
  Loader2,
  Ruler,
  ShieldX,
  Timer,
  Coins,
  Megaphone,
  ShieldAlert,
  TriangleAlert,
  MapPin,
  Clock,
} from "lucide-react";

import { verifyRideSession, VerificationAction } from "@/app/actions/rideSessions";
import { RideSession } from "@/schemas";
import { RideSessionsTable } from "@/components/ride-sessions/RideSessionsTable";
import { StatsCard } from "@/components/stats/StatsCard";
import { useRideSessionsData } from "@/hooks/useRideSessionsData";
import { useSessionAnalytics } from "@/hooks/useSessionAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";

const BIKE_TYPE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

const CHART_AXIS_FONT_SIZE = 11;

export default function RideSessionsOverview() {
  const { toast } = useToast();
  const {
    data: sessions,
    isLoading,
    isFetching,
    refetch,
  } = useRideSessionsData();
  const [pendingAction, setPendingAction] = useState<{ id: string; action: VerificationAction } | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90>(30);
  const { data: analytics, isLoading: analyticsLoading } = useSessionAnalytics(analyticsDays);

  const total = sessions?.length ?? 0;

  // Completed sessions are the correct denominator for verification rate.
  // Only sessions that have finished (status=completed/rejected, or have an
  // ended_at timestamp) enter the verification pipeline.
  const completedSessions =
    sessions?.filter(
      (s) =>
        s.status === "completed" ||
        s.status === "rejected" ||
        (s.status === undefined && !!s.endedAt),
    ).length ?? total;

  const verified =
    sessions?.filter((s) => s.verificationStatus === "verified").length ?? 0;
  const pending =
    sessions?.filter((s) => s.verificationStatus === "pending").length ?? 0;
  const rejected =
    sessions?.filter((s) => s.verificationStatus === "rejected").length ?? 0;
  const manualReview =
    sessions?.filter((s) => s.verificationStatus === "manual_review").length ??
    0;

  const standardRideSessions =
    sessions?.filter((s) => s.earningMode === "standard_ride").length ?? 0;
  const boostedRideSessions =
    sessions?.filter((s) => s.earningMode === "ad_enhanced_ride").length ?? 0;

  const totalPoints =
    sessions?.reduce((sum, s) => sum + s.pointsAwarded, 0) ?? 0;
  const totalVerifiedMinutes =
    sessions?.reduce((sum, s) => sum + s.verifiedMinutes, 0) ?? 0;

  // Correct denominator: completed sessions only (not draft/active/paused).
  const verificationRate =
    completedSessions > 0
      ? Math.round((verified / completedSessions) * 100)
      : 0;

  const handleQuickAction = async (sessionId: string, action: VerificationAction) => {
    setPendingAction({ id: sessionId, action });
    const result = await verifyRideSession({ sessionId, action });
    setPendingAction(null);
    if (result.success) {
      toast({ title: action === "approve" ? "Session approved" : action === "reject" ? "Session rejected" : "Escalated" });
      refetch();
    } else {
      toast({ title: "Action failed", description: result.error, variant: "destructive" });
    }
  };

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
                label: `${standardRideSessions} standard ride`,
                className:
                  "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
              },
              ...(boostedRideSessions > 0
                ? [
                    {
                      label: `${boostedRideSessions} boosted ride`,
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
                value: standardRideSessions,
                icon: Bike,
                iconColor: "text-sky-600",
              },
              {
                label: "Boosted Ride Sessions",
                value: boostedRideSessions,
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

        {/* Tabs: All Sessions | Verification Queue | Analytics */}
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
              {pending + manualReview > 0 && (
                <Badge className="ml-2 text-xs bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300">
                  {pending + manualReview}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Analytics
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

          <TabsContent value="queue" className="mt-4 space-y-6">
            {/* Manual Review — highest priority triage */}
            {(sessions ?? []).filter((s) => s.verificationStatus === "manual_review").length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TriangleAlert className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-semibold">Manual Review Required</h3>
                  <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300">
                    {(sessions ?? []).filter((s) => s.verificationStatus === "manual_review").length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {(sessions ?? [])
                    .filter((s) => s.verificationStatus === "manual_review")
                    .map((s) => (
                      <TriageCard
                        key={s.id}
                        session={s}
                        priority="high"
                        onApprove={() => handleQuickAction(s.id, "approve")}
                        onReject={() => handleQuickAction(s.id, "reject")}
                        isLoading={pendingAction?.id === s.id}
                        loadingAction={pendingAction?.id === s.id ? pendingAction.action : undefined}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Pending verification */}
            {(sessions ?? []).filter((s) => s.verificationStatus === "pending").length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">Pending Verification</h3>
                  <Badge variant="warning" className="text-xs">
                    {(sessions ?? []).filter((s) => s.verificationStatus === "pending").length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {(sessions ?? [])
                    .filter((s) => s.verificationStatus === "pending")
                    .map((s) => (
                      <TriageCard
                        key={s.id}
                        session={s}
                        priority="normal"
                        onApprove={() => handleQuickAction(s.id, "approve")}
                        onReject={() => handleQuickAction(s.id, "reject")}
                        onEscalate={() => handleQuickAction(s.id, "escalate")}
                        isLoading={pendingAction?.id === s.id}
                        loadingAction={pendingAction?.id === s.id ? pendingAction.action : undefined}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Nothing in queue */}
            {!isLoading &&
              (sessions ?? []).filter(
                (s) => s.verificationStatus === "pending" || s.verificationStatus === "manual_review",
              ).length === 0 && (
                <Card className="glass-card border-0">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-green-500 opacity-70" />
                    <p className="text-sm font-medium">Queue is clear</p>
                    <p className="text-xs mt-1">No sessions awaiting verification.</p>
                  </CardContent>
                </Card>
              )}
          </TabsContent>

          {/* ── Analytics tab ─────────────────────────────────────────────── */}
          <TabsContent value="analytics" className="mt-4 space-y-6">
            {/* Window selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              {([7, 30, 90] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={analyticsDays === d ? "default" : "outline"}
                  onClick={() => setAnalyticsDays(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>

            {analyticsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

                {/* Verification trend */}
                <Card className="glass-card border-0 lg:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">
                      Verification Trend — last {analyticsDays} days
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsAreaChart
                          data={analytics?.verificationTrend ?? []}
                          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="gradVerified" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradRejected" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="var(--destructive)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            fontSize={CHART_AXIS_FONT_SIZE}
                            tickFormatter={(v: string) => v.slice(5)}
                            interval={Math.ceil((analytics?.verificationTrend.length ?? 1) / 8) - 1}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            fontSize={CHART_AXIS_FONT_SIZE}
                            allowDecimals={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Area
                            dataKey="verified"
                            name="Verified"
                            type="monotone"
                            stroke="var(--chart-1)"
                            strokeWidth={2}
                            fill="url(#gradVerified)"
                            dot={false}
                          />
                          <Area
                            dataKey="rejected"
                            name="Rejected"
                            type="monotone"
                            stroke="hsl(var(--destructive))"
                            strokeWidth={1.5}
                            fill="url(#gradRejected)"
                            dot={false}
                          />
                          <Area
                            dataKey="manual_review"
                            name="Manual Review"
                            type="monotone"
                            stroke="hsl(38 92% 50%)"
                            strokeWidth={1.5}
                            fill="none"
                            dot={false}
                            strokeDasharray="4 2"
                          />
                        </RechartsAreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex items-center gap-5 text-xs text-muted-foreground">
                      {[
                        { color: "var(--chart-1)", label: "Verified" },
                        { color: "hsl(var(--destructive))", label: "Rejected" },
                        { color: "hsl(38 92% 50%)", label: "Manual Review" },
                      ].map(({ color, label }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                          {label}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Distance + CO₂ trend */}
                <Card className="glass-card border-0">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold">Distance & CO₂ Saved</CardTitle>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Ruler className="h-3.5 w-3.5" />
                          {analytics
                            ? `${analytics.distanceTrend.reduce((s, d) => s + d.distanceKm, 0).toLocaleString()} km`
                            : "—"}
                        </span>
                        <span className="flex items-center gap-1 text-green-600">
                          <Leaf className="h-3.5 w-3.5" />
                          {analytics
                            ? `${analytics.distanceTrend.reduce((s, d) => s + d.co2SavedKg, 0).toLocaleString()} kg CO₂`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsAreaChart
                          data={analytics?.distanceTrend ?? []}
                          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="gradDist" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            fontSize={CHART_AXIS_FONT_SIZE}
                            tickFormatter={(v: string) => v.slice(5)}
                            interval={Math.ceil((analytics?.distanceTrend.length ?? 1) / 6) - 1}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            fontSize={CHART_AXIS_FONT_SIZE}
                            tickFormatter={(v: number) => `${v}km`}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            formatter={(v: number, name: string) =>
                              name === "distanceKm"
                                ? [`${v} km`, "Distance"]
                                : [`${v} kg`, "CO₂ Saved"]
                            }
                          />
                          <Area
                            dataKey="distanceKm"
                            name="distanceKm"
                            type="monotone"
                            stroke="var(--chart-2)"
                            strokeWidth={2}
                            fill="url(#gradDist)"
                            dot={false}
                          />
                        </RechartsAreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Bike-type distribution */}
                <Card className="glass-card border-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Bike-Type Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.bikeTypeDistribution.length ? (
                      <div className="flex items-center gap-6">
                        <div className="h-44 w-44 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                              <Pie
                                data={analytics.bikeTypeDistribution}
                                dataKey="count"
                                nameKey="bikeType"
                                cx="50%"
                                cy="50%"
                                innerRadius="55%"
                                outerRadius="80%"
                                paddingAngle={2}
                              >
                                {analytics.bikeTypeDistribution.map((_, i) => (
                                  <Cell
                                    key={i}
                                    fill={BIKE_TYPE_COLORS[i % BIKE_TYPE_COLORS.length]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  background: "var(--popover)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  fontSize: 12,
                                }}
                              />
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-2">
                          {analytics.bikeTypeDistribution.map((item, i) => {
                            const total = analytics.bikeTypeDistribution.reduce(
                              (s, b) => s + b.count,
                              0,
                            );
                            return (
                              <div key={item.bikeType} className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{
                                    background:
                                      BIKE_TYPE_COLORS[i % BIKE_TYPE_COLORS.length],
                                  }}
                                />
                                <span className="text-xs text-foreground flex-1">
                                  {item.bikeType}
                                </span>
                                <span className="text-xs font-semibold text-foreground">
                                  {item.count}
                                </span>
                                <span className="text-xs text-muted-foreground w-10 text-right">
                                  {total > 0 ? Math.round((item.count / total) * 100) : 0}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
                        <Bike className="mr-2 h-4 w-4 opacity-50" />
                        No bike-type data
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Bonus type breakdown */}
                {analytics?.bonusBreakdown.length ? (
                  <Card className="glass-card border-0 lg:col-span-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold">
                        Bonus Type Breakdown — last {analyticsDays} days
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsBarChart
                            data={analytics.bonusBreakdown}
                            layout="vertical"
                            margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                            <XAxis
                              type="number"
                              tickLine={false}
                              axisLine={false}
                              fontSize={CHART_AXIS_FONT_SIZE}
                            />
                            <YAxis
                              type="category"
                              dataKey="label"
                              tickLine={false}
                              axisLine={false}
                              fontSize={CHART_AXIS_FONT_SIZE}
                              width={120}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "var(--popover)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                              formatter={(v: number) => [`${v.toLocaleString()} pts`, "Total Points"]}
                            />
                            <Bar dataKey="totalPoints" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Triage Card ──────────────────────────────────────────────────────────────

function TriageCard({
  session,
  priority,
  onApprove,
  onReject,
  onEscalate,
  isLoading,
  loadingAction,
}: {
  session: RideSession;
  priority: "high" | "normal";
  onApprove: () => void;
  onReject: () => void;
  onEscalate?: () => void;
  isLoading: boolean;
  loadingAction?: VerificationAction;
}) {
  const duration =
    session.endedAt
      ? Math.round(
          (new Date(session.endedAt).getTime() -
            new Date(session.startedAt).getTime()) /
            60000,
        )
      : null;

  return (
    <Card
      className={`glass-card border-0 ${priority === "high" ? "ring-1 ring-orange-300 dark:ring-orange-800" : ""}`}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {session.riderName ?? "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {session.id.slice(0, 8)}
              </span>
              {session.reasonCodes.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {session.reasonCodes.map((code) => (
                    <Badge key={code} variant="secondary" className="text-xs font-mono">
                      {code}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {session.rideQualityPercent != null && (
                <span
                  className={
                    session.rideQualityPercent >= 70
                      ? "text-green-600"
                      : session.rideQualityPercent >= 40
                        ? "text-amber-600"
                        : "text-red-600"
                  }
                >
                  Quality {session.rideQualityPercent}%
                </span>
              )}
              {duration !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {duration} min
                </span>
              )}
              {session.pointsAwarded > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Coins className="h-3 w-3" /> {session.pointsAwarded} pts
                </span>
              )}
              {(session.city || session.country) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[session.city, session.country].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950"
              disabled={isLoading}
              onClick={onApprove}
            >
              {isLoading && loadingAction === "approve" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <><Check className="h-3 w-3 mr-1" />Approve</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
              disabled={isLoading}
              onClick={onReject}
            >
              {isLoading && loadingAction === "reject" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <><ShieldX className="h-3 w-3 mr-1" />Reject</>
              )}
            </Button>
            {onEscalate && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-orange-700 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950"
                disabled={isLoading}
                onClick={onEscalate}
              >
                {isLoading && loadingAction === "escalate" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <><TriangleAlert className="h-3 w-3 mr-1" />Escalate</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
