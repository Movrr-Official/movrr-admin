# Phase 4.5 — Platform Durability & Persistence Remediation

**Date:** 2026-07-29  
**Status:** Implemented — exit gate **0 Critical** (2026-07-29 re-audit)  
**Repos:** `movrr-admin` (Platform API + Fulfilment module + internal jobs)  
**Type:** Integration / durability remediation — **not** an architectural redesign  
**Prerequisite:** Migrations `040`–`045` applied in the target database  
**Exit gate:** Re-run durability audit; **all Critical findings eliminated** before UAT / production readiness testing

---

## 1. Objective

Replace every process-local in-memory implementation used by production Platform API / Fulfilment composition with adapters backed by the persistence model already defined in migrations **040–045** (and existing rewards/catalog tables).

After this phase, serverless / multi-instance deployment must operate on **shared durable state** only. No production path may return stub success for redeem, partner ops, or resource mutations.

---

## 2. Non-goals

- Redesigning domain models, state machines, handler registry, or Platform API route shapes
- Reworking Admin UI information architecture
- Changing QStash scheduling (already relocated off Hobby Vercel crons)
- Migrating legacy `app/actions/*` Rewards UI off Supabase (already durable); only close dual-write gaps where it intersects Platform organisations
- Full product UAT (blocked until durability audit is clean)

---

## 3. Current state (from durability audit)

| Layer | Production wiring (post Phase 4.5) |
|-------|-------------------------------------|
| AuthN + organisations | Supabase (`040`/`045` + membership lookup) |
| Fulfilment engine / tokens / resources | Supabase `043` adapters |
| Wallet settlement | `042` `wallet_settle_*` RPCs |
| Redeem | Durable catalog + redemption + fraud stores |
| Partner validate / confirm / pools | Engine + tokens + DB resource import/list |
| Fraud / idempotency / replay | Supabase `041` |
| Jobs (expire / release) | Shared durable `getSharedFulfilmentModule()` |

In-memory remains **tests only**.

---

## 4. Target composition

```
getProductionPlatformApi()
  ├─ authDeps (Supabase)                    [already]
  ├─ organisationStore (Supabase)           [landed — keep]
  └─ fulfilmentModule = composeFulfilmentModule({
       ledger: supabaseWalletSettlement,    // 042 RPCs
       fulfilmentRepo: supabaseFulfilment,  // 043
       tokens: supabaseTokenService,        // 043
       resources: supabaseResourceProviders,// 043
       fraudStores: supabase041,            // 041
       notifications: supabaseNotifications // existing notifications table
     })
```

**Rules:**

1. `createPlatformApiForTests({ seed })` may keep in-memory for unit tests.
2. Production **must not** call seed-only redeem stubs.
3. Query ports and command stores for fulfilment **must share** the same durable repository (kill phantom seed `f-1`).
4. Jobs use the same durable `getSharedFulfilmentModule()` / repo as API.

---

## 5. Priority workstreams

### P0 — Redeem end-to-end (eliminates stub)

Catalog read (Supabase `reward_catalog`) → idempotency (`041`) → wallet debit (`042 wallet_settle_debit`) → `reward_redemptions` insert → fulfilment create (`043`) → handler allocate → events.

Compensating refund on failure via `wallet_settle_refund`.

### P1 — Fulfilment / Token / Resource Maps → 043

- Persist fulfilment aggregate + optimistic `version`
- Append-only `fulfilment_event`
- `fulfilment_token` issue / consume / hash lookup
- `fulfilment_resource` / `_item` / `_allocation` for pools + generated digital

### P2 — Partner ops + pools

Wire `createPartnerCommands({ tokens, engine })`; validate / confirm collection against durable fulfilment + `partner_validation`; resource list/import mutate DB items.

### P3 — Fraud / idempotency / replay → 041

Supabase adapters for `platform_idempotency_key`, `platform_consumed_jti`, `platform_rate_limit_counter`; optional `platform_audit_record` writes on sensitive mutations.

### P4 — Organisation / reward_partner completion

- Finish durable org store in production (already drafted)
- Reverse sync: catalog `upsertPartner` creates/links `organisation`
- Ensure 045 applied + dual-write both directions

