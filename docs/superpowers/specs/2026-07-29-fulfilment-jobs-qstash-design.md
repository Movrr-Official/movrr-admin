# Fulfilment Job Scheduling — Move Off Vercel Cron (QStash)

**Date:** 2026-07-29  
**Status:** Implemented (code landed; operator must set QStash env + upsert schedules)  
**Repos:** `movrr-admin`  
**Type:** Operational infra — scheduler relocation  
**Driver:** Vercel Hobby blocks sub-daily crons; production deploys fail with cron pricing link (`vercel.link/3Fpeeb1`)  
**Supersedes:** earlier draft that proposed GitHub Actions schedules

---

## 1. Problem

`vercel.json` currently registers:

| Path | Schedule |
|------|----------|
| `/api/internal/privacy-retention` | `0 3 * * *` (daily — Hobby OK) |
| `/api/v1/internal/jobs/fulfilment-expire` | `*/15 * * * *` |
| `/api/v1/internal/jobs/fulfilment-release` | `*/15 * * * *` |
| `/api/v1/internal/jobs/fulfilment-retry` | `*/30 * * * *` |

Hobby plans allow cron jobs that run **at most once per day**. Sub-daily expressions fail the Vercel deployment. GitHub CI still passes; production never updates.

---

## 2. Decision

**Move frequent Fulfilment jobs to Upstash QStash schedules.**  
Keep daily privacy retention on Vercel Cron.

Chosen over GitHub Actions because:

- Purpose-built HTTP cron with retries and delivery observability
- Stack already uses Upstash Redis REST optionally for rate limits (same vendor; QStash is a separate product/token)
- Avoids Actions cron skew and repo-secret coupling to production URL for every schedule tick

---

## 3. Design

### 3.1 `vercel.json`

Retain only:

```json
{
  "crons": [
    {
      "path": "/api/internal/privacy-retention",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Remove the three fulfilment cron entries. This unblocks Hobby deploys immediately once shipped.

### 3.2 Auth: accept QStash signatures on job routes

Existing helper `isAuthorizedInternalJobRequest` already accepts:

- `x-internal-job-secret`
- `Authorization: Bearer …`

Extend it (or a thin wrapper used by the three fulfilment job routes) to also accept a valid **`Upstash-Signature`** when QStash signing keys are configured:

| Env (Vercel) | Purpose |
|--------------|---------|
| `QSTASH_CURRENT_SIGNING_KEY` | Verify inbound QStash deliveries |
| `QSTASH_NEXT_SIGNING_KEY` | Key rotation window |
| `INTERNAL_JOB_SECRET` / `CRON_SECRET` / `MAINTENANCE_JOB_TOKEN` | Keep for manual curl / emergency runs |

Use `@upstash/qstash` `Receiver` (official) — no hand-rolled JWT crypto.

**Do not** require forwarding `INTERNAL_JOB_SECRET` from QStash if signature verify succeeds. Manual ops can still use the shared secret.

Privacy-retention route stays on its existing maintenance auth path (unchanged).

### 3.3 Schedules (provisioned in QStash, not Vercel)

Three schedules, UTC:

| Schedule ID (stable) | Cron | Destination |
|----------------------|------|-------------|
| `fulfilment-expire` | `*/15 * * * *` | `{ADMIN_APP_URL}/api/v1/internal/jobs/fulfilment-expire` |
| `fulfilment-release` | `*/15 * * * *` | `{ADMIN_APP_URL}/api/v1/internal/jobs/fulfilment-release` |
| `fulfilment-retry` | `*/30 * * * *` | `{ADMIN_APP_URL}/api/v1/internal/jobs/fulfilment-retry` |

Method: `POST`. Empty JSON body is fine.

**Provisioning:** one-shot operator script / documented curl using `QSTASH_TOKEN`, with **fixed schedule IDs** so re-runs upsert instead of duplicating. Not created on every app boot (avoids side effects in serverless).

Add `scripts/qstash-upsert-fulfilment-schedules.mjs` (or `.ts` via existing tooling) that:

1. Reads `QSTASH_TOKEN` + `ADMIN_APP_URL` from env
2. Upserts the three schedules by id
3. Prints schedule ids / next-run confirmation

### 3.4 Env / secrets

| Where | Vars |
|-------|------|
| Vercel (runtime) | `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, existing job secret fallbacks |
| Operator machine / CI one-shot | `QSTASH_TOKEN`, `ADMIN_APP_URL` |

Optional: also store `QSTASH_TOKEN` in Vercel only if we later add in-app schedule management — **not required** for v1.

Wire optional vars into `lib/env.ts` as optional strings (same pattern as `UPSTASH_REDIS_*`).

### 3.5 Docs

- `SECURITY.md` — Fulfilment jobs via QStash; signature verification; privacy retention remains Vercel daily cron
- `OPERATIONS.md` — how to upsert schedules, rotate signing keys, triage failed deliveries in Upstash console

### 3.6 Out of scope

- Changing job business logic, batch sizes, or intervals from 15/30
- Upgrading Vercel plan
- Moving privacy retention off Vercel
- GitHub Actions scheduled workflows
- In-app UI to manage QStash schedules

---

## 4. Success criteria

1. Push to `main` produces a successful **Vercel** production deployment (Hobby-compatible `vercel.json`).
2. Job routes accept valid QStash signatures (and still accept internal job secret).
3. Three QStash schedules exist and POST expire/release (~15m) and retry (~30m).
4. Docs describe QStash provisioning + verification.

---

## 5. Rollout

1. Ship code: trim `vercel.json`, QStash verify path, env wiring, upsert script, docs.
2. Set Vercel env: `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.
3. Run upsert script once against production `ADMIN_APP_URL` with `QSTASH_TOKEN`.
4. Trigger a manual QStash publish (or wait one interval) and confirm 200s + job metrics.
5. Confirm Vercel deploy for the code commit succeeded.
