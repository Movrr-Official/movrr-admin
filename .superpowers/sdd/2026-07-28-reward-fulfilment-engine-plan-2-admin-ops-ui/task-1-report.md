# Task 1 Report: Platform API client for Admin UI

**Status:** DONE_WITH_CONCERNS  
**Branch:** `feat/fulfilment-engine-plan-1`  
**Commit:** (pending — filled after commit)

---

## Summary

Added a thin Admin ops HTTP client for `/api/v1`:

- `platformGet` / `platformPost` with same-origin credentials (admin session cookies)
- Structured `PlatformApiResult<T>` success/failure (no throws for HTTP errors)
- Status mapping: **409 → `ConcurrencyConflict`**, **403 → `PermissionFailure`**
- Always sends / returns `X-Correlation-Id`
- No business rules — transport + envelope parsing only

---

## TDD workflow

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Wrote `__tests__/ui/platformApiClient.test.ts` | Test file created |
| 2 | `npx vitest run __tests__/ui/platformApiClient.test.ts` | FAIL — `@/lib/platformApi/client` not found |
| 3 | Implemented `types.ts` + `client.ts`; added vitest `__tests__/ui` include | Minimal green |
| 4 | Re-ran vitest | PASS — 4/4 |
| 5 | Committed | see Commit below |

---

## Files created / modified

| File | Purpose |
|------|---------|
| `lib/platformApi/types.ts` | Envelope + request option types |
| `lib/platformApi/client.ts` | `platformGet` / `platformPost` |
| `__tests__/ui/platformApiClient.test.ts` | Mapping, credentials, correlation, POST body |
| `vitest.config.ts` | Include `__tests__/ui/**/*.test.ts` |

---

## Implementation notes

### Result shape

```ts
type PlatformApiResult<T> =
  | { ok: true; value: T; correlationId: string | null }
  | { ok: false; kind: string; message: string; status: number; correlationId: string | null };
```

### HTTP behaviour

- `credentials: "same-origin"`
- `Accept: application/json`; POST sets `Content-Type: application/json`
- Optional extra headers (e.g. `Idempotency-Key`) via `options.headers`
- `options.fetch` injectable for tests
- Success expects `{ data, correlationId }` (Plan 1 `platformRoute` envelope)
- Failure reads `{ error: { kind, message }, correlationId }` then normalises 403/409 kinds

---

## Test output

```
✓ platformApi client > maps 409 to ConcurrencyConflict
✓ platformApi client > maps 403 to PermissionFailure
✓ platformApi client > attaches X-Correlation-Id and uses same-origin credentials
✓ platformApi client > sends JSON body on platformPost with correlation header

Test Files  1 passed (1)
Tests       4 passed (4)
```

---

## Concerns

1. **Auth mismatch risk** — Client sends same-origin cookies only (plus optional caller headers). Plan 1 `platformRoute` currently authenticates via **Bearer** (`extractBearerToken`). Live Admin UI calls will 401 until either (a) routes also accept session cookies, or (b) callers pass `Authorization: Bearer <jwt>` via `options.headers`. Out of scope for this HTTP-client-only task; surface when wiring Task 2 hooks.

2. **`vitest.config.ts` include** — Added `__tests__/ui/**/*.test.ts` so the new suite is discovered (same pattern as Plan 1 feature tests).

3. **DTO read models** — `types.ts` has envelope/options types only; fulfilment/partner Zod read models deferred to later Plan 2 tasks when hooks need them.
