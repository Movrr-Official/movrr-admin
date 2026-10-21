import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** Latest recorded authenticated activity. Null means no recorded activity;
 * errors mean unavailable. Neither state permits legacy timestamp substitution. */
export async function fetchAccountActivityMap(
  client: ReturnType<typeof createSupabaseAdminClient>, actorId: string, userIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let offset = 0; offset < userIds.length; offset += 500) {
    const ids = userIds.slice(offset, offset + 500);
    const { data, error } = await client.rpc("read_account_activity", { p_actor: actorId, p_users: ids });
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || data.length !== new Set(ids).size) throw new Error("Account activity projection incomplete");
    const returned = new Set<string>();
    for (const row of data) {
      if (!ids.includes(row.user_id) || returned.has(row.user_id)) throw new Error("Invalid account activity identity");
      returned.add(row.user_id);
      if (row.last_active_at === null) continue;
      const timestamp = Date.parse(row.last_active_at);
      if (!Number.isFinite(timestamp) || timestamp > Date.now()) throw new Error("Invalid account activity timestamp");
      result.set(row.user_id, new Date(timestamp).toISOString());
    }
  }
  return result;
}
