import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** No scheduler/route activates this worker. Canonical privacy rules must approve
 * all categories, fields and the receipt lifetime before SQL can prepare work. */
export async function disposeCommunitySafetyCase(operation: string, caseId: string, policy: number) {
  const db = createSupabaseAdminClient();
  const prepared = await db.rpc("dispose_community_safety", { p_operation: operation, p_case: caseId, p_policy: policy });
  if (prepared.error) throw new Error("Safety disposal requires approved policy or lifecycle review");
  const state = prepared.data?.state;
  if (state) return { state };
  const claimed = await db.rpc("claim_community_cover_disposal", { p_operation: operation });
  if (claimed.error) throw new Error("Safety disposal claim unavailable");
  let pending = 0;
  for (const path of claimed.data ?? []) {
    // An uncertain Storage response is not confirmation. The durable lease
    // expires; the next invocation rechecks references and retries the same task.
    const removed = await db.storage.from("community-rides").remove([path]);
    if (removed.error) { pending++; continue; }
    const confirmed = await db.rpc("confirm_community_cover_disposal", { p_operation: operation, p_path: path });
    if (confirmed.error) pending++;
  }
  const status = await db.rpc("community_safety_disposal_status", { p_operation: operation });
  if (status.error) throw new Error("Safety disposal confirmation unavailable");
  return { state: pending || status.data?.remaining ? "pending" : "confirmed", counts: prepared.data };
}
