# Fulfilment Jobs via QStash — Implementation Plan

> **For agentic workers:** COMPLETE ALL TASKS. Spec: `docs/superpowers/specs/2026-07-29-fulfilment-jobs-qstash-design.md`

**Goal:** Remove sub-daily Vercel crons; schedule fulfilment jobs with Upstash QStash; verify `Upstash-Signature` on job routes.

**Tech:** `@upstash/qstash` Receiver, existing `isAuthorizedInternalJobRequest`, `vercel.json`, upsert script.

---

### Task 1: Trim vercel.json + add dependency

- Remove fulfilment cron entries; keep privacy-retention daily.
- `npm install @upstash/qstash`

### Task 2: Env + auth

- Optional `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` in `lib/env.ts`.
- Make `isAuthorizedInternalJobRequest` async; accept valid QStash signature (clone+raw body) when keys set; keep secret headers.

### Task 3: Update job routes

- `await isAuthorizedInternalJobRequest(request)` on expire/release/retry.

### Task 4: Upsert script + docs

- `scripts/qstash-upsert-fulfilment-schedules.mjs`
- Update `SECURITY.md`, `OPERATIONS.md`; mark design spec Status implemented after ship.

### Task 5: Verify

- Run fulfilment job auth tests; typecheck.
