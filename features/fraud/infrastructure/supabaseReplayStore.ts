import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { ReplayStore } from "@/features/fraud/application/contracts/FraudPolicyEngine";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createSupabaseReplayStore(): ReplayStore {
  return {
    async consume(jti: string): Promise<boolean> {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("platform_consumed_jti").insert({
        jti,
      });
      if (error) {
        if (error.code === "23505") return false;
        throwOnError(error, "replay.consume");
      }
      return true;
    },
    async isConsumed(jti: string): Promise<boolean> {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("platform_consumed_jti")
        .select("jti")
        .eq("jti", jti)
        .maybeSingle();
      throwOnError(error, "replay.isConsumed");
      return Boolean(data);
    },
  };
}
