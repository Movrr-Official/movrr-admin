import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { RateLimitStore } from "@/features/fraud/application/contracts/FraudPolicyEngine";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

/**
 * Durable rate limit via atomic RPC platform_rate_limit_hit (046).
 * Falls back to upsert path only if RPC is missing (pre-046 DBs).
 */
export function createSupabaseRateLimitStore(options?: {
  max?: number;
  windowMs?: number;
}): RateLimitStore {
  const max = options?.max ?? 60;
  const windowMs = options?.windowMs ?? 60_000;

  return {
    async hit(key: string): Promise<boolean> {
      const supabase = createSupabaseAdminClient();
      const now = Date.now();
      const windowStart = new Date(
        Math.floor(now / windowMs) * windowMs,
      ).toISOString();

      const { data, error } = await supabase.rpc("platform_rate_limit_hit", {
        p_key: key,
        p_window_start: windowStart,
        p_max: max,
      });

      if (!error) {
        return Boolean(data);
      }

      // Fallback for environments that have not applied 046 yet.
      if (error.code === "PGRST202" || /platform_rate_limit_hit/i.test(error.message)) {
        const { data: existing, error: lookupError } = await supabase
          .from("platform_rate_limit_counter")
          .select("count")
          .eq("key", key)
          .eq("window_start", windowStart)
          .maybeSingle();
        throwOnError(lookupError, "rateLimit.lookup");

        const count = Number(existing?.count ?? 0);
        if (count >= max) return false;

        const { error: upsertError } = await supabase
          .from("platform_rate_limit_counter")
          .upsert(
            {
              key,
              window_start: windowStart,
              count: count + 1,
            },
            { onConflict: "key,window_start" },
          );
        throwOnError(upsertError, "rateLimit.hit");
        return true;
      }

      throwOnError(error, "rateLimit.hit");
      return false;
    },
  };
}
