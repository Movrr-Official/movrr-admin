import { fail, ok } from "@/lib/result/ApplicationResult";
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  RedemptionRepository,
  RewardRedemption,
} from "@/features/rewards/application/contracts/RedeemRewardCommand";
import type { RedemptionListPort } from "@/features/rewards/application/queries/catalogAndRedemptions";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function mapRedemptionRow(data: {
  id: string;
  rider_id: string;
  reward_id: string | null;
  points_spent: number | null;
  requested_at: string;
  metadata: unknown;
  status: string;
  reward_title: string | null;
  reward_catalog:
    | { thumbnail_url: string | null }
    | { thumbnail_url: string | null }[]
    | null;
}): RewardRedemption {
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(data.id),
    riderId: String(data.rider_id),
    catalogItemId: String(data.reward_id ?? ""),
    pointsSpent: Number(data.points_spent ?? 0),
    status: "committed",
    redemptionStatus: data.status,
    rewardTitle: data.reward_title,
    thumbnailUrl:
      (Array.isArray(data.reward_catalog)
        ? data.reward_catalog[0]
        : data.reward_catalog
      )?.thumbnail_url ?? null,
    fulfilmentId: String(meta.fulfilment_id ?? ""),
    idempotencyKey: String(meta.idempotency_key ?? ""),
    ledgerTransactionId: String(meta.ledger_transaction_id ?? ""),
    createdAt: String(data.requested_at),
  };
}

export function createSupabaseRedemptionRepository(): RedemptionRepository &
  RedemptionListPort {
  return {
    async commit(input) {
      const { data, error } = await createSupabaseAdminClient().rpc(
        "wallet_settle_debit",
        {
          p_rider_id: input.riderId,
          p_catalog_item_id: input.catalogItemId,
          p_operation_id: input.operationId,
          p_actor_id: input.actorId,
          p_correlation_id: input.correlationId,
        },
      );
      if (error)
        return fail(
          error.code === "22023"
            ? "BusinessFailure"
            : error.code === "42501"
              ? "permission_denied"
              : "InfrastructureFailure",
          error.message,
        );
      if (!data?.redemption?.ledgerTransactionId)
        return fail(
          "InfrastructureFailure",
          "Missing committed redemption receipt",
        );
      return ok(data.redemption as RewardRedemption);
    },

    async findById(id) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("reward_redemptions")
        .select(
          "id, rider_id, reward_id, points_spent, status, requested_at, metadata, reward_title, reward_catalog:reward_id(thumbnail_url)",
        )
        .eq("id", id)
        .maybeSingle();
      throwOnError(error, "redemption.findById");
      if (!data) return null;
      return mapRedemptionRow(data);
    },

    async listByRider(riderId) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("reward_redemptions")
        .select(
          "id, rider_id, reward_id, points_spent, status, requested_at, metadata, reward_title, reward_catalog:reward_id(thumbnail_url)",
        )
        .eq("rider_id", riderId)
        .order("requested_at", { ascending: false });
      throwOnError(error, "redemption.listByRider");
      return (data ?? []).map(mapRedemptionRow);
    },
  };
}
