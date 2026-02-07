"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  RewardTransaction,
  RiderBalance,
  rewardTransactionTypeSchema,
} from "@/schemas";
import { z } from "zod";

const adjustPointsSchema = z.object({
  riderId: z.string(),
  points: z.number(),
  description: z.string().optional(),
  type: rewardTransactionTypeSchema,
});

/**
 * Server action to get reward statistics
 */
export async function getRewardStats(dateRange?: {
  from?: Date;
  to?: Date;
}): Promise<{
  success: boolean;
  data?: {
    totalPointsAwarded: number;
    totalPointsRedeemed: number;
    totalPointsOutstanding: number;
    totalTransactions: number;
    pointsByCampaign: Array<{
      campaignId: string;
      campaignName: string;
      points: number;
    }>;
    pointsByRider: Array<{
      riderId: string;
      riderName: string;
      points: number;
    }>;
    dailyTrends: Array<{ date: string; awarded: number; redeemed: number }>;
  };
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: transactions, error: txnError } = await supabaseAdmin
      .from("reward_transactions")
      .select(
        "id, rider_id, campaign_id, points_earned, source, metadata, created_at",
      );

    if (txnError) {
      return { success: false, error: txnError.message };
    }

    const { data: redemptions, error: redemptionError } = await supabaseAdmin
      .from("reward_redemptions")
      .select("id, rider_id, points_spent, status, requested_at");

    if (redemptionError) {
      return { success: false, error: redemptionError.message };
    }

    let rangeEnd = dateRange?.to ? new Date(dateRange.to) : null;
    let rangeStart = dateRange?.from ? new Date(dateRange.from) : null;

    if (!rangeStart || !rangeEnd) {
      const dates: Date[] = [];
      (transactions ?? []).forEach((txn) => {
        if (txn.created_at) dates.push(new Date(txn.created_at));
      });
      (redemptions ?? []).forEach((redemption) => {
        if (redemption.requested_at)
          dates.push(new Date(redemption.requested_at));
      });
      if (dates.length) {
        const times = dates.map((d) => d.getTime());
        rangeStart = new Date(Math.min(...times));
        rangeEnd = new Date(Math.max(...times));
      } else {
        rangeStart = new Date();
        rangeEnd = new Date();
      }
    }

    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setHours(23, 59, 59, 999);

    const isInRange = (value?: string | null) => {
      if (!value) return false;
      const date = new Date(value);
      return date >= rangeStart! && date <= rangeEnd!;
    };

    const filteredTransactions = (transactions ?? []).filter((txn) =>
      isInRange(txn.created_at ?? null),
    );
    const filteredRedemptions = (redemptions ?? []).filter((redemption) =>
      isInRange(redemption.requested_at ?? null),
    );

    const totalPointsAwarded = filteredTransactions.reduce((sum, txn) => {
      const direction = txn.metadata?.adjustment_direction as
        | string
        | undefined;
      const isDebit = direction === "debit";
      return sum + (isDebit ? 0 : Number(txn.points_earned ?? 0));
    }, 0);

    const totalPointsRedeemed = filteredRedemptions.reduce(
      (sum, redemption) => sum + Number(redemption.points_spent ?? 0),
      0,
    );

    const totalAdjustmentsDebited = filteredTransactions.reduce((sum, txn) => {
      const direction = txn.metadata?.adjustment_direction as
        | string
        | undefined;
      if (direction !== "debit") return sum;
      return sum + Number(txn.points_earned ?? 0);
    }, 0);

    const totalRedeemed = totalPointsRedeemed + totalAdjustmentsDebited;
    const totalPointsOutstanding = totalPointsAwarded - totalRedeemed;

    const pointsByCampaign = new Map<string, number>();
    filteredTransactions.forEach((txn) => {
      if (!txn.campaign_id) return;
      const direction = txn.metadata?.adjustment_direction as
        | string
        | undefined;
      if (direction === "debit") return;
      const current = pointsByCampaign.get(txn.campaign_id) ?? 0;
      pointsByCampaign.set(
        txn.campaign_id,
        current + Number(txn.points_earned ?? 0),
      );
    });

    const pointsByRider = new Map<string, number>();
    filteredTransactions.forEach((txn) => {
      const direction = txn.metadata?.adjustment_direction as
        | string
        | undefined;
      if (direction === "debit") return;
      const current = pointsByRider.get(txn.rider_id) ?? 0;
      pointsByRider.set(txn.rider_id, current + Number(txn.points_earned ?? 0));
    });

    const dailyMap = new Map<string, { awarded: number; redeemed: number }>();
    const days = Math.max(
      1,
      Math.ceil(
        (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1,
    );

    for (let i = 0; i < days; i += 1) {
      const date = new Date(rangeStart);
      date.setDate(rangeStart.getDate() + i);
      const key = date.toISOString().split("T")[0];
      dailyMap.set(key, { awarded: 0, redeemed: 0 });
    }

    filteredTransactions.forEach((txn) => {
      if (!txn.created_at) return;
      const key = new Date(txn.created_at).toISOString().split("T")[0];
      const bucket = dailyMap.get(key);
      if (!bucket) return;
      const direction = txn.metadata?.adjustment_direction as
        | string
        | undefined;
      const points = Number(txn.points_earned ?? 0);
      if (direction === "debit") {
        bucket.redeemed += points;
      } else {
        bucket.awarded += points;
      }
    });

    filteredRedemptions.forEach((redemption) => {
      if (!redemption.requested_at) return;
      const key = new Date(redemption.requested_at).toISOString().split("T")[0];
      const bucket = dailyMap.get(key);
      if (!bucket) return;
      bucket.redeemed += Number(redemption.points_spent ?? 0);
    });

    const dailyTrends = Array.from(dailyMap.entries()).map(
      ([date, values]) => ({
        date,
        awarded: values.awarded,
        redeemed: values.redeemed,
      }),
    );

    const campaignIds = Array.from(pointsByCampaign.keys());
    const riderIds = Array.from(pointsByRider.keys());

    const { data: campaignRows } = campaignIds.length
      ? await supabaseAdmin
          .from("campaign")
          .select("id, name")
          .in("id", campaignIds)
      : { data: [] };

    const campaignNameById = new Map(
      (campaignRows ?? []).map((row) => [row.id, row.name]),
    );

    const { data: riderRows } = riderIds.length
      ? await supabaseAdmin
          .from("rider")
          .select("id, user_id")
          .in("id", riderIds)
      : { data: [] };

    const userIds = (riderRows ?? []).map((row) => row.user_id);

    const { data: userRows } = userIds.length
      ? await supabaseAdmin.from("user").select("id, name").in("id", userIds)
      : { data: [] };

    const userNameById = new Map(
      (userRows ?? []).map((row) => [row.id, row.name]),
    );

    const riderNameById = new Map(
      (riderRows ?? []).map((row) => [
        row.id,
        userNameById.get(row.user_id) ?? row.id,
      ]),
    );

    return {
      success: true,
      data: {
        totalPointsAwarded,
        totalPointsRedeemed: totalRedeemed,
        totalPointsOutstanding,
        totalTransactions:
          filteredTransactions.length + filteredRedemptions.length,
        pointsByCampaign: Array.from(pointsByCampaign.entries()).map(
          ([campaignId, points]) => ({
            campaignId,
            campaignName: campaignNameById.get(campaignId) ?? campaignId,
            points,
          }),
        ),
        pointsByRider: Array.from(pointsByRider.entries()).map(
          ([riderId, points]) => ({
            riderId,
            riderName: riderNameById.get(riderId) ?? riderId,
            points,
          }),
        ),
        dailyTrends,
      },
    };
  } catch (error) {
    console.error("Error fetching reward stats:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch reward stats",
    };
  }
}

