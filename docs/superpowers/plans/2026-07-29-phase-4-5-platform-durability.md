# Phase 4.5 — Platform Durability & Persistence Remediation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire production Platform API + Fulfilment module + jobs to durable Supabase persistence (migrations 040–045 / 041–043), eliminating all Critical in-memory / stub findings before UAT.

**Architecture:** Keep existing domain services, handlers, and HTTP routes. Introduce Supabase adapters behind existing ports (or thin extracted ports where Maps are closed over). Production composition injects durable adapters; tests keep in-memory.

**Tech Stack:** Next.js Platform API, Supabase service role, existing `wallet_settle_*` RPCs, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-phase-4-5-platform-durability-design.md`

## Global Constraints

- No architectural redesign of Fulfilment SM / handler registry / route shapes
- Production must never return stub redeem / fake partner validate success
- Query + command stores for fulfilment must be the same durable source
- In-memory remains allowed **only** in tests via `createPlatformApiForTests({ seed })` / explicit in-memory factories
- Commit durable org partner fix as part of Task 0 if still uncommitted
- Exit: re-run durability audit → **0 Critical**

---

## File map (new adapters)

| New file | Responsibility |
|----------|----------------|
| `features/fulfilment/application/contracts/FulfilmentAggregateStore.ts` | Port extracted from engine Map |
| `features/fulfilment/infrastructure/supabaseFulfilmentAggregateStore.ts` | 043 fulfilment + events |
| `features/fulfilment/infrastructure/supabaseTokenStore.ts` | 043 fulfilment_token |
| `features/fulfilment/infrastructure/supabaseResourceProviders.ts` | 043 resource / item / allocation |
| `features/wallet/infrastructure/supabaseLedgerRepository.ts` | 042 RPC debit/refund + balance reads |
| `features/rewards/infrastructure/supabaseCatalogRepository.ts` | reward_catalog reads |
| `features/rewards/infrastructure/supabaseRedemptionRepository.ts` | reward_redemptions writes/reads |
| `features/fraud/infrastructure/supabaseIdempotencyStore.ts` | 041 |
| `features/fraud/infrastructure/supabaseReplayStore.ts` | 041 |
| `features/fraud/infrastructure/supabaseRateLimitStore.ts` | 041 |
| `features/notifications/infrastructure/supabaseNotificationInsertPort.ts` | notifications insert |
| `features/fulfilment/application/queries/supabaseFulfilmentQueryPort.ts` | list/get/timeline from 043 |

Modify: `FulfilmentEngine.ts` (inject store), `tokenService.ts` (inject store), `composeFulfilmentModule.ts`, `composePlatformApi.ts`, `productionPlatformApi.ts`, `partnerServices` wiring, `rewardCatalog.ts` upsertPartner link, `OPERATIONS.md`.

---

### Task 0: Land Organisation durability (already drafted)

**Deliverable:** Partner create persists across reload; production uses `createSupabaseOrganisationOpsStore`.

- [ ] Confirm `scripts/045_reward_partner_organisation_link.sql` is applied in Supabase (operator step — document in commit/PR notes)
- [ ] Ensure `productionPlatformApi` injects `organisationStore: createSupabaseOrganisationOpsStore()`
- [ ] Dual-write `reward_partner` on `reward_partner` org create (already in adapter)
- [ ] Typecheck + org-related tests pass
- [ ] Commit: `fix(ops): persist organisations via Supabase for Partner create`

---

### Task 1: Extract FulfilmentAggregateStore port + keep Map adapter

**Deliverable:** Engine accepts injectable store; default Map preserves all existing unit tests.

- [ ] Add `FulfilmentAggregateStore` contract matching current Map entry shape (`fulfilment` + events + version concurrency)
- [ ] Refactor `createFulfilmentEngine({ store?, ... })` to use injected store
- [ ] Provide `createInMemoryFulfilmentAggregateStore()`
- [ ] Run fulfilment engine / SM / handler tests — all green
- [ ] Commit: `refactor(fulfilment): extract injectable aggregate store port`

---

### Task 2: Supabase FulfilmentAggregateStore (043)

**Deliverable:** Engine can load/save/list/append events against `fulfilment` + `fulfilment_event` with optimistic `version`.

- [ ] Implement `createSupabaseFulfilmentAggregateStore`
- [ ] Map domain ↔ snake_case rows; concurrency: update where `version = expected`
- [ ] Contract/integration test with mocked supabase client **or** focused mapper + concurrency unit test
- [ ] Commit: `feat(fulfilment): persist aggregates to fulfilment tables`

---

### Task 3: Durable tokens + resources (043)

**Deliverable:** Token issue/consume and pool allocate/release/fulfil hit DB.

- [ ] Extract token persistence port from `createTokenService` Maps; add Supabase adapter
- [ ] Implement Supabase-backed voucher pool + generated digital providers (or shared resource repo used by both)
- [ ] Wire into `composeFulfilmentModule({ tokens, pool, ... })`
- [ ] Tests for hash lookup / allocate-release happy paths (in-memory + adapter unit)
- [ ] Commit: `feat(fulfilment): durable tokens and resource pools`

---

### Task 4: Wallet ledger → 042 RPCs

**Deliverable:** `LedgerRepository` production impl calls `wallet_settle_debit` / `wallet_settle_refund`; balance/transactions read live tables.

- [ ] Implement `createSupabaseLedgerRepository`
- [ ] Wire settlement strategy in production composition
- [ ] Keep in-memory ledger for tests
- [ ] Commit: `feat(wallet): settle via wallet_settle_* RPCs`

---

### Task 5: Catalog + redemption repositories + real redeem in production

**Deliverable:** Production redeem builds `redeemService` with durable deps; **delete stub success path**.

- [ ] `createSupabaseCatalogRepository` / `createSupabaseRedemptionRepository`
- [ ] Wire fraud engine with durable 041 stores (or Task 6 if split — prefer durable idempotency before enabling redeem)
- [ ] In `composePlatformApi` / production: always compose redeem when fulfilment module present; remove stub `ok({ redemption: stub... })`
- [ ] Fulfilment query port reads from same Supabase aggregate store (no seed `f-1` in production)
- [ ] Tests: authz matrix still passes; add redeem wiring test that stub path is absent in production factory options
- [ ] Commit: `feat(rewards): wire durable redeem flow; remove production stub`

---

### Task 6: Fraud / idempotency / replay → 041

**Deliverable:** Redeem and sensitive commands use `platform_idempotency_key`, `platform_consumed_jti`, `platform_rate_limit_counter`.

- [ ] Supabase adapters for three fraud stores
- [ ] Wire `createFraudPolicyEngine` in production composition
- [ ] Optional: append `platform_audit_record` on cancel/refund
- [ ] Commit: `feat(fraud): persist idempotency and replay to platform_* tables`

---

### Task 7: Partner commands + resource import

**Deliverable:** Validate / confirm / pending / resources use engine + tokens + DB; no fake `{ validated: true }` without work.

- [ ] Pass `engine` + `tokens` into `createPartnerCommands` from composition
- [ ] Implement durable pending list from fulfilment states
- [ ] Resource GET lists DB pools; POST import inserts `fulfilment_resource_item` rows
- [ ] Commit: `feat(partners): wire validate/confirm/resources to durable stores`

---

### Task 8: Jobs + notifications + org reverse sync

**Deliverable:** Expire/release operate on DB; notifications durable; catalog partner upsert links organisation.

- [ ] Ensure jobs module uses production durable `composeFulfilmentModule`
- [ ] `createSupabaseNotificationInsertPort` for side-effects bus
- [ ] Update `upsertPartner` in `rewardCatalog.ts` to create/link `organisation`
- [ ] Commit: `feat(ops): durable jobs side-effects and catalog↔org sync`

---

### Task 9: Docs + durability re-audit gate

**Deliverable:** Docs updated; audit re-run; Critical = 0.

- [ ] Update `OPERATIONS.md` / `SECURITY.md` with migration prerequisites and durable composition notes
- [ ] Re-run durability audit (same criteria as 2026-07-29 audit)
- [ ] Record results in `docs/superpowers/specs/2026-07-29-phase-4-5-platform-durability-design.md` (Exit gate section)
- [ ] Commit: `docs(ops): Phase 4.5 durability exit gate`

---

## Suggested execution order

`0 → 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8 → 9`

(Idempotency before enabling real redeem avoids duplicate debits.)

## Out of scope (defer)

- Reading AuthZ grants from DB `bundle_capability` at runtime (Medium finding M2)
- Distributed metrics sink beyond process counters
- Unsupported fulfilment handler product behaviour
