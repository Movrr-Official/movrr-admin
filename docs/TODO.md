# Movrr Admin TODOs

## Platform Hardening

- [ ] Replace process-local in-memory API rate limiting with a distributed backend (Redis/Upstash/Postgres-backed counters) so limits are globally consistent across multiple app instances.
  - Current state: `lib/rateLimit.ts` uses an in-memory `Map` on each process.
  - Target state: shared rate limit store with atomic increment + TTL.
  - Scope: `app/api/health` and `app/api/optimize/*` routes.
