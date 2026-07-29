# Fulfilment Job Scheduling — Move Off Vercel Cron

**Date:** 2026-07-29  
**Status:** Approved design (pending implementation)  
**Repos:** `movrr-admin`  
**Type:** Operational infra — scheduler relocation  
**Driver:** Vercel Hobby blocks sub-daily crons; production deploys fail with cron pricing link (`vercel.link/3Fpeeb1`)

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

**Move frequent Fulfilment jobs to GitHub Actions scheduled workflows.**  
Keep daily privacy retention on Vercel Cron.

Chosen over Cloudflare Workers / external cron because Actions already exist in-repo, auth is Bearer/`x-internal-job-secret` compatible, and no new runtime is required.

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

Remove the three fulfilment cron entries.

### 3.2 New workflow: `.github/workflows/fulfilment-jobs.yml`

- **Triggers**
  - `schedule`:
    - every 15 minutes → POST expire + POST release
    - every 30 minutes → POST retry (same workflow can run all three every 15m and only call retry when `minute % 30 == 0`, **or** use two cron expressions / two jobs)
  - `workflow_dispatch` for manual ops runs
- **Steps:** `curl -fsS -X POST` each job URL with:
  - `Authorization: Bearer ${{ secrets.INTERNAL_JOB_SECRET }}`
  - Prefer also `x-internal-job-secret` matching existing `isAuthorizedInternalJobRequest`
- **Base URL:** `${{ secrets.ADMIN_APP_URL }}` (no trailing slash)
- **Failure:** non-2xx fails the job so Actions surfaces red runs
- **Concurrency:** `concurrency: fulfilment-jobs` with `cancel-in-progress: false` so overlapping schedules queue rather than cancel mid-flight

Recommended concrete schedule (GitHub Actions cron is UTC, ~± few minutes skew):

```yaml
on:
  schedule:
    - cron: "*/15 * * * *"   # expire + release always; retry when minute is 0 or 30
  workflow_dispatch:
```

Single job implementation keeps secrets/config in one place.

### 3.3 Secrets (GitHub Actions repo secrets)

| Secret | Purpose |
|--------|---------|
| `INTERNAL_JOB_SECRET` | Same value as Vercel `INTERNAL_JOB_SECRET` (or `CRON_SECRET` / `MAINTENANCE_JOB_TOKEN` fallback chain already in code) |
| `ADMIN_APP_URL` | Production admin origin, e.g. `https://admin.example.com` |

No new app code auth paths. Existing routes stay authoritative.

### 3.4 Docs

- `SECURITY.md` — Fulfilment jobs scheduled by GitHub Actions; privacy retention remains Vercel daily cron; document required Actions secrets.
- `OPERATIONS.md` — how to trigger `workflow_dispatch`, expected intervals, failure triage.

### 3.5 Out of scope

- Changing job business logic, batch sizes, or intervals from 15/30
- Upgrading Vercel plan
- Moving privacy retention off Vercel
- Platform API / engine changes

---

## 4. Success criteria

1. Push to `main` produces a successful **Vercel** production deployment.
2. GitHub Actions `fulfilment-jobs` workflow exists and can be run via `workflow_dispatch`.
3. Scheduled POSTs hit expire/release every ~15m and retry every ~30m with authorized secret.
4. Docs reflect the split scheduler model.

---

## 5. Rollout

1. Land workflow + `vercel.json` trim + docs on `main`.
2. Operator sets `INTERNAL_JOB_SECRET` and `ADMIN_APP_URL` in GitHub repo secrets (must match Vercel).
3. Manually dispatch workflow once to verify 200s before relying on schedule.
4. Confirm Vercel deploy for the same commit succeeds.
