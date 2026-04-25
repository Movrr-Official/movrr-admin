"use server";

import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { DB_TABLES } from "@/lib/rewardConstants";
import {
  buildContractHealthReport,
  type ContractHealthReport,
  type RewardTransactionHealthRow,
} from "@/lib/contractDiagnostics";

/**
 * Queries recent reward_transactions and returns a contract health report.
 *
 * Checks:
 *   - % of transactions with a valid rideSessionId (session linkage)
 *   - % of transactions with verifiedMinutes (payout auditability)
 *   - % of transactions with basePoints (calculation chain)
 *   - Any unrecognized bonus types in bonusBreakdown entries
 *   - Any unrecognized transaction source values
 *
 * A healthy system returns healthScore = 100. Any score below 90 indicates
 * mobile has shipped a change that the admin contract layer hasn't caught up to.
 */
export async function getContractHealthReport(
  days = 7,
): Promise<
  | { success: true; data: ContractHealthReport }
  | { success: false; error: string }
> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabaseAdmin
      .from(DB_TABLES.REWARD_TRANSACTIONS)
      .select("id, source, metadata, created_at")
      .gte("created_at", since)
      .not("metadata", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return { success: false, error: error.message };
    }

    const rows: RewardTransactionHealthRow[] = (data ?? []).map((row) => ({
      id: String(row.id),
      source: row.source as string | null,
      metadata: row.metadata,
      createdAt: String(row.created_at),
    }));

    const report = buildContractHealthReport(rows, days);
    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
