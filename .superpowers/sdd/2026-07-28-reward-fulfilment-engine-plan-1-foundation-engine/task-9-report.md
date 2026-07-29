# Task 9 Report: RedeemRewardService — financial commitment + 1:1 fulfilment

**Status:** DONE  
**Branch:** `feat/fulfilment-engine-plan-1`  
**Commit:** _(filled after commit)_

---

## Summary

Implemented `RedeemRewardService` orchestration per design §5.6:

1. `assertCapability(rewards.redeem)`
2. `FraudPolicyEngine` idempotency + rate limit
3. Catalog load — active + supported `fulfilment_type` (`instant_digital` | `qr_barcode`) + resource binding
4. `SettlementService.debit`
5. Persist `RewardRedemption` (in-memory port)
6. `FulfilmentEngine.createFromRedemption` + `start`
7. Enqueue `RewardRedemptionCreated` / `FulfilmentCreated` (caller flushes)
8. Return `{ redemption, fulfilment }`

Also added `scripts/044_catalog_fulfilment_type.sql` (`fulfilment_type` + `resource_id` on `reward_catalog`).

---

## TDD workflow

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Wrote `__tests__/features/rewards/redeemReward.test.ts` | 6 behaviours |
| 2 | `npx vitest run …redeemReward.test.ts` | FAIL — module not found |
| 3 | Implemented contracts, service, in-memory ports, SQL 044 | Minimal green |
| 4 | Re-ran vitest + typecheck | PASS — 6/6; typecheck clean |
| 5 | Committed | see Commit |

---

## Files created

| File | Purpose |
|------|---------|
| `features/rewards/application/contracts/RedeemRewardCommand.ts` | Command, result, catalog/redemption ports, supported-type guard |
| `features/rewards/application/commands/redeemReward.ts` | Orchestrator + in-memory catalog/redemption fakes |
| `scripts/044_catalog_fulfilment_type.sql` | Catalog `fulfilment_type` + `resource_id` binding |
| `__tests__/features/rewards/redeemReward.test.ts` | Happy path, unsupported-before-debit, insufficient points, idempotency, compensate, authz |

---

## Implementation notes

### Orchestration order
Matches brief: authz → fraud → catalog validate (before debit) → debit → persist redemption → create fulfilment → start → record idempotent success.

### Failure paths
- Unsupported / inactive / missing resource → `BusinessFailure` **before** debit
- Overdraft → settlement `BusinessFailure` (no redemption)
- Idempotent replay → prior success payload, no second debit
- Start ends failed/refunded → engine compensating refund (or redeem refunds if not already `refunded`); redeem returns `BusinessFailure`
- Hard `start` / `create` failure → redeem issues compensating refund

### DI
Depends only on contracts: `AuthorisationService`, `FraudPolicyEngine`, `SettlementService`, `FulfilmentEngine`, catalog/redemption ports, `DomainEventBus`.

### Out of scope
- HTTP `/api/v1/rewards/redeem` (Task 10)
- Supabase catalog/redemption adapters (in-memory OK per brief)
- Production ledger adapter (still Task 10 follow-up)

---

## Test summary

`npx vitest run __tests__/features/rewards/redeemReward.test.ts` — **6 passed**

`npm run typecheck` — clean

---

## Commit

```
_(hash)_ feat(rewards): redeem creates financial commitment and fulfilment
```

---

## Concerns

1. **In-memory catalog/redemption ports** — production must wire Supabase + apply `044` before live redeem.
2. **Failed redeem still persists redemption** — commitment row exists after compensated failure; ops/read models should treat terminal refunded fulfilment as the source of truth (or add status update later).
3. **Engine auto-refund vs redeem refund** — redeem skips second refund when fulfilment is already `refunded`; still relies on Task 8 `compensateIfFailed` not checking settlement result (noted in Task 8 review).
4. **Idempotency records only success** — failed-after-debit attempts are retryable under the same key (intentional); concurrent same-key races need durable idempotency uniqueness in Task 10.