/**
 * Server action to get reward transactions
 */
export async function getRewardTransactions(filters?: {
  riderId?: string;
  campaignId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ success: boolean; data?: RewardTransaction[]; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    let txnQuery = supabaseAdmin
      .from("reward_transactions")
      .select(
        "id, rider_id, campaign_id, route_tracking_id, points_earned, source, metadata, created_at",
      )
      .order("created_at", { ascending: false });

    if (filters?.riderId) {
      txnQuery = txnQuery.eq("rider_id", filters.riderId);
    }

    if (filters?.campaignId) {
      txnQuery = txnQuery.eq("campaign_id", filters.campaignId);
    }

    if (filters?.startDate) {
      txnQuery = txnQuery.gte("created_at", filters.startDate);
    }

    if (filters?.endDate) {
      txnQuery = txnQuery.lte("created_at", filters.endDate);
    }

    const { data: transactions, error: txnError } = await txnQuery;

    if (txnError) {
      return { success: false, error: txnError.message };
    }

    let redemptionQuery = supabaseAdmin
      .from("reward_redemptions")
      .select("id, rider_id, points_spent, status, requested_at")
      .order("requested_at", { ascending: false });

    if (filters?.riderId) {
      redemptionQuery = redemptionQuery.eq("rider_id", filters.riderId);
    }

    if (filters?.startDate) {
      redemptionQuery = redemptionQuery.gte("requested_at", filters.startDate);
    }

    if (filters?.endDate) {
      redemptionQuery = redemptionQuery.lte("requested_at", filters.endDate);
    }

    const { data: redemptions, error: redemptionError } = await redemptionQuery;

    if (redemptionError) {
      return { success: false, error: redemptionError.message };
    }

    const balanceByRider = new Map<string, number>();
    const { data: balances } = await supabaseAdmin
      .from("rider_reward_balance")
      .select("rider_id, points_balance");

    (balances ?? []).forEach((balance) => {
      balanceByRider.set(balance.rider_id, Number(balance.points_balance ?? 0));
    });

    const mappedTransactions = (transactions ?? []).map((txn) => {
      const direction = txn.metadata?.adjustment_direction as
        | string
        | undefined;
      const isDebit = direction === "debit";
      const points = Number(txn.points_earned ?? 0) * (isDebit ? -1 : 1);
      const type = txn.source === "adjustment" ? "adjusted" : "awarded";

      return {
        id: txn.id,
        riderId: txn.rider_id,
        campaignId: txn.campaign_id ?? undefined,
        routeId: txn.route_tracking_id ?? undefined,
        type,
        points,
        description: txn.metadata?.description ?? undefined,
        balanceAfter: balanceByRider.get(txn.rider_id) ?? 0,
        createdAt: txn.created_at ?? new Date().toISOString(),
        createdBy: txn.metadata?.created_by ?? undefined,
      } as RewardTransaction;
    });

    const mappedRedemptions = (redemptions ?? []).map((redemption) => ({
      id: redemption.id,
      riderId: redemption.rider_id,
      campaignId: undefined,
      routeId: undefined,
      type: "redeemed",
      points: -Math.abs(Number(redemption.points_spent ?? 0)),
      description: `Redemption (${redemption.status ?? "requested"})`,
      balanceAfter: balanceByRider.get(redemption.rider_id) ?? 0,
      createdAt: redemption.requested_at ?? new Date().toISOString(),
      createdBy: undefined,
    })) as RewardTransaction[];

    const merged = [...mappedTransactions, ...mappedRedemptions];

    const filtered = filters?.type
      ? merged.filter((txn) => txn.type === filters.type)
      : merged;

    return {
      success: true,
      data: filtered.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    };
  } catch (error) {
    console.error("Error fetching reward transactions:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch reward transactions",
    };
  }
}

