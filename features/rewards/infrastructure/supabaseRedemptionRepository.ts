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
    ledgerTransactionId: meta.ledger_transaction_id ? String(meta.ledger_transaction_id) : null,
    isFree: Number(data.points_spent ?? 0) === 0,
    createdAt: String(data.requested_at),
  };
}

export function createSupabaseRedemptionRepository(): RedemptionRepository &
  RedemptionListPort {
  async function withFinancial(row: RewardRedemption): Promise<RewardRedemption> {
    const { data, error } = await createSupabaseAdminClient().rpc("shop_redemption_financials", { p_id: row.id });
    throwOnError(error, "redemption.financial");
    if (!data) throw new Error("Redemption financial state unavailable");
    return { ...row, redemptionStatus: data.redemptionStatus, financial: data };
  }
  return {
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
      return withFinancial(mapRedemptionRow(data));
    },

    async listByRider(riderId) {
      const supabase = createSupabaseAdminClient();
      const result: RewardRedemption[] = [];
      for(let offset=0;;offset+=500){
        const {data,error}=await supabase.from("reward_redemptions")
         .select("id,rider_id,reward_id,points_spent,status,requested_at,metadata,reward_title,reward_catalog:reward_id(thumbnail_url)")
         .eq("rider_id",riderId).order("requested_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499);
        throwOnError(error,"redemption.listByRider");result.push(...(data??[]).map(mapRedemptionRow));
        if((data?.length??0)<500){
          const enriched: RewardRedemption[] = [];
          for(let i=0;i<result.length;i+=500) {
            const batch=result.slice(i,i+500);
            const {data,error}=await createSupabaseAdminClient().rpc("shop_redemption_financials_many",{p_ids:batch.map(row=>row.id)});
            throwOnError(error,"redemption.financials");
            for(const row of batch){if(!data?.[row.id])throw new Error("Redemption financial state unavailable");enriched.push({...row,redemptionStatus:data[row.id].redemptionStatus,financial:data[row.id]});}
          }
          return enriched;
        }
      }
    },
  };
}
