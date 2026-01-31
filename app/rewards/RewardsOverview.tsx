"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, useMotionValue, useSpring } from "framer-motion";
import {
  Coins,
  TrendingDown,
  Users,
  Megaphone,
  Activity,
  Target,
} from "lucide-react";
import { RewardsTable } from "@/components/rewards/RewardsTable";
import { RiderBalanceTable } from "@/components/rewards/RiderBalanceTable";
import {
  useRewardTransactions,
  useRewardStats,
  useRiderBalances,
} from "@/hooks/useRewardsData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatsCard } from "@/components/stats/StatsCard";
import { RewardCatalogPanel } from "@/components/rewards/RewardCatalogPanel";

export default function RewardsOverview() {
  const {
    data: transactions,
    isLoading: isLoadingTransactions,
    refetch: refetchTransactions,
  } = useRewardTransactions();
  const {
    data: balances,
    isLoading: isLoadingBalances,
    refetch: refetchBalances,
  } = useRiderBalances();
  const { data: stats } = useRewardStats();

  // Calculate comprehensive stats for rewards management
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 180, damping: 20 });
  const rotateY = useSpring(tiltY, { stiffness: 180, damping: 20 });
  const totalPointsAwarded = stats?.totalPointsAwarded ?? 0;
  const totalPointsRedeemed = stats?.totalPointsRedeemed ?? 0;
  const totalPointsOutstanding = stats?.totalPointsOutstanding ?? 0;
  const totalTransactions = stats?.totalTransactions ?? 0;

  // Calculate recent activity (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentTransactions =
    transactions?.filter((txn) => new Date(txn.createdAt) >= sevenDaysAgo)
      .length ?? 0;

  // Calculate redemption rate
  const redemptionRate =
    totalPointsAwarded > 0
      ? Math.round((totalPointsRedeemed / totalPointsAwarded) * 100)
      : 0;

  // Get top campaigns by points
  const topCampaigns =
    stats?.pointsByCampaign.sort((a, b) => b.points - a.points).slice(0, 3) ??
    [];

  // Get top riders by points
  const topRiders =
    stats?.pointsByRider.sort((a, b) => b.points - a.points).slice(0, 3) ?? [];

  const recentPayouts =
    transactions
      ?.filter((txn) => txn.type === "redeemed")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 3) ?? [];

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        {/* Summary Row - Featured + Compact Stats + Insight Card */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
          <motion.div
            className="xl:col-span-3 xl:row-span-2 min-h-[100px] mb-11"
            style={{ perspective: 1000 }}
            onMouseMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - bounds.left;
              const y = event.clientY - bounds.top;
              const midX = bounds.width / 2;
              const midY = bounds.height / 2;
              const maxX = 14;
              const maxY = 15;
              const rotateXValue = ((y - midY) / midY) * maxX;
              const rotateYValue = ((x - midX) / midX) * maxY;
              tiltX.set(rotateXValue);
              tiltY.set(rotateYValue);
            }}
            onMouseLeave={() => {
              tiltX.set(0);
              tiltY.set(0);
            }}
          >
            <motion.div
              className="h-full border-0 overflow-hidden min-h-[100px] bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md rounded-xl"
              style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            >
              <div className="h-full flex flex-col items-center justify-center text-center gap-5 p-6 md:p-8">
                <p className="text-base md:text-lg font-semibold text-primary-foreground/80">
                  Total Points Awarded
                </p>
                <div className="text-5xl md:text-6xl font-bold">
                  {totalPointsAwarded.toLocaleString()}
                </div>
                <div className="px-3 py-1 rounded-full bg-primary-foreground/15 text-sm font-semibold text-primary-foreground">
                  Lifetime total
                </div>
              </div>
            </motion.div>
          </motion.div>

          <div className="xl:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            <StatsCard
              title="Total Points Redeemed"
              value={totalPointsRedeemed}
              icon={TrendingDown}
              trend={{
                value: redemptionRate,
                type: "increase",
              }}
              size="mini"
            />

            <StatsCard
              title="Outstanding Balance"
              value={totalPointsOutstanding}
              icon={Coins}
              size="mini"
            />

            <StatsCard
              title="Redemption Rate"
              value={`${redemptionRate}%`}
              icon={Target}
              size="mini"
            />

            <StatsCard
              title="Total Transactions"
              value={totalTransactions}
              icon={Activity}
              // description={`${recentTransactions} in last 7 days`}
              size="mini"
            />
          </div>

          <Card className="glass-card border-0 animate-slide-up xl:col-span-3 xl:row-span-2 h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                Top Campaigns by Points
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCampaigns.length > 0 ? (
                <div className="space-y-3">
                  {topCampaigns.map((campaign, index) => (
                    <div
                      key={campaign.campaignId}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {campaign.campaignName}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {campaign.campaignId}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-semibold">
                          {campaign.points.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No campaign data available
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content Row - Tables + Insights */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
          <div className="xl:col-span-9">
            {/* Tabs for Transaction History and Balance Management */}
            <Tabs defaultValue="transactions" className="w-full">
              <TabsList className="grid w-full max-w-[560px] grid-cols-3">
                <TabsTrigger value="transactions">
                  Transaction History
                </TabsTrigger>
                <TabsTrigger value="balances">Balance Management</TabsTrigger>
                <TabsTrigger value="catalog">Reward Catalog</TabsTrigger>
              </TabsList>

              {/* Transaction History Tab */}
              <TabsContent value="transactions" className="space-y-4 mt-4">
                <RewardsTable
                  transactions={transactions || []}
                  isLoading={isLoadingTransactions}
                  searchBar={false}
                  refetchData={refetchTransactions}
                  isRefetching={false}
                />
              </TabsContent>

              {/* Balance Management Tab */}
              <TabsContent value="balances" className="space-y-4 mt-4">
                <RiderBalanceTable
                  balances={balances || []}
                  isLoading={isLoadingBalances}
                  searchBar={false}
                  refetchData={refetchBalances}
                  isRefetching={false}
                />
              </TabsContent>

              <TabsContent value="catalog" className="space-y-4 mt-4">
                <RewardCatalogPanel />
              </TabsContent>
            </Tabs>
          </div>

          <div className="xl:col-span-3 space-y-4 md:space-y-6">
            {/* Top Riders by Points */}
            <Card className="glass-card border-0 animate-slide-up">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Top Riders by Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topRiders.length > 0 ? (
                  <div className="space-y-3">
                    {topRiders.map((rider, index) => (
                      <div
                        key={rider.riderId}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {rider.riderName}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {rider.riderId}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-amber-600" />
                          <span className="text-sm font-semibold">
                            {rider.points.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No rider data available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent Payouts */}
            <Card className="glass-card border-0 animate-slide-up">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  Recent Payouts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentPayouts.length > 0 ? (
                  <div className="space-y-3">
                    {recentPayouts.map((payout) => (
                      <div
                        key={payout.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Redeemed</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(payout.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="text-sm font-semibold">
                          {Math.abs(payout.points).toLocaleString()} pts
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recent payouts
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
