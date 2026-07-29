# Task 8 Report: Handler registry + Instant Digital + QR handlers + Unsupported

**Status:** DONE  
**Branch:** `feat/fulfilment-engine-plan-1`  
**Commit:** _(filled after commit)_

---

## Summary

Implemented FulfilmentEngine orchestration with an immutable HandlerRegistry and Phase-1 handlers:

- `FulfilmentHandler` contract — handlers request SM transitions only
- `InstantDigitalHandler` — allocate → processing → ready → completed
- `QrBarcodeHandler` — reserve → token → awaiting_collection → validated → collected → completed
- `UnsupportedFulfilmentHandler` — `fulfilment_type_not_implemented` (no SM mutation)
- `HandlerRegistry` — register all 8 types; `freeze()` rejects further register
- `FulfilmentEngine` — sole orchestrator: create/start/onTokenConsumed/cancel/refund/confirmCollection; owns SettlementService refunds
- Extended `FULFILMENT_TYPES` to the full design catalogue (6 unsupported types have empty transition tables)

---

## TDD workflow

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Wrote `handlers.test.ts` + `engine.test.ts` | Instant happy path, QR validate→confirm, unsupported, freeze |
| 2 | `npx vitest run …handlers.test.ts …engine.test.ts` | FAIL — modules not found |
| 3 | Implemented contracts, handlers, registry, engine + type union | Minimal green |
| 4 | Re-ran vitest + typecheck | PASS — 11 new + prior SM/resources green; typecheck clean |
| 5 | Committed | see Commit |

---

## Files created

| File | Purpose |
|------|---------|
| `features/fulfilment/application/contracts/FulfilmentHandler.ts` | Handler port + `requestTransition` / result types |
| `features/fulfilment/application/handlers/InstantDigitalHandler.ts` | Instant digital lifecycle |
| `features/fulfilment/application/handlers/QrBarcodeHandler.ts` | QR/barcode lifecycle + token issue |
| `features/fulfilment/application/handlers/UnsupportedFulfilmentHandler.ts` | Safety-net business failure |
| `features/fulfilment/application/HandlerRegistry.ts` | Register / resolve / freeze |
| `features/fulfilment/application/FulfilmentEngine.ts` | Orchestrator + in-memory store |
| `__tests__/features/fulfilment/handlers.test.ts` | Registry + handler coverage |
| `__tests__/features/fulfilment/engine.test.ts` | Engine orchestration + wallet refund |

## Files modified

| File | Change |
|------|--------|
| `features/fulfilment/domain/Fulfilment.ts` | `FULFILMENT_TYPES` → all 8 catalogue types |
| `features/fulfilment/domain/transitions.ts` | Empty edge tables for unsupported types |

---

## Implementation notes

### Authority split
- Handlers never assign `fulfilment.state`; they only call injected `requestTransition` (SM).
- Engine is the only caller of `SettlementService` (cancel→refund path; auto-compensate on start→failed).
- Resource allocate/fulfil/release and TokenService issue are type-specific ports used by handlers (Fulfilment-owned contracts).

### Instant digital
`created → allocate → processing → fulfil → ready → completed` (outcome `success`). Allocate/fulfil failure → `failed` (+ engine compensating refund).

### QR / barcode
`created → reserved → issue token → ready → awaiting_collection`; `onTokenConsumed` → `validated`; `confirmCollection` → `collected` → fulfil resource → `completed`.

### Registry
Composition registers all 8 types; only `instant_digital` + `qr_barcode` are fully implemented. `freeze()` throws on further `register()`.

### ApplicationResult
- Unsupported: `{ ok: false, kind: "fulfilment_type_not_implemented", ... }`
- Engine not found / illegal refund state: structured failures
- Success values wrap `{ fulfilment, issuedTokenPlaintext? }` for start/token/collection flows

### Out of scope
- Persistence adapters (in-memory engine store for unit tests)
- Composition root freeze at app bootstrap (Task 13)
- RedeemRewardService wiring (Task 9)
- HTTP routes (Task 10)

---

## Test summary

`npx vitest run __tests__/features/fulfilment/handlers.test.ts __tests__/features/fulfilment/engine.test.ts` — **11 passed**

`npx vitest run __tests__/features/fulfilment/stateMachine.test.ts` — **69 passed** (still green after type union expand)

`npm run typecheck` — clean

---

## Commit

```
_(hash)_ feat(fulfilment): add engine, handler registry, instant digital and QR handlers
```

---

## Concerns

1. **In-memory engine store** — Task 8 unit engine keeps fulfilments in a `Map`; production must persist via `043_fulfilment_engine.sql` before redeem goes live.
2. **Handlers hold allocation refs in process memory** — release/fulfil after restart needs durable `FulfilmentResourceAllocation` rows (Task 10/infra).
3. **Unsupported types have empty SM edges** — cancel/fail/refund via SM for those types will `IllegalTransition` until their transition tables land with real handlers.
4. **Auto-refund on start→failed** transitions to `refunded` inside the engine; callers of `start` may observe `refunded` rather than `failed` after compensate — intentional compensating path; document for Task 9 redeem error handling.