/**
 * Server action to get rider balances
 */
export async function getRiderBalances(): Promise<{
  success: boolean;
  data?: RiderBalance[];
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: balances, error } = await supabaseAdmin
      .from("rider_reward_balance")
      .select("rider_id, points_balance, lifetime_points_earned, updated_at");

    if (error) {
      return { success: false, error: error.message };
    }

    const riderIds = (balances ?? []).map((b) => b.rider_id);

    const { data: riders } = riderIds.length
      ? await supabaseAdmin
          .from("rider")
          .select("id, user_id")
          .in("id", riderIds)
      : { data: [] };

    const userIds = (riders ?? []).map((r) => r.user_id);

    const { data: users } = userIds.length
      ? await supabaseAdmin
          .from("user")
          .select("id, name, email")
          .in("id", userIds)
      : { data: [] };

    const userById = new Map((users ?? []).map((u) => [u.id, u]));
    const riderToUser = new Map((riders ?? []).map((r) => [r.id, r.user_id]));

    const { data: redemptions } = riderIds.length
      ? await supabaseAdmin
          .from("reward_redemptions")
          .select("rider_id, points_spent, requested_at")
          .in("rider_id", riderIds)
      : { data: [] };

    const redeemedByRider = new Map<string, number>();
    const lastRedemptionByRider = new Map<string, string>();
    (redemptions ?? []).forEach((redemption) => {
      const current = redeemedByRider.get(redemption.rider_id) ?? 0;
      redeemedByRider.set(
        redemption.rider_id,
        current + Number(redemption.points_spent ?? 0),
      );
      if (redemption.requested_at) {
        const existing = lastRedemptionByRider.get(redemption.rider_id);
        if (
          !existing ||
          new Date(redemption.requested_at) > new Date(existing)
        ) {
          lastRedemptionByRider.set(
            redemption.rider_id,
            redemption.requested_at,
          );
        }
      }
    });

    const { data: transactions } = riderIds.length
      ? await supabaseAdmin
          .from("reward_transactions")
          .select("rider_id, created_at")
          .in("rider_id", riderIds)
      : { data: [] };

    const lastTxnByRider = new Map<string, string>();
    (transactions ?? []).forEach((txn) => {
      if (!txn.created_at) return;
      const existing = lastTxnByRider.get(txn.rider_id);
      if (!existing || new Date(txn.created_at) > new Date(existing)) {
        lastTxnByRider.set(txn.rider_id, txn.created_at);
      }
    });

    const mapped = (balances ?? []).map((balance) => {
      const userId = riderToUser.get(balance.rider_id);
      const user = userId ? userById.get(userId) : null;
      const lastTxn = lastTxnByRider.get(balance.rider_id);
      const lastRedemption = lastRedemptionByRider.get(balance.rider_id);
      const lastTransactionDate =
        lastTxn && lastRedemption
          ? new Date(lastTxn) > new Date(lastRedemption)
            ? lastTxn
            : lastRedemption
          : (lastTxn ?? lastRedemption ?? balance.updated_at ?? undefined);

      return {
        riderId: balance.rider_id,
        riderName: user?.name ?? "Unknown Rider",
        riderEmail: user?.email ?? "",
        totalPointsAwarded: Number(balance.lifetime_points_earned ?? 0),
        totalPointsRedeemed: redeemedByRider.get(balance.rider_id) ?? 0,
        currentBalance: Number(balance.points_balance ?? 0),
        lastTransactionDate,
      } as RiderBalance;
    });

    return { success: true, data: mapped };
  } catch (error) {
    console.error("Error fetching rider balances:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch rider balances",
    };
  }
}

