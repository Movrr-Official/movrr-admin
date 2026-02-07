"use client";

import { useQuery } from "@tanstack/react-query";
import { RewardTransaction, RiderBalance } from "@/schemas";
import { mockRewardTransactions, mockRiderBalances } from "@/data/mockRewards";
import { mockCampaigns } from "@/data/mockCampaigns";
import { mockUsers } from "@/data/mockUsers";
import {
  getRewardStats,
  getRewardTransactions,
  getRiderBalances,
} from "@/app/actions/rewards";
import { shouldUseMockData } from "@/lib/dataSource";

interface RewardFilters {
  riderId?: string;
  campaignId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

interface RewardStatsFilters {
  dateRange?: {
    from?: Date;
    to?: Date;
  };
}

export const useRewardTransactions = (filters?: RewardFilters) => {
  return useQuery<RewardTransaction[]>({
    queryKey: ["rewardTransactions", filters],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (shouldUseMockData()) {
        let transactions = [...mockRewardTransactions];

        if (filters?.riderId) {
          transactions = transactions.filter(
            (txn) => txn.riderId === filters.riderId,
          );
        }

        if (filters?.campaignId) {
          transactions = transactions.filter(
            (txn) => txn.campaignId === filters.campaignId,
          );
        }

        if (filters?.type) {
          transactions = transactions.filter(
            (txn) => txn.type === filters.type,
          );
        }

        if (filters?.startDate) {
          transactions = transactions.filter(
            (txn) => new Date(txn.createdAt) >= new Date(filters.startDate!),
          );
        }

        if (filters?.endDate) {
          transactions = transactions.filter(
            (txn) => new Date(txn.createdAt) <= new Date(filters.endDate!),
          );
        }

        return transactions.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      }

      const result = await getRewardTransactions(filters);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch reward transactions");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useRiderBalances = () => {
  return useQuery<RiderBalance[]>({
    queryKey: ["riderBalances"],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (shouldUseMockData()) {
        return mockRiderBalances;
      }

      const result = await getRiderBalances();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch rider balances");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useRewardStats = (filters?: RewardStatsFilters) => {
  return useQuery({
    queryKey: ["rewardStats", filters],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (shouldUseMockData()) {
        let transactions = [...mockRewardTransactions];
        if (filters?.dateRange?.from || filters?.dateRange?.to) {
          const from = filters.dateRange?.from
            ? new Date(filters.dateRange.from)
            : null;
          const to = filters.dateRange?.to
            ? new Date(filters.dateRange.to)
            : null;
          transactions = transactions.filter((txn) => {
            const createdAt = new Date(txn.createdAt);
            if (from && createdAt < from) return false;
            if (to && createdAt > to) return false;
            return true;
          });
        }
        const totalPointsAwarded = transactions
          .filter((txn) => txn.type === "awarded" || txn.type === "adjusted")
          .reduce((sum, txn) => sum + Math.abs(txn.points), 0);
        const totalPointsRedeemed = transactions
          .filter((txn) => txn.type === "redeemed")
          .reduce((sum, txn) => sum + Math.abs(txn.points), 0);
        const totalPointsOutstanding = totalPointsAwarded - totalPointsRedeemed;

        const campaignPoints: Record<
          string,
          { campaignId: string; campaignName: string; points: number }
        > = {};
        transactions.forEach((txn) => {
          if (
            txn.campaignId &&
            (txn.type === "awarded" || txn.type === "adjusted")
          ) {
            if (!campaignPoints[txn.campaignId]) {
              const campaign = mockCampaigns.find(
                (c) => c.id === txn.campaignId,
              );
              campaignPoints[txn.campaignId] = {
                campaignId: txn.campaignId,
                campaignName: campaign?.name || `Campaign ${txn.campaignId}`,
                points: 0,
              };
            }
            campaignPoints[txn.campaignId].points += Math.abs(txn.points);
          }
        });

        const riderPoints: Record<
          string,
          { riderId: string; riderName: string; points: number }
        > = {};
        transactions.forEach((txn) => {
          if (txn.type === "awarded" || txn.type === "adjusted") {
            if (!riderPoints[txn.riderId]) {
              const rider = mockUsers.find(
                (u) => u.id === txn.riderId && u.role === "rider",
              );
              riderPoints[txn.riderId] = {
                riderId: txn.riderId,
                riderName: rider?.name || `Rider ${txn.riderId}`,
                points: 0,
              };
            }
            riderPoints[txn.riderId].points += Math.abs(txn.points);
          }
        });

        const dailyTrends: Array<{
          date: string;
          awarded: number;
          redeemed: number;
        }> = [];
        let rangeEnd = filters?.dateRange?.to
          ? new Date(filters.dateRange.to)
          : null;
        let rangeStart = filters?.dateRange?.from
          ? new Date(filters.dateRange.from)
          : null;

        if (!rangeStart || !rangeEnd) {
          const dates = transactions
            .map((txn) => new Date(txn.createdAt))
            .filter((date) => !Number.isNaN(date.getTime()));
          if (dates.length) {
            const times = dates.map((date) => date.getTime());
            rangeStart = new Date(Math.min(...times));
            rangeEnd = new Date(Math.max(...times));
          } else {
            rangeStart = new Date();
            rangeEnd = new Date();
          }
        }

        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd.setHours(23, 59, 59, 999);

        const days = Math.max(
          1,
          Math.ceil(
            (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1,
        );

        for (let i = 0; i < days; i++) {
          const date = new Date(rangeStart);
          date.setDate(rangeStart.getDate() + i);
          const dateStr = date.toISOString().split("T")[0];

          const dayTransactions = transactions.filter((txn) =>
            txn.createdAt.startsWith(dateStr),
          );

          const awarded = dayTransactions
            .filter((txn) => txn.type === "awarded" || txn.type === "adjusted")
            .reduce((sum, txn) => sum + Math.abs(txn.points), 0);
          const redeemed = dayTransactions
            .filter((txn) => txn.type === "redeemed")
            .reduce((sum, txn) => sum + Math.abs(txn.points), 0);

          dailyTrends.push({ date: dateStr, awarded, redeemed });
        }

        return {
          totalPointsAwarded,
          totalPointsRedeemed,
          totalPointsOutstanding,
          totalTransactions: transactions.length,
          pointsByCampaign: Object.values(campaignPoints),
          pointsByRider: Object.values(riderPoints),
          dailyTrends,
        };
      }

      const result = await getRewardStats(filters?.dateRange);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch reward stats");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};
