type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  max: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const RATE_LIMIT_STORE_KEY = "__movrr_admin_rate_limit_store__";

function getStore() {
  const globalState = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_KEY]?: Map<string, RateLimitEntry>;
  };

  if (!globalState[RATE_LIMIT_STORE_KEY]) {
    globalState[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitEntry>();
  }

  return globalState[RATE_LIMIT_STORE_KEY];
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  return "unknown";
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, config.max - 1),
      retryAfterSeconds: Math.ceil(config.windowMs / 1000),
    };
  }

  existing.count += 1;
  store.set(key, existing);

  const retryAfterMs = Math.max(0, existing.resetAt - now);
  return {
    allowed: existing.count <= config.max,
    remaining: Math.max(0, config.max - existing.count),
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
  };
}