/**
 * Server action to adjust rider points
 */
export async function adjustRiderPoints(
  data: z.infer<typeof adjustPointsSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = adjustPointsSchema.parse(data);

    const { data: balance, error: balanceError } = await supabaseAdmin
      .from("rider_reward_balance")
      .select("rider_id, points_balance, lifetime_points_earned")
      .eq("rider_id", validatedData.riderId)
      .single();

    if (balanceError || !balance) {
      return {
        success: false,
        error: balanceError?.message || "Rider balance not found",
      };
    }

    const currentBalance = Number(balance.points_balance ?? 0);
    const rawPoints = Number(validatedData.points ?? 0);
    const absPoints = Math.abs(rawPoints);
    const isRedeem = validatedData.type === "redeemed";
    const delta = isRedeem ? -absPoints : rawPoints;
    const isDebit = delta < 0;
    const newBalance = currentBalance + delta;

    if (newBalance < 0) {
      return {
        success: false,
        error: "Insufficient balance for adjustment",
      };
    }

    if (validatedData.type === "redeemed") {
      const { error: redemptionError } = await supabaseAdmin
        .from("reward_redemptions")
        .insert({
          rider_id: validatedData.riderId,
          points_spent: absPoints,
          status: "approved",
          requested_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
          metadata: {
            description: validatedData.description ?? "Manual redemption",
          },
        });

      if (redemptionError) {
        return { success: false, error: redemptionError.message };
      }
    } else {
      const source = validatedData.type === "awarded" ? "bonus" : "adjustment";

      const { error: txnError } = await supabaseAdmin
        .from("reward_transactions")
        .insert({
          rider_id: validatedData.riderId,
          points_earned: absPoints,
          source,
          metadata: {
            description: validatedData.description ?? "Manual adjustment",
            adjustment_direction: isDebit ? "debit" : "credit",
          },
          created_at: new Date().toISOString(),
        });

      if (txnError) {
        return { success: false, error: txnError.message };
      }
    }

    const updatedLifetime =
      Number(balance.lifetime_points_earned ?? 0) + (isDebit ? 0 : absPoints);

    const { error: balanceUpdateError } = await supabaseAdmin
      .from("rider_reward_balance")
      .update({
        points_balance: newBalance,
        lifetime_points_earned: updatedLifetime,
        updated_at: new Date().toISOString(),
      })
      .eq("rider_id", validatedData.riderId);

    if (balanceUpdateError) {
      return { success: false, error: balanceUpdateError.message };
    }

    revalidatePath("/rewards");
    return { success: true };
  } catch (error) {
    console.error("Error adjusting rider points:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to adjust rider points",
    };
  }
}

/**
 * Server action to export reward transactions
 */
export async function exportRewardTransactions(filters?: {
  riderId?: string;
  campaignId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const result = await getRewardTransactions(filters);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  } catch (error) {
    console.error("Error exporting reward transactions:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to export reward transactions",
    };
  }
}
