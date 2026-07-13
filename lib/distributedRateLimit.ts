import { checkRateLimit, type RateLimitResult } from "@/lib/rateLimit";
import { UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from "@/lib/env";

type DistributedRateLimitConfig = {
  max: number;
  windowMs: number;
};

/**
 * Rate limit with optional Upstash Redis (shared across serverless instances).
 * Falls back to in-memory limiter when Upstash is not configured.
 */
export async function checkDistributedRateLimit(
  key: string,
  config: DistributedRateLimitConfig,
): Promise<RateLimitResult> {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return checkRateLimit(key, config);
  }

  try {
    const windowSec = Math.max(1, Math.ceil(config.windowMs / 1000));
    const redisKey = `ratelimit:${key}:${Math.floor(Date.now() / config.windowMs)}`;

    const incrRes = await fetch(
      `${UPSTASH_REDIS_REST_URL}/incr/${encodeURIComponent(redisKey)}`,
      {
        headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
        cache: "no-store",
      },
    );

    if (!incrRes.ok) {
      return checkRateLimit(key, config);
    }

    const incrBody = (await incrRes.json()) as { result?: number };
    const count = incrBody.result ?? 1;

    if (count === 1) {
      await fetch(
        `${UPSTASH_REDIS_REST_URL}/expire/${encodeURIComponent(redisKey)}/${windowSec}`,
        {
          headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
          cache: "no-store",
        },
      );
    }

    const allowed = count <= config.max;
    return {
      allowed,
      remaining: Math.max(0, config.max - count),
      retryAfterSeconds: windowSec,
    };
  } catch {
    return checkRateLimit(key, config);
  }
}
