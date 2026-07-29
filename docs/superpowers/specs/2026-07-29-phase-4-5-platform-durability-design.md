# Phase 4.5 — Platform Durability & Persistence Remediation

**Date:** 2026-07-29  
**Status:** Approved direction (implementation plan follows)  
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

| Layer | Production wiring today |
|-------|-------------------------|
| AuthN + organisations | Supabase (`040`/`045` + membership lookup) |
| Fulfilment engine / tokens / resources | Process-local `Map`s |
| Wallet settlement | In-memory ledger (ignores `042` RPCs) |
| Redeem | Stub success when `seed` absent |
| Partner validate / confirm / pools | Stubs / empty arrays |
| Fraud / idempotency / replay | In-memory or unused (`041` unwired) |
| Jobs (expire / release) | Real auth, empty engine |

Architectural work (handlers, SM, authz, routes) largely exists. Gap is **adapter wiring**.

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

Only after a **second durability audit** returns clean Criticals:

→ Functional verification → UAT → production readiness testing.

---

## 8. Related docs

- Audit canvas: fulfilment durability audit (2026-07-29)
- Spec engine: `docs/superpowers/specs/2026-07-28-reward-fulfilment-engine-design.md`
- Migrations: `scripts/040`–`045`, `042`, `043`, `041`
