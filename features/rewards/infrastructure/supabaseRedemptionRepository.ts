import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  RedemptionRepository,
  RewardRedemption,
} from "@/features/rewards/application/contracts/RedeemRewardCommand";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createSupabaseRedemptionRepository(): RedemptionRepository {
  return {
    async save(redemption) {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("reward_redemptions").upsert(
        {
          id: redemption.id,
          rider_id: redemption.riderId,
          reward_id: redemption.catalogItemId,
          points_spent: redemption.pointsSpent,
          status: "requested",
          requested_at: redemption.createdAt,
          metadata: {
            fulfilment_id: redemption.fulfilmentId,
            idempotency_key: redemption.idempotencyKey,
            ledger_transaction_id: redemption.ledgerTransactionId,
            platform_status: redemption.status,
          },
        },
        { onConflict: "id" },
      );
      throwOnError(error, "redemption.save");
    },

    async findById(id) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("reward_redemptions")
        .select(
          "id, rider_id, reward_id, points_spent, status, requested_at, metadata",
        )
        .eq("id", id)
        .maybeSingle();
      throwOnError(error, "redemption.findById");
      if (!data) return null;
      const meta = (data.metadata ?? {}) as Record<string, unknown>;
      const redemption: RewardRedemption = {
        id: String(data.id),
        riderId: String(data.rider_id),
        catalogItemId: String(data.reward_id ?? ""),
        pointsSpent: Number(data.points_spent ?? 0),
        status: "committed",
        fulfilmentId: String(meta.fulfilment_id ?? ""),
        idempotencyKey: String(meta.idempotency_key ?? ""),
        ledgerTransactionId: String(meta.ledger_transaction_id ?? ""),
        createdAt: String(data.requested_at),
      };
      return redemption;
    },
  };
}
