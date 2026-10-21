import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { externalAccountSchema } from "@/features/identity/domain/accountDomains";
import type { z } from "zod";

/** Database owns the intent and UUID; Auth is a separate recoverable boundary. */
export async function provisionExternalAccount(client: SupabaseClient, actor: string, raw: z.input<typeof externalAccountSchema>) {
  const input = externalAccountSchema.parse(raw);
  const command = async (phase: string) => {
    const { data, error } = await client.rpc("provision_external_account", { p_actor: actor, p_input: input, p_phase: phase });
    if (error) throw new Error(error.message);
    return data as { user_id: string; state: "reserved" | "ready" | "complete" };
  };
  let receipt = await command("reserve");
  if (receipt.state === "reserved") {
    const lookup = await client.auth.admin.getUserById(receipt.user_id);
    let identity = lookup.data?.user;
    if (!identity) {
      if (lookup.error && lookup.error.status !== 404) throw new Error(lookup.error.message);
      const created = await client.auth.admin.createUser({ id: receipt.user_id, email: input.email,
        password: randomBytes(32).toString("base64url"), email_confirm: input.isVerified,
        ban_duration: "876000h", user_metadata: { full_name: input.name },
        app_metadata: { external_account_provisioning_id: receipt.user_id } });
      identity = created.data?.user;
      if (!identity) {
        const recovered = await client.auth.admin.getUserById(receipt.user_id);
        identity = recovered.data?.user;
        if (!identity) throw new Error(created.error?.message || "Auth creation pending; retry the same request");
      }
    }
    if (identity.id !== receipt.user_id || identity.email?.toLowerCase() !== input.email ||
        identity.app_metadata?.external_account_provisioning_id !== receipt.user_id) throw new Error("Reserved identity ownership mismatch");
    receipt = await command("persist");
  }
  if (receipt.state === "ready") {
    if (input.status === "active") {
      const activated = await client.auth.admin.updateUserById(receipt.user_id, { ban_duration: "none" });
      if (activated.error) throw new Error(`Membership saved; Auth activation pending. Retry the same request: ${activated.error.message}`);
    }
    // A lost acknowledgement leaves a durable ready receipt. Never compensate
    // by deleting an identity or by creating a different product profile.
    await command("complete");
  }
  return { id: receipt.user_id, ...input };
}
