# Task 10 Report: Platform API `/api/v1` routes

**Status:** DONE_WITH_CONCERNS  
**Branch:** `feat/fulfilment-engine-plan-1`  
**Commit:** `359dbe2`

---

## Summary

Exposed thin `/api/v1` Platform API handlers for rewards, wallet, fulfilment, and partners. All routes go through `platformRoute` (AuthN → `withPermissions` → `assertCapability` → application handle → HTTP mapping). Zero business rules in route modules.

Priority surface delivered: redeem, fulfilment get/cancel/refund/token/consume/confirm, wallet balance, partners/me, authz + idempotency tests; remaining list/partner query stubs return empty lists from application ports.

---

## TDD workflow

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Wrote `__tests__/features/api/v1.authz.matrix.test.ts` + `v1.idempotency.test.ts` | FAIL — compose module missing |
| 2 | Implemented `platformRoute`, queries, partner services, compose factory, route files | Minimal green |
| 3 | Re-ran vitest + typecheck | PASS — 9/9 API; typecheck clean |

---

## Files created (high level)

| Area | Purpose |
|------|---------|
| `lib/http/platformRoute.ts` | Auth → AuthZ → handle → status mapping |
| `features/*/application/queries/*` | Catalog, redemption, wallet, fulfilment read models |
| `features/partners/application/partnerServices.ts` | Partner me/pending/validate/confirm + empty-list stubs |
| `features/platform/infrastructure/composePlatformApi.ts` | Test/composition factory for handlers |
| `features/platform/infrastructure/productionPlatformApi.ts` | Production lazy singleton (JWT live; principal lookups stubbed) |
| `app/api/v1/**` | Thin Next.js route re-exports |
| `__tests__/features/api/v1.*.test.ts` | Authz matrix + idempotency |

---

## HTTP mapping

| Kind | Status |
|------|--------|
| `unauthenticated` / `unrecognised_principal` | 401 |
| `permission_denied` | 403 |
| `ConcurrencyConflict` | 409 |
| `validation` / `validation_failed` | 400 |
| `not_found` | 404 |
| `not_implemented` / `fulfilment_type_not_implemented` | 501 |
| `InfrastructureFailure` / `infra` | 500 |
| other (e.g. `BusinessFailure`) | 422 |

---

## Test summary

`npx vitest run __tests__/features/api/` — **9 passed**

`npm run typecheck` — clean

---

## Commit

```
359dbe2 feat(api): expose /api/v1 rewards wallet fulfilment partners
```

---

## Concerns

1. **Production principal lookups stubbed** — JWT verifies; `findAdminUser` / membership / rider return null until SQL adapters are wired → live requests resolve `unrecognised_principal`.
2. **Production compose uses in-memory empty stores** — redeem/engine only fully wired when test `seed` is provided; production singleton has no catalog/ledger seed.
3. **Partner resources/rewards/staff/analytics/settings** — return empty lists (or empty settings object) from application query ports; not 501s.
4. **Admin wallet balance** — Phase-1 placeholder uses `admin:{adminUserId}` key (balance 0) until scoped rider query exists.
5. **`features/platform`** — composition glue only (no business rules); acceptable for Task 10 HTTP wiring.
