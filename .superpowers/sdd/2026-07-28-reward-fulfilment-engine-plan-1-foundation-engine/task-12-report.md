# Task 12 Report: Scheduled fulfilment jobs (expire / release / retry)

**Status:** DONE_WITH_CONCERNS  
**Branch:** `feat/fulfilment-engine-plan-1`  
**Commit:** `1a655c2`

---

## Summary

Added Platform-client scheduled jobs for fulfilment expiry, stale reservation release, and a Phase-1 retry stub:

- Jobs call `FulfilmentEngine.expire` / `cancel` (handlers + SM) — never assign `fulfilment.state` or run SQL updates
- Idempotent expire: already-`expired` is a no-op; second job run expires 0
- Internal auth via `x-internal-job-secret` (also Bearer `INTERNAL_JOB_SECRET` / `CRON_SECRET` / `MAINTENANCE_JOB_TOKEN`)
- Vercel cron entries for expire/release/retry; proxy exempts `/api/v1/internal/`

---

## TDD workflow

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Wrote `__tests__/features/fulfilment/jobs.idempotent.test.ts` | FAIL — modules missing |
| 2 | Implemented engine expire/get/list, handler expire, commands, routes, auth | Minimal green |
| 3 | Fixed source-scan false positive (`state ===` vs assignment) | PASS — 5/5 |
| 4 | Re-ran related fulfilment tests + typecheck | PASS; typecheck clean |
| 5 | Committed | see Commit |

---

## Files created

| File | Purpose |
|------|---------|
| `features/fulfilment/application/commands/expireFulfilments.ts` | Scan past `expires_at` → `engine.expire` |
| `features/fulfilment/application/commands/releaseStaleReservations.ts` | Cancel stale reservation-holding fulfilments via engine |
| `features/fulfilment/application/commands/retryTransientInfrastructure.ts` | Phase-1 no-op (`retried: 0`) |
| `features/fulfilment/infrastructure/composeFulfilmentJobs.ts` | In-memory job engine singleton for routes |
| `lib/internalJobAuth.ts` | Shared-secret / Bearer auth for job routes |
| `app/api/v1/internal/jobs/fulfilment-expire/route.ts` | Cron trigger |
| `app/api/v1/internal/jobs/fulfilment-release/route.ts` | Cron trigger |
| `app/api/v1/internal/jobs/fulfilment-retry/route.ts` | Cron trigger |
| `__tests__/features/fulfilment/jobs.idempotent.test.ts` | Idempotency + auth + no direct state writes |

## Files modified

| File | Change |
|------|--------|
| `FulfilmentEngine.ts` | `get`, `list`, idempotent `expire` |
| `FulfilmentHandler.ts` | optional `expire` |
| Instant / QR handlers | `expire` releases allocation → SM `expired` |
| `vercel.json` | expire / release / retry crons |
| `proxy.ts` | exempt `/api/v1/internal/` |
| `lib/env.ts` / `.env.example` | `INTERNAL_JOB_SECRET` |

---

## Test summary

`npx vitest run __tests__/features/fulfilment/jobs.idempotent.test.ts` — **5 passed**

Also green: `engine.test.ts`, `handlers.test.ts`

`npm run typecheck` — clean

---

## Commit

```
1a655c2 feat(fulfilment): add idempotent scheduled expiry and reservation release jobs
```

---

## Concerns

1. **Job engine is a separate in-memory singleton** — cron routes do not yet share the production redeem/API engine store; live expire/release will no-op until a shared SQL-backed store (or Task 13 composition) wires the same aggregate.
2. **`retryTransientInfrastructure` is a stub** — no infra-failure marker queue yet; route exists for cron wiring only.
3. **Expire does not auto-refund** — matches cancel (explicit `refund` / policy later); design “expire → refund per policy” not automated in this job.
4. **Release scan without `candidateIds`** requires `expiresAt` on reservation-holding states — orphaned reservations with null expiry are not auto-detected.
