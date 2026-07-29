# Task 2 Report: Fulfilment ops queue + detail (+ AuthN bridge)

**Status:** DONE_WITH_CONCERNS  
**Branch:** `feat/fulfilment-engine-plan-1`  
**Commit:** _(filled after commit)_

---

## Summary

Admin fulfilment operations UI and AuthN bridge so `platformGet`/`platformPost` authenticate against Plan 1 `platformRoute` Bearer JWT AuthN:

- **AuthN:** Client attaches `Authorization: Bearer <access_token>` from Supabase browser session (`getSession()`), keeping the single JWT AuthN model. Injectable `getAccessToken` for tests; does not override an explicit `Authorization` header.
- **UI:** Queue + detail pages under `/rewards/fulfilment`, linked from Rewards overview; presentation-only filters (`status`, `type`, `partnerOrgId`) via query params.
- **API:** Confirmed `GET /api/v1/fulfilment` list exists; wired `partnerOrgId` query param through to `listForOps`.

No client state machine / business rules — state, outcome, progress, version, timeline are API read models only.

---

## AuthN approach (chosen)

**Bearer-from-session (preferred).**

| Layer | Behaviour |
|-------|-----------|
| `lib/platformApi/client.ts` | Before fetch, if no `Authorization` header, resolve token via `options.getAccessToken` or default `createSupabaseBrowserClient().auth.getSession()` and set `Authorization: Bearer …` |
| `platformRoute` | Unchanged — still AuthN via `extractBearerToken` only (single AuthN model) |
| Cookie fallback | **Not** added — would dual-path AuthN; Bearer keeps client and routes aligned with the design JWT model |

---

## TDD workflow

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Extended `__tests__/ui/platformApiClient.test.ts` for Bearer attach + no-override | FAIL — `getAccessToken` never called |
| 2 | Implemented Bearer attach + `getAccessToken` option; lazy-import supabase client | GREEN — 6/6 |
| 3 | Built ops UI + partnerOrgId list param | Typecheck clean |
| 4 | Commit | See commit hash above |

---

## Files created / modified

| File | Purpose |
|------|---------|
| `lib/platformApi/client.ts` | Bearer AuthN from session |
| `lib/platformApi/types.ts` | `getAccessToken` option |
| `__tests__/ui/platformApiClient.test.ts` | Bearer / override coverage |
| `hooks/useFulfilmentOpsData.ts` | Queue / detail / timeline via `platformGet` |
| `app/rewards/fulfilment/page.tsx` | AuthWrapper + queue |
| `app/rewards/fulfilment/FulfilmentOpsQueuePage.tsx` | Filters + table |
| `app/rewards/fulfilment/[id]/page.tsx` | AuthWrapper + detail |
| `app/rewards/fulfilment/[id]/FulfilmentOpsDetailPage.tsx` | Detail wiring |
| `components/rewards/fulfilment/FulfilmentQueueTable.tsx` | Queue presentation |
| `components/rewards/fulfilment/FulfilmentDetailPanel.tsx` | Detail fields |
| `components/rewards/fulfilment/FulfilmentTimeline.tsx` | Event list |
| `app/rewards/RewardsOverview.tsx` | Link to fulfilment ops |
| `features/fulfilment/.../fulfilmentQueries.ts` | `partnerOrgId` on `listForOps` filter type |
| `features/platform/.../composePlatformApi.ts` | Pass `partnerOrgId` query param |

---

## Test / typecheck

```
✓ platformApi client (6 tests)
npm run typecheck — exit 0
```

---

## Concerns

1. **No cookie AuthN fallback** — If the browser session is missing/`getSession()` returns null (e.g. expired refresh), calls 401. Intentional to keep single Bearer model; ops must be signed in with a valid Supabase session.
2. **In-memory fulfilment store** — Production `getProductionPlatformApi` uses the shared fulfilment module; queue may be empty until redemptions populate the engine. UI still works; empty state is expected in fresh envs.
3. **No RTL smoke for pages** — Covered AuthN client with vitest; queue/detail are thin presentation over `platformGet`. Task 3 actions may want contract tests for POST bodies.
4. **Partner filter is free-text org ID** — No partner picker yet (Plan 2 Task 5). Filter is forwarded as `partnerOrgId` query param only.
