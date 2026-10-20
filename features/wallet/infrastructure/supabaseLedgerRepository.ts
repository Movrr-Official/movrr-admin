import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  LedgerEntry,
  LedgerRepository,
} from "@/features/wallet/application/contracts/WalletReadPort";
import { z } from "zod";
const position = z.object({
  at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  asOf: z.string().datetime({ offset: true }),
});
export function mapLedgerEntry(row: {
  id: string;
  rider_id: string;
  points_earned: number;
  source: string;
  metadata: unknown;
  created_at: string;
}): LedgerEntry {
  const m = (row.metadata ?? {}) as Record<string, unknown>;
  const points = Number(row.points_earned);
  if (!Number.isSafeInteger(points)) throw new Error("Invalid ledger amount");
  const category =
    m.settlement_kind === "compensating_refund" || m.transaction_type === "refund"
      ? "refund"
      : m.settlement_kind === "reward_redemption" ||
          (m.redemption_id && points < 0) ||
          row.source === "redemption"
        ? "redemption"
        : (["campaign", "campaign_ride", "boosted_ride", "ad_boost"].includes(row.source) || (row.source === "bonus" && typeof m.campaignId === "string"))
          ? "campaign"
          : ["route", "standard_ride", "standard_ride_bonus", "free_ride_bonus", "bonus"].includes(
                row.source,
              )
            ? "route"
            : row.source === "adjustment"
              ? "adjustment"
              : "other";
  return {
    id: row.id,
    riderId: row.rider_id,
    points,
    source: row.source,
    category,
    description:
      typeof m.description === "string"
        ? m.description
        : typeof m.reason === "string"
          ? m.reason
          : category === "refund"
            ? "Reward refunded"
            : category === "redemption"
              ? "Reward redeemed"
              : "MOVRR Points activity",
    createdAt: row.created_at,
  };
}
export function createSupabaseLedgerRepository(): LedgerRepository {
  return {
    async getBalance(riderId) {
      const { data, error } = await createSupabaseAdminClient().rpc(
        "read_rider_wallet_snapshot",
        { p_rider: riderId },
      );
      if (error || !data) throw new Error("Wallet balance unavailable");
      return data;
    },
    async listEntries(riderId, input = {}) {
      const limit = z
        .number()
        .int()
        .min(1)
        .max(200)
        .parse(input.limit ?? 100);
      const cursor = input.cursor
        ? position.parse(
            JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
          )
        : null;
      const asOf =
        cursor?.asOf ??
        z
          .string()
          .datetime({ offset: true })
          .parse(input.asOf ?? new Date().toISOString());
      if (input.asOf && cursor && input.asOf !== cursor.asOf)
        throw new Error("Statement snapshot changed");
      let query = createSupabaseAdminClient()
        .from("reward_transactions")
        .select("id,rider_id,points_earned,source,metadata,created_at")
        .eq("rider_id", riderId)
        .lte("created_at", asOf)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);
      if (cursor)
        query = query.or(
          `created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`,
        );
      const { data, error } = await query;
      if (error) throw new Error("Wallet statement unavailable");
      const rows = (data ?? []).slice(0, limit);
      const last = rows.at(-1);
      return {
        entries: rows.map(mapLedgerEntry),
        asOf,
        nextCursor:
          (data?.length ?? 0) > limit && last
            ? Buffer.from(
                JSON.stringify({ at: last.created_at, id: last.id, asOf }),
              ).toString("base64url")
            : null,
      };
    },
  };
}
