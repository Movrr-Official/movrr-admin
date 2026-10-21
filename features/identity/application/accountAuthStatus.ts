import type { SupabaseClient } from "@supabase/supabase-js";
/** SQL status is authoritative immediately. Auth synchronization has a durable
 * versioned receipt and can be retried without replaying a stale status command. */
export async function synchronizeAccountAuthStatus(client: SupabaseClient, actor: string, user: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await client.rpc("account_auth_sync_state", { p_actor: actor, p_user: user, p_version: null, p_ack: false });
    if (snapshot.error) throw new Error(snapshot.error.message);
    const receipt = snapshot.data as { version: number; status: string; state: string };
    if (receipt.state === "applied") return;
    const auth = await client.auth.admin.updateUserById(user, { ban_duration: receipt.status === "active" ? "none" : "876000h" });
    if (auth.error) throw new Error(`Account status saved; Auth synchronization remains pending: ${auth.error.message}`);
    const ack = await client.rpc("account_auth_sync_state", { p_actor: actor, p_user: user, p_version: receipt.version, p_ack: true });
    if (!ack.error) return;
  }
  throw new Error("Account status saved; concurrent changes require Auth synchronization retry");
}
