import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import type {
  LedgerEntry,
  LedgerRepository,
} from "@/features/wallet/application/contracts/WalletReadPort";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

/**
 * Read-only projection of rider_reward_balance and reward_transactions.
 */
export function createSupabaseLedgerRepository(): LedgerRepository {
  return {
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
            meta.settlement_kind === "compensating_refund"
              ? ("fulfilment" as const)
              : ("redemption" as const),
          referenceId: String(
            meta.fulfilment_id ?? meta.redemption_id ?? row.id,
          ),
          reason: typeof meta.reason === "string" ? meta.reason : undefined,
          correlationId: String(meta.correlation_id ?? ""),
          createdAt: String(row.created_at),
        };
      });
    },
  };
}
