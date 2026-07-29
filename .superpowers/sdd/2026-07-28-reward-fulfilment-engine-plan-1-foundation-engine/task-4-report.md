# Task 4 Report: AuditService + FraudPolicyEngine

**Status:** DONE  
**Branch:** `feat/fulfilment-engine-plan-1`  
**Commit:** see git log (message below)

---

## Summary

Implemented Phase 1 platform audit capability and fraud policy engine:

- SQL `scripts/041_platform_audit_idempotency.sql` - append-only `platform_audit_record` (DB triggers block UPDATE/DELETE), idempotency store, consumed jti, rate-limit counters + RLS
- `AuditService.append` only - no update/delete on service surface; store.update fails with `immutable_audit`
- `FraudPolicyEngine.evaluate` - Phase 1 policies: idempotency replay, jti replay deny, rate limit; `recordIdempotentSuccess` for prior payload storage
- Extension stubs documented for velocity / anomaly / risk scoring (not implemented)

---

## TDD workflow

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Wrote failing fraud + audit tests | Modules missing |
| 2 | `npx vitest run __tests__/features/fraud __tests__/features/audit` | FAIL - ERR_MODULE_NOT_FOUND |
| 3 | Implemented domain/contracts/commands/policies + SQL | Minimal green implementation |
| 4 | Re-ran vitest + typecheck | PASS - 7/7 task tests; typecheck clean |
| 5 | Committed | see Commit section |

---

## Files created

| File | Purpose |
|------|---------|
| `scripts/041_platform_audit_idempotency.sql` | Audit + idempotency + jti + rate-limit schema |
| `features/audit/domain/AuditRecord.ts` | Audit record types |
| `features/audit/application/contracts/AuditService.ts` | AuditService + AuditStore ports |
| `features/audit/application/commands/auditService.ts` | Append-only AuditService |
| `features/audit/infrastructure/inMemoryAuditStore.ts` | In-memory store (tests) |
| `features/fraud/application/contracts/FraudPolicyEngine.ts` | FraudDecision + engine + store ports + extension stubs |
| `features/fraud/application/commands/fraudPolicyEngine.ts` | evaluate + recordIdempotentSuccess |
| `features/fraud/infrastructure/policies/idempotency.ts` | (principalId, scope, key) store |
| `features/fraud/infrastructure/policies/replay.ts` | Consumed jti store |
| `features/fraud/infrastructure/policies/rateLimit.ts` | Fixed-window rate limit store |
| `__tests__/features/audit/auditService.test.ts` | Append-only / immutability tests |
| `__tests__/features/fraud/fraudPolicies.test.ts` | Idempotency / replay / rate-limit tests |

---

## Implementation notes

### FraudDecision

- `allow` - proceed
- `deny(reason)` - `replay_detected` | `rate_limited`
- `idempotent_replay` - return prior success payload for duplicate key

### Fraud evaluates only

Policy stores (idempotency / jti / counters) may be written; business aggregates, refunds, and resource allocations are never mutated by the engine.

### Audit immutability

- Service surface: `append` only
- In-memory store: `update` returns `immutable_audit`
- SQL: BEFORE UPDATE/DELETE triggers raise; no UPDATE/DELETE RLS policies

### Out of scope

- Supabase-backed production adapters (in-memory OK for unit tests)
- Velocity / anomaly / risk scoring (stubs/comments only)
- Wiring into `/api/v1` handlers (later tasks)

---

## Test summary

`npx vitest run __tests__/features/fraud/fraudPolicies.test.ts __tests__/features/audit/auditService.test.ts` - **7 passed**

Also green: platform + identity + organisations (33 total in combined run). `npm run typecheck` clean.

---

## Commit

```
feat(platform): add audit capability and fraud policy engine
```