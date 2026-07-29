import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  LedgerCreditInput,
  LedgerDebitInput,
  LedgerEntry,
  LedgerMutationResult,
  LedgerRepository,
} from "@/features/wallet/application/contracts/SettlementService";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

/**
 * Production ledger via wallet_settle_debit / wallet_settle_refund (042)
 * and rider_reward_balance / reward_transactions reads.
 */
export function createSupabaseLedgerRepository(): LedgerRepository {
  return {
    async debit(
      input: LedgerDebitInput,
    ): Promise<ApplicationResult<LedgerMutationResult>> {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase.rpc("wallet_settle_debit", {
        p_rider_id: input.riderId,
        p_points: input.points,
        p_redemption_id: input.redemptionId,
        p_correlation_id: input.correlationId,
      });
      throwOnError(error, "wallet_settle_debit");
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) {
        return fail(
          "BusinessFailure",
          (row?.error_message as string) ?? "Debit failed",
        );
      }
      return ok({
        transactionId: String(row.transaction_id),
        balanceAfter: Number(row.new_balance),
      });
    },

    async credit(
      input: LedgerCreditInput,
    ): Promise<ApplicationResult<LedgerMutationResult>> {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase.rpc("wallet_settle_refund", {
        p_rider_id: input.riderId,
        p_points: input.points,
        p_fulfilment_id: input.fulfilmentId,
        p_reason: input.reason,
        p_correlation_id: input.correlationId,
      });
      throwOnError(error, "wallet_settle_refund");
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) {
        return fail(
          "BusinessFailure",
          (row?.error_message as string) ?? "Refund failed",
        );
      }
      return ok({
        transactionId: String(row.transaction_id),
        balanceAfter: Number(row.new_balance),
      });
    },

    async getBalance(riderId: string): Promise<number> {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("rider_reward_balance")
        .select("points_balance")
        .eq("rider_id", riderId)
        .maybeSingle();
      throwOnError(error, "getBalance");
      return Number(data?.points_balance ?? 0);
    },

    async listEntries(riderId: string): Promise<LedgerEntry[]> {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("reward_transactions")
        .select("id, rider_id, points_earned, metadata, created_at")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false })
        .limit(100);
      throwOnError(error, "listEntries");
      return (data ?? []).map((row) => {
        const points = Number(row.points_earned ?? 0);
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          id: String(row.id),
          riderId: String(row.rider_id),
          points: Math.abs(points),
          direction: points < 0 ? ("debit" as const) : ("credit" as const),
          referenceType:
            meta.settlement_kind === "refund"
              ? ("fulfilment" as const)
              : ("redemption" as const),
          referenceId: String(
            meta.fulfilment_id ?? meta.redemption_id ?? row.id,
          ),
          reason:
            typeof meta.reason === "string" ? meta.reason : undefined,
          correlationId: String(meta.correlation_id ?? ""),
          createdAt: String(row.created_at),
        };
      });
    },
  };
}
