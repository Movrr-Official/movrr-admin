# Plan 2 Task 1: Platform API client for Admin UI

**Files:**
- Create: `lib/platformApi/client.ts`
- Create: `lib/platformApi/types.ts`
- Test: `__tests__/ui/platformApiClient.test.ts`

**Interfaces:**
- `platformGet/Post(path, options)` → typed success or structured errors
- Map 409 → ConcurrencyConflict; 403 → PermissionFailure; attach X-Correlation-Id
- Same-origin credentials (admin session cookies)

TDD. Commit: `feat(admin): add Platform API client for ops UI`
Branch: feat/fulfilment-engine-plan-1
No business rules in client.
