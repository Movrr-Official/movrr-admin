import type { RateLimitStore } from "@/features/fraud/application/contracts/FraudPolicyEngine";

export type RateLimitStoreOptions = {
  max: number;
  windowMs: number;
};

type Entry = { count: number; resetAt: number };

/** In-memory fixed-window rate limiter for fraud policy evaluation. */
export function createInMemoryRateLimitStore(
  options: RateLimitStoreOptions = { max: 60, windowMs: 60_000 },
): RateLimitStore {
  const entries = new Map<string, Entry>();

  return {
    async hit(key: string): Promise<boolean> {
      const now = Date.now();
      const existing = entries.get(key);

      if (!existing || now >= existing.resetAt) {
        entries.set(key, { count: 1, resetAt: now + options.windowMs });
        return true;
      }

      if (existing.count >= options.max) {
        return false;
      }

      existing.count += 1;
      return true;
    },
  };
}
