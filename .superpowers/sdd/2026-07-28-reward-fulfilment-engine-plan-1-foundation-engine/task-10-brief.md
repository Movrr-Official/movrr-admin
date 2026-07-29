# Task 10: Platform API `/api/v1` routes

**Create thin route handlers only** under `app/api/v1/`:

### rewards
- `GET catalog/route.ts`, `GET catalog/[id]/route.ts`
- `POST redeem/route.ts` (Idempotency-Key header)
- `GET redemptions/route.ts`, `GET redemptions/[id]/route.ts`

### wallet
- `GET balance/route.ts`, `GET transactions/route.ts`
- No public debit

### fulfilment
- `GET [id]/route.ts` (state+outcome+progress+version)
- `GET [id]/timeline/route.ts`
- `GET [id]/token/route.ts`
- `POST [id]/cancel/route.ts`, `POST [id]/refund/route.ts`
- `POST tokens/consume/route.ts`
- `POST [id]/confirm-collection/route.ts`
- `GET route.ts` — ops list query for Admin (status/type filters)

### partners
- `GET me/route.ts`
- `GET fulfilments/pending/route.ts`
- `POST validate/route.ts`
- `POST collections/confirm/route.ts`
- Resources, rewards, staff, analytics, settings stubs that call real application queries/commands where available — production-ready thin wrappers, not empty 501s. If a command isn't built yet, return structured BusinessFailure `not_implemented` with 501 only for partner staff/resources if absolutely necessary — prefer minimal working query returning empty lists from ports.

**Also create:**
- `lib/http/platformRoute.ts` — auth → principal → withPermissions → capability guard → map ApplicationResult → HTTP
- Query read models under `features/*/application/queries/*`
- Composition helpers to wire services for route handlers (can be simple factories)

**Tests:**
- `__tests__/features/api/v1.authz.matrix.test.ts`
- `__tests__/features/api/v1.idempotency.test.ts`

Test handlers by calling exported logic or invoking route handlers with mocked Request — capability matrix for Rider / Partner Staff / Manager / Owner / Admin.

## Rules
- ZERO business rules in routes
- Version path `/api/v1`
- Map ApplicationResult kinds to HTTP status (403 permission, 409 concurrency, 400 validation, 422 business, 500 infra)
- Commit: `feat(api): expose /api/v1 rewards wallet fulfilment partners`
- Branch: feat/fulfilment-engine-plan-1

If composition gets large, keep factories in `features/*/infrastructure/compose*.ts` — still Task 10 scope for API to work in tests.
