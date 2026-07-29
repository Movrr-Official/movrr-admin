import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  IdempotencyKeyRef,
  IdempotencyStore,
} from "@/features/fraud/application/contracts/FraudPolicyEngine";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createSupabaseIdempotencyStore(): IdempotencyStore {
  return {
    async get(key: IdempotencyKeyRef): Promise<unknown | null> {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("platform_idempotency_key")
        .select("payload")
        .eq("principal_id", key.principalId)
        .eq("scope", key.scope)
        .eq("key", key.key)
        .maybeSingle();
      throwOnError(error, "idempotency.get");
      return data ? data.payload : null;
    },

    async put(key: IdempotencyKeyRef, payload: unknown): Promise<void> {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("platform_idempotency_key").upsert(
        {
          principal_id: key.principalId,
          scope: key.scope,
          key: key.key,
          payload: payload as object,
        },
        { onConflict: "principal_id,scope,key" },
      );
      throwOnError(error, "idempotency.put");
    },
  };
}