---

## 6. Success criteria

1. Durability audit re-run: **0 Critical** findings.
2. Redeem in production: real debit + redemption row + fulfilment row; no stub IDs.
3. Reload / new isolate: partners, fulfilments, pools, tokens still present.
4. Partner validate/confirm mutate durable state (or explicit domain error — never fake `{ validated: true }`).
5. Expire/release jobs update DB rows when due.
6. Unit tests still use in-memory; integration/contract tests cover adapters where practical.
7. Docs (`OPERATIONS.md` / `SECURITY.md`) note durable composition + required migrations.

---

## 7. Verification gate

### Exit gate — re-audit (2026-07-29, post Phase 4.5)

| Finding (original Critical) | Status |
|-----------------------------|--------|
| Organisations / Partner create in-memory | **Fully Resolved** — `createSupabaseOrganisationOpsStore` + 045 dual-write |
| Fulfilment engine Map | **Fully Resolved** — `createSupabaseFulfilmentAggregateStore` |
| Tokens Map | **Fully Resolved** — `createSupabaseTokenStore` + `getByFulfilmentId` |
| Voucher pool / resource allocation Map | **Fully Resolved** — Supabase pool + generated-digital providers |
| Wallet ledger in-memory | **Fully Resolved** — `wallet_settle_*` via `createSupabaseLedgerRepository` |
| Redeem stub success | **Fully Resolved** — durable catalog/redemption/idempotency; stub removed |
| Partner validate/confirm stubs | **Fully Resolved** — engine + tokens wired; production `requireEngine` |
| Resource import `{ accepted: true }` | **Fully Resolved** — `importVoucherPoolCodes` |
| Phantom seed `f-1` query port in production | **Fully Resolved** — aggregate-backed query port + token store |
| Fraud 041 unwired | **Fully Resolved** — idempotency + replay + rate-limit Supabase stores |
| Jobs empty engine | **Fully Resolved** — jobs use `getSharedFulfilmentModule()` durable singleton |
| Catalog↔org reverse sync | **Fully Resolved** — `upsertPartner` creates/links `organisation` |
| Notifications side-effect Map | **Fully Resolved** — `createSupabaseNotificationInsertPort` |

### Post-implementation verification audit (strict, code-evidence)

| ID | Finding | First pass | After remediation |
|----|---------|------------|-------------------|
| V1 | Catalog GET/LIST empty in-memory while redeem uses Supabase | Partially Resolved | **Fully Resolved** — production wires `createSupabaseCatalogRepository` for queries + redeem |
| V2 | Redemption GET/LIST empty in-memory | Partially Resolved | **Fully Resolved** — `listByRider` + shared durable port |
| V3 | Token display missing token store | Partially Resolved | **Fully Resolved** — `tokenStore.getByFulfilmentId` wired into query port |
| V4 | Fake ok stubs on cancel/refund/confirm/consume | Partially Resolved | **Fully Resolved** — production fail-closed `unavailable` |
| V5 | Partner rewards/staff/settings/analytics empty | Partially Resolved | **Fully Resolved** — catalog/memberships/org/fulfilment-derived series |
| V6 | `platform_audit_record` unwired on cancel/refund | Deferred (optional) | **Fully Resolved** — best-effort append on success |
| V7 | Rate-limit TOCTOU | Partially Resolved | **Fully Resolved** — atomic RPC `046` + fallback |
| V8 | `SECURITY.md` missing durability notes | Partially Resolved | **Fully Resolved** |
| V9 | Process-local metrics counters | Deferred | **Deferred** — observability-only (plan out-of-scope) |
| V10 | AuthZ not live from `bundle_capability` | Deferred | **Deferred** — plan out-of-scope (M2) |

**Critical remaining: 0**  
**Partially Resolved remaining (runtime): 0**  
**Deferred (accepted): V9, V10**

Only after this gate:

→ Functional verification → UAT → production readiness testing.

---

## 8. Related docs

- Audit canvas: fulfilment durability audit (2026-07-29)
- Spec engine: `docs/superpowers/specs/2026-07-28-reward-fulfilment-engine-design.md`
- Migrations: `scripts/040`–`045`, `042`, `043`, `041`
