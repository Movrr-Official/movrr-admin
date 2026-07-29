# Reward Fulfilment Engine — Platform Design Specification

**Date:** 2026-07-28  
**Status:** Canonical architectural blueprint (approved)  
**Repos:** `movrr-admin` (platform backend + ops client), `movrr-mobile`, `movrr-app`  
**Type:** Enterprise platform capability — Fulfilment Engine + Platform API + Organisation/RBAC foundation  
**Not in scope:** Redesign of Rewards earning; rebuilding catalog/ledger that already works correctly

---

## 0. Vision & architectural overview

MOVRR today supports Browse → Redeem → **dead end** (`reward_redemptions.status = requested`). Points are deducted, but there is no orchestration for voucher issue, QR validation, partner collection, inventory reservation, refunds, or multi-client ops.

This specification introduces a **Fulfilment Engine** as the canonical orchestration layer between redemption and completion:

```
Browse → Redeem → Fulfilment Engine → Completion
```

Redemption becomes a generic financial commitment. Fulfilment becomes specialised by type through a strategy/provider architecture. All clients consume a single **Platform API** (`/api/v1/...`). Business rules live only in feature application services inside `movrr-admin`.

### Phase delivery (architecture once; handlers incremental)

| Slice | Deliverable |
|-------|-------------|
| **Foundation** | Identity, Organisations/Membership/RBAC, Platform API conventions, Wallet settlement, Rewards redeem commitment |
| **Engine** | Fulfilment domain, state machine, handler registry (all types registered), Instant Digital + QR/Barcode handlers, resources, tokens, fraud policies, jobs, tests |
| **Admin ops** | movrr-admin UI consumes Platform APIs for fulfilment ops, overrides, resource management |
| **Mobile** | movrr-mobile replaces post-redeem dead end with timelines, tokens/QR, voucher delivery, status |
| **Partner workspace** | movrr-app Reward Partner workspace (not a rider marketplace) on Organisation + Platform APIs |

---

## 1. Cross-repository architecture audit (baseline)

### 1.1 Current state

| Repository | Role today | Rewards/fulfilment gap |
|------------|------------|------------------------|
| **movrr-admin** | Next.js 16 + Supabase; APIs, server actions, catalog CRUD, ledger reads, admin adjust | No fulfilment orchestration; voucher columns unused; no reservation; no ops fulfilment workflow |
| **movrr-mobile** | Expo rider app; catalog shop; `redeem_reward_for_me` RPC; order history badges | Stops at `requested`; no voucher/QR UI; redeem via public RPC |
| **movrr-app** | Next.js rider/advertiser workspace; **read-only** points statement | No redeem; no partner fulfilment; roles only `rider` \| `advertiser` |

### 1.2 Reuse (do not rebuild)

- `reward_catalog`, `reward_partner`, `reward_redemptions`, `reward_transactions`, `rider_reward_balance`
- Atomic debit patterns / balance locking concepts in existing RPCs (retain as **internal** transaction helpers only)
- In-app `notifications` + mobile push pipeline
- Admin RBAC via `admin_users` (internal ops identity — retained)

### 1.3 Weaknesses addressed by this design

- No post-redeem lifecycle; no voucher/QR generation despite schema columns
- Inventory decrement without reservation; oversell risk
- Public business contract = Supabase RPCs (logic split / drift risk)
- No partner tenancy or collection confirmation path
- No compensating refund pathway as a first-class settlement model
- Duplicated or client-side eligibility assumptions; weak idempotency/replay story
- No Platform API; UI repos coupled to tables/RPCs

---

## 2. Platform architectural principles

Every future feature must follow these rules:

1. **Feature-first, bounded-context architecture** — the platform emerges from composed features, not a parallel `platform/` business layer.
2. **Dependencies always point inward** — Route Handlers → Application → Domain ← Infrastructure adapters. Feature modules may depend only on another feature’s public application contracts or published domain events. They must never import another feature’s infrastructure, repositories, persistence, or internal domain objects.
3. **Thin Platform API route handlers** — authN, principal resolution, capability guard, delegate to application service, map result to HTTP.
4. **Application layer owns business behaviour** — orchestration, rules, workflows, permissions evaluation consumption, fulfilment handlers.
5. **Domain layer owns business concepts and invariants** — aggregates, value objects, state enums, transition rules as domain concepts.
6. **Infrastructure owns persistence and external integrations** — repositories, SQL/RPC adapters, provider implementations.
7. **Database owns consistency and atomicity** — transactions, locking, constraints; never public business contracts.
8. **Platform API is the single public business contract** — `/api/v1/{domain}/...` for all first-party clients.
9. **API versions are immutable contracts** — breaking API changes require a new version (`/api/v2`, …); do not change the behaviour of an existing version in a breaking way.
10. **Authentication and authorisation are separate concerns** — Identity = who; Organisations/Admin RBAC = what.
11. **Features communicate only through public application contracts or domain events** — never another feature’s infrastructure, repositories, persistence, or domain internals.
12. **Shared `lib/` contains infrastructure only** — auth helpers, DB clients, transactions, errors, logging, telemetry, config — never business workflows.
13. **Default-deny security** — capabilities explicitly granted; unresolved capability ⇒ deny.
14. **Domain events are first-class immutable business facts** — past-tense statements of what has already occurred; published only after successful commit; remain meaningful even if implementation details evolve; sync today, async-ready.
15. **Application services own transaction orchestration; infrastructure owns transaction implementation.**
16. **Where async is introduced later, use domain events and compensating actions — not distributed transactions.**
17. **Application services are the exclusive entry point into business behaviour** — Rider, Partner, Admin, jobs, and future integrations invoke the same services/APIs; no client-specific business rules.
18. **The Fulfilment aggregate is the authoritative operational record for every redeemed reward** — no other context may directly manipulate Fulfilment state or owned entities.
19. **Background jobs are simply another client of the Platform** — same services, guards, and state machine; never direct persistence updates.
20. **Evolution without structural change** — new fulfilment types integrate through the existing handler registry, application contracts, and provider interfaces; extending the platform must not require structural changes to the Fulfilment Engine.
21. **Every new capability integrates into this architecture without structural refactor.**

---

## 3. System architecture & module boundaries

### 3.1 Bounded contexts (feature modules)

```
features/
  identity/          # JWT verify, principal resolution, request + audit + correlation context
  organisations/     # org types, membership, permission bundles, AuthorisationService
  rewards/           # catalog, redeem commitment, reward_redemptions
  wallet/            # balance/ledger queries, SettlementStrategy
  fulfilment/        # engine, SM, handlers, resources, tokens, timeline
  partners/          # Reward Partner profile + partner-facing application services
  notifications/     # reactive consumers of business events only
  analytics/         # metrics sink; event consumers only
  fraud/             # policy engine (idempotency, replay, rate limit, future risk)
  audit/             # first-class immutable audit capability (or cross-cutting service used by all)
```

Existing `app/actions/*` and Admin UI remain during migration but **must call feature application services** for new behaviour. Legacy public RPC contracts are retired behind feature flags.

### 3.2 Layering inside each feature

```
features/{context}/
  domain/                 # entities, VOs, invariants, domain events
  application/
    contracts/            # public interfaces, commands, queries, provider/strategy ports
    commands/             # command services (mutate)
    queries/              # query services (read models only)
  infrastructure/         # repositories, SQL/RPC, provider implementations (private)
```

### 3.3 Platform API

```
app/api/v1/
  rewards/
  fulfilment/
  wallet/
  partners/
```

- Versioned from day one (`/api/v1`).
- Production-ready endpoints only for domains required by the engine.
- Future domains (`campaigns`, `notifications`, …): folder/convention documentation only — **no empty placeholder routes**.
- **Versioning strategy:** `/api/v1` is an immutable public contract. Breaking changes require a new API version (e.g. `/api/v2`). Non-breaking additions to an existing version are allowed; behavioural breaking changes are not.

### 3.4 `lib/` (cross-cutting only)

Authentication primitives consumed by Identity, database access, transaction helpers, shared errors, logging/telemetry, configuration, HTTP utilities.

### 3.5 Dual identity model

| Principal | Store | Authorisation |
|-----------|-------|---------------|
| **AdminPrincipal** | `admin_users` + internal Admin RBAC | Internal MOVRR operations |
| **OrganisationPrincipal** | Organisation membership + permission bundles | External tenants (Reward Partner first) |
| **RiderPrincipal** | rider profile linked to auth user | Rider redeem/read capabilities |

- Clients send **Supabase access token** only — no second session system.
- Clients must **not** declare which principal type they are; Identity derives it.
- Internal staff are never tenant users; partner staff never require admin accounts.
- Permissions are **domain-oriented** (`fulfilment.validate`, `resources.manage`, …), not partner-specific names.
- Permissions resolved **once per request** onto `RequestContext`.

### 3.6 Request pipeline

```
Client (Bearer Supabase JWT)
  → Authentication (JWT verify)
  → Principal Resolution
  → Authorisation (capability set)
  → Capability Guard (default-deny)
  → Application Service (command or query)
  → Infrastructure (DB transaction / internal RPC where needed)
  → Domain Events (after successful commit)
  → Notifications / Analytics / Audit consumers
```

Correlation ID: generate or propagate on every request; flow through services, events, audit, logs, notifications, and jobs.

### 3.7 Dependency rule (inward only)

Dependencies always point inward:

```
Route Handlers → Application → Domain
                      ↓
              Infrastructure (adapters)
```

Cross-feature:

| Allowed | Forbidden |
|---------|-----------|
| Another feature’s `application/contracts` | Another feature’s `infrastructure/` |
| Published domain events (consume) | Another feature’s repositories / persistence |
| Shared `lib/` infrastructure | Another feature’s internal domain objects |

Example: Allowed — `fulfilment` → `wallet.application.contracts.SettlementService`.  
Forbidden — `fulfilment` → `wallet.infrastructure` or direct `reward_transactions` writes.

### 3.8 Aggregate ownership

| Aggregate / entity | Owning bounded context |
|--------------------|------------------------|
| `RewardRedemption` | Rewards |
| Catalog item (`reward_catalog`) | Rewards |
| `WalletTransaction` / ledger entry (`reward_transactions`) | Wallet |
| `RiderRewardBalance` | Wallet |
| `Fulfilment` | Fulfilment |
| `FulfilmentEvent` | Fulfilment |
| `FulfilmentToken` | Fulfilment |
| `FulfilmentResource` (+ items, allocations) | Fulfilment |
| `PartnerValidation` | Fulfilment |
| `Organisation` | Organisations |
| `OrganisationMembership` | Organisations |
| Permission bundle / capability grants | Organisations (external) / Identity+Admin RBAC (internal mapping) |
| Reward Partner business profile | Partners (profile) on Organisations (tenancy) |
| Audit record | Audit |
| Notification | Notifications |

### 3.9 Notifications & analytics

- **Notifications** consume events; never orchestrate workflows or mutate fulfilment.
- **Analytics** consume events as a metrics sink; business services do not embed analytics calls.
- **Fraud** returns decisions only; never mutates aggregates, transitions state, refunds, or allocates resources.

---

## 4. Domain model

### 4.1 Two aggregates, one commitment

| Aggregate | Domain | Responsibility |
|-----------|--------|----------------|
| **RewardRedemption** | Rewards | Financial/commercial commitment: rider, catalog item, points cost, ledger relationship, immutable commercial facts |
| **Fulfilment** | Fulfilment | Operational satisfaction: lifecycle, resources, tokens, partner interactions, timeline, completion |

**Core invariant:** every successful redemption immediately creates exactly one Fulfilment (`FulfilmentCreated`), even before processing begins.

Conceptual lifecycle:

```
RewardRedemptionCreated → FulfilmentCreated → FulfilmentStarted
  → … fulfilment events …
  → terminal outcome (Success | Cancelled | Failed | Expired | Refunded | Reversed)
```

### 4.2 Settlement (Wallet)

- Redeem = financial commitment: **immediate debit** via append-only ledger.
- Failure paths issue a **compensating refund** transaction — never mutate/delete the original debit.
- `SettlementStrategy` interface; canonical implementation: `ImmediateDebitCompensatingRefundStrategy`.
- No point holds / reserved balances unless a future requirement explicitly justifies them.
- Fulfilment **requests** settlement; Wallet **owns** how settlement occurs.

### 4.3 Fulfilment types (strategy key)

All registered from Phase 1:

`instant_digital` · `qr_barcode` · `physical_collection` · `physical_shipping` · `event_ticket` · `sweepstakes` · `donation` · `premium_feature`

Phase 1 **implemented** handlers: `instant_digital`, `qr_barcode`.  
All others resolve to `UnsupportedFulfilmentHandler` (structured business error).  
Catalog validation **prevents redeem** of unsupported types under normal operation; Unsupported is a misconfiguration safety net.

Handler registry is **immutable after application startup**.

### 4.4 Lifecycle state vs outcome vs rider progress

**Lifecycle states** (authoritative operational state):

`created` · `reserved` · `processing` · `ready` · `awaiting_collection` · `collected` · `dispatched` · `delivered` · `validated` · `completed` · `cancelled` · `failed` · `expired` · `refunded` · `reversed`

**Terminal outcome** (explicit business result for reporting/support):

`success` · `cancelled` · `failed` · `expired` · `refunded` · `reversed`

**Rider progress** (derived presentation model only), e.g.:

`preparing` · `ready` · `awaiting_collection` · `completed` · `unavailable`

Clients must not treat raw operational states as the sole UX contract; query services return progress + outcome + state.

Catalog availability (`draft` / `active` / …) remains on Rewards catalog — not on Fulfilment.

### 4.5 State machine authority

- `FulfilmentStateMachine` is the **only** component allowed to transition Fulfilment state.
- Handlers **request** transitions; SM validates legal edges, commits state, bumps **aggregate version**, appends `FulfilmentEvent`.
- Handlers never mutate `state` directly.
- Optimistic concurrency via `version` / revision on the Fulfilment aggregate.

### 4.6 Owned entities

```
Fulfilment
  id, redemption_id (unique 1:1), rider_id, catalog_item_id
  fulfilment_type, state, outcome?, version
  partner_org_id?, idempotency_key, expires_at?, completed_at?
  metadata (non-authoritative, non-sensitive only)

FulfilmentEvent                 # immutable canonical timeline
FulfilmentToken                 # qr | barcode | one_time_code | deep_link | short_code | nfc
FulfilmentResource              # generalised resource definition
FulfilmentResourceItem          # pool serials/codes
FulfilmentResourceAllocation    # available|reserved|fulfilled|released
PartnerValidation               # partner interaction log (validate, confirm, manual, failures)
FulfilmentAudit                 # security-sensitive ops (or via platform Audit)
```

**Metadata rule:** never drive business decisions from arbitrary metadata; business meaning uses typed fields/VOs.

**FulfilmentEvent** is append-only historical truth; aggregate is current state; events are never modified or deleted.

### 4.7 Fulfilment resources (generalised inventory)

Resource kinds include: `voucher_pool`, `generated_digital`, `physical_stock`, `event_allocation`, `partner_capacity`.

- Resource lifecycle is **independent** from fulfilment lifecycle; the engine coordinates the relationship.
- Allocation: `available` → `reserved` → `fulfilled` | `released`.
- Prevent overselling via transactional allocate with conditional updates / row locks in infrastructure.

**Instant Digital:** one handler; resource obtained via `FulfilmentResourceProvider` port:

| Provider | Phase 1 |
|----------|---------|
| `VoucherPoolResourceProvider` | Implemented — partner-supplied codes |
| `GeneratedDigitalResourceProvider` | Implemented — MOVRR-issued dynamic assets |
| `ExternalPartnerResourceProvider` | Interface defined only |

Providers are **infrastructure** behind application contracts (`ResourceAllocationService`).

### 4.8 Tokens

- Support QR, barcode, one-time code, deep link, short code, NFC-ready abstraction.
- Expiry, replay protection, revocation, one-time use, cryptographic randomness, audit history.
- Store hashes where feasible; authorised display endpoints only.
- **Tokens never change Fulfilment state directly.** Token ops publish events; handlers request SM transitions.

### 4.9 PartnerValidation

Partner interaction log covering validation attempts, collection confirmations, manual partner actions, decisions, failures, and device/context metadata — not QR-only.

### 4.10 Domain events (past-tense immutable facts)

Domain events represent **immutable business facts that have already occurred**. They remain meaningful even if implementation details, storage, or dispatch mechanisms evolve.

Examples: `RewardRedemptionCreated`, `FulfilmentCreated`, `FulfilmentStateChanged`, `FulfilmentResourceAllocated`, `FulfilmentTokenIssued`, `FulfilmentTokenConsumed`, `FulfilmentCompleted`, `FulfilmentCancelled`, `FulfilmentExpired`, `FulfilmentFailed`, `FulfilmentRefunded`, `WalletDebited`, `WalletRefunded`.

Published **only after successful transaction commit**. Avoid command-style event names.

### 4.11 Fulfilment authority principle

The Fulfilment aggregate is the authoritative operational record for every redeemed reward. All operational behaviour — lifecycle, resource allocation, token issuance, partner interactions, completion — flows through it. No other bounded context may directly manipulate Fulfilment state or owned entities.

---

## 5. Application services, APIs & Phase 1 handlers

### 5.1 Commands and queries (CQRS-lite)

- Command services mutate state; accept explicit commands (`RedeemRewardCommand`, `CancelFulfilmentCommand`, `RefundFulfilmentCommand`, `ConfirmCollectionCommand`, …).
- Query services return typed read models (`FulfilmentSummary`, `FulfilmentDetails`, `PartnerDashboardSummary`, `RiderWalletView`, …).
- Query services **never** trigger business behaviour.
- Do not expose aggregates directly over HTTP.
- **Read models** may aggregate information across bounded contexts for presentation purposes, but they must **never** become the source of business behaviour. Commands and domain aggregates remain authoritative.

### 5.2 Standard application results

Every application service returns a consistent result type covering:

`Success` · `BusinessFailure` · `ValidationFailure` · `PermissionFailure` · `ConcurrencyConflict` · `InfrastructureFailure`

No raw DB/exceptions across feature boundaries.

### 5.3 Key contracts

| Feature | Contracts |
|---------|-----------|
| Wallet | `SettlementService`, `WalletQueryService` |
| Rewards | `RedeemRewardService`, `CatalogQueryService`, `RedemptionQueryService` |
| Fulfilment | `FulfilmentEngine`, `FulfilmentQueryService`, `TokenService`, `ResourceAllocationService`, `PartnerInteractionService` |
| Organisations | `AuthorisationService`, `MembershipQueryService` |
| Identity | authenticate → `RequestContext` |
| Fraud | `FraudPolicyEngine` |
| Audit | `AuditService` (immutable records) |

### 5.4 Capabilities (examples)

`rewards.redeem` · `rewards.catalog.read` · `rewards.manage` · `fulfilment.read` · `fulfilment.cancel` · `fulfilment.refund` · `fulfilment.override` · `fulfilment.validate` · `fulfilment.confirm` · `resources.manage` · `wallet.read` · `staff.manage` · `analytics.view`

Capability checks before services; services still validate assumptions (defence-in-depth). Default-deny.

### 5.5 Platform API surface (Phase 1)

**`/api/v1/rewards`**

- `GET /catalog`, `GET /catalog/:id`
- `POST /redeem` (Idempotency-Key)
- `GET /redemptions`, `GET /redemptions/:id`

**`/api/v1/wallet`**

- `GET /balance`, `GET /transactions`
- No public raw debit API

**`/api/v1/fulfilment`**

- `GET /:id` (state + outcome + progress + version)
- `GET /:id/timeline`
- `GET /:id/token` (authorised display)
- `POST /:id/cancel`, `POST /:id/refund`
- `POST /tokens/consume`
- `POST /:id/confirm-collection`

**`/api/v1/partners`**

- Dashboard, pending fulfilments, validate, confirm collection
- Resources / pool import, partner-scoped rewards, staff, analytics, settings

Admin UI uses the **same** routes with AdminPrincipal. No parallel business APIs for the same actions.

### 5.6 Redeem orchestration

```
assertCapability(rewards.redeem)
FraudPolicyEngine.evaluate(idempotency + rate limit + …)
validate catalog (active + supported fulfilment_type)
Wallet.SettlementService.debit(...)
persist RewardRedemption
publish RewardRedemptionCreated (post-commit)
FulfilmentEngine.createFromRedemption(...)  // state=created, version=0
publish FulfilmentCreated
FulfilmentEngine.start(fulfilmentId)        // registry always resolves
return read models
```

On failure after debit: SM → failed/cancelled path + compensating `Wallet.refund`.

### 5.7 FulfilmentEngine (sole orchestrator)

- Only orchestration entry point for fulfilment workflows.
- Handlers execute type-specific behaviour; they do **not** orchestrate cross-feature workflows.
- Cross-feature coordination stays in the engine.
- Always resolves a handler (real or Unsupported).

### 5.8 Phase 1 — Instant Digital Delivery

`created` → allocate digital resource (pool or generated provider) → `processing` → deliver asset → `ready` → `completed` (outcome `success`).

Allocate/provider failure → `failed` → refund. Cancel/expire → release allocation when applicable → refund per policy.

### 5.9 Phase 1 — QR / Barcode Validation

`created` → reserve resource → `reserved` → issue secure token → `ready` / `awaiting_collection` → partner validate/consume (events) → `validated` → confirm collection → `collected` → `completed`.

Replay/consumed token cannot double-complete. Expiry → `expired` → release → refund per policy.

### 5.10 Idempotency & retry

- Platform-wide idempotency for externally repeatable mutations: redeem, cancel, refund, partner confirmation, token consumption.
- Transient infrastructure failures: retry per policy.
- Business failures: **never** auto-retried.
- Domain events emitted once, after commit, ordered, no duplicate publication under idempotent retries.

### 5.11 Client independence

Platform API is client-agnostic. movrr-mobile, movrr-app, and movrr-admin are different clients of the same capabilities.

---

## 6. Organisations & Partner workspace

### 6.1 Organisation model

- First-class **Organisation** with extensible types: `reward_partner`, `advertiser`, `government`, `movrr`, …
- Existing `reward_partner` rows become the **business profile** of a Reward Partner organisation — not the tenancy model.
- Membership roles: `owner`, `manager`, `staff`, `viewer` → map to **permission bundles** (not embedded permissions).
- Reward Partner implemented first; same membership infrastructure for future org types.

### 6.2 movrr-app Partner Workspace

Authenticated business platform workspace (not a second rider marketplace):

Dashboard · pending collections · QR validation · collection confirmation · fulfilment resources · rewards · staff · analytics · settings

All authorised via Organisation membership + Platform APIs.

---

## 7. Security, fraud, audit, observability

### 7.1 Security by default

Default-deny. Explicit capability grants. Unresolved capability ⇒ deny — for Admin, Organisation, and Rider principals.

### 7.2 Audit (first-class)

Immutable audit records for security-sensitive operations:

actor · capability · target entity · previous state · resulting state · correlation/request ID · timestamp · reason (where applicable)

Never editable.

### 7.3 Fraud policy engine (Phase 1 + extension)

Phase 1 policies: idempotency, replay protection, rate limiting (+ concurrency via aggregate version).

Architecture accommodates future: velocity, anomaly, abuse signals, risk scoring — without redesign.

Fraud evaluates and returns a decision; business domains act on it.

### 7.4 Observability

Structured logs, metrics, and tracing for: redemption, settlement, fulfilment, partner validation, token consumption, scheduled jobs, provider interactions.

Operational insight must not depend solely on audit records.

### 7.5 Operational health

Monitor: provider availability, resource pool exhaustion, scheduled job failures, retry backlog, fulfilment failure rate.

### 7.6 Store compliance

- Points are not cash; MOVRR does not process payments on redeem.
- Gift-card / real-world value disclosures retained in client UX where catalog requires.
- Sweepstakes/gambling-adjacent handlers not implemented in Phase 1; when added, require compliant flows before enablement.

---

## 8. Background jobs

Phase 1: scheduled jobs (e.g. Vercel cron → secured internal endpoints).

Jobs include:

- Expire fulfilments past `expires_at`
- Release stale resource reservations
- Retry transient infrastructure failures per policy

**Rules:**

1. Jobs are Platform clients — same application services, capability guards, state machine.
2. No direct persistence updates from jobs.
3. Job runs themselves are **idempotent** — repeated execution never duplicates business effects.

---

## 9. Client integration slices

### 9.1 movrr-admin (ops) — before customer clients

Consume `/api/v1` for timelines, cancel/refund/override, resource pool management, fulfilment workflows. No duplicate business actions in server actions.

### 9.2 movrr-mobile

- Migrate redeem to `POST /api/v1/rewards/redeem` behind **feature flag** (gradual rollout/rollback).
- Fulfilment details, progress, token/QR display, timeline, status.
- Retire public RPC as business contract after cutover; RPC may remain internal atomic helper only if required.

### 9.3 movrr-app

Reward Partner workspace on Organisation model + `/api/v1/partners` and shared fulfilment commands. Not a rider marketplace.

---

## 10. Testing strategy

| Area | Requirements |
|------|----------------|
| Unit | SM, handlers, providers, settlement, fraud policies, tokens |
| Application | Commands: redeem, cancel, refund, confirm, unsupported type, concurrency |
| API | `/api/v1` authz matrix, idempotency, version conflicts |
| Integration | Debit+redemption+fulfilment atomicity; compensating refund; reserve/release |
| State machine | Every legal transition; every illegal transition; every terminal state; every refund path |
| Authorisation matrix | Rider, Partner Staff/Manager/Owner, Admin, Super Admin — every command |
| Events | Once; post-commit only; ordering; no duplicates |
| Fraud/replay | Double redeem/consume; race on last pool item |
| Recovery | Provider failure/timeout; retry success; retry exhaustion; partial infra failure |
| Contracts | Cross-repo enum/capability alignment (extend Vitest contract style) |
| Clients | Thin API client tests only — no duplicated fulfilment business logic tests |

---

## 11. Performance objectives

Measurable goals from the outset (exact numeric SLOs may be tuned later):

- Predictable latency for common fulfilment operations (redeem, validate, confirm, timeline read)
- Bounded transaction duration for debit/allocate/consume paths
- Pagination for all collection endpoints
- No N+1 query patterns in query services
- Deterministic concurrency behaviour via optimistic locking
- Stateless API workers; immutable handler registry; no in-request global mutable business state

---

## 12. Feature flags & migration

- RPC → Platform API migration controlled by feature flags.
- Supports gradual rollout, rollback, and ops verification without risking existing rider redeem.
- After all clients migrate, simplify/remove public RPC surface; retain internal transactional SQL only where necessary for atomicity.

---

## 13. Definition of Done (production readiness)

The Fulfilment Engine is production-ready only when:

1. Platform API (`/api/v1`) is the single public business contract for fulfilment-related capabilities.
2. No fulfilment business logic exists in UI repositories (`movrr-mobile`, `movrr-app`, admin UI).
3. All fulfilment behaviour flows through application services and the Fulfilment state machine.
4. Security (default-deny), audit, and fraud policies are enforced consistently.
5. Background jobs use the same business pathways as synchronous requests and are idempotent.
6. Domain events, audit, logs, and correlation IDs provide complete traceability.
7. Observability and operational health monitoring are in place.
8. All architectural principles in this specification are satisfied.
9. Phase 1 handlers (Instant Digital, QR/Barcode) are production-ready; other types are registered via Unsupported.
10. Organisation/RBAC foundation supports Partner workspace without temporary auth paths.
11. Required automated tests (Section 10) pass.
12. Verification audit confirms no regressions to earn/ledger/catalog paths outside intentional migration.

---

## 14. Remaining risks (accepted for Phase 1)

- Cron expiry precision is not sub-second.
- Synchronous in-process event dispatch can add latency — keep consumers thin.
- `reward_partner` → Organisation profile backfill needs a careful data migration.
- Mobile cutover requires feature-flag discipline and monitoring.
- Exact numeric latency SLOs are intentionally deferred until baseline measurement in staging; qualitative performance objectives in Section 11 still apply from Phase 1.

---

## 15. Out of scope for Phase 1 implementation

- Full handler implementations beyond Instant Digital and QR/Barcode
- External partner API resource provider implementation
- Async message bus / distributed event infrastructure
- Point-hold settlement strategy
- Rider marketplace in movrr-app
- Sweepstakes, shipping carriers, NFC hardware integrations

These remain **designed-in** via types, contracts, and registry entries.

---

## 16. Non-goals (intentional architectural exclusions)

This architecture intentionally does **not**:

- Expose database tables directly to clients as a business interface
- Expose Supabase RPCs as the public business contract
- Duplicate business logic in client applications (`movrr-mobile`, `movrr-app`, admin UI)
- Couple fulfilment orchestration to a single reward type
- Couple partner tenancy to advertiser identity
- Embed fulfilment rules inside Rewards or Wallet aggregates
- Allow background jobs or UI layers to bypass application services
- Modify `/api/v1` behaviour in breaking ways instead of versioning
- Require structural Fulfilment Engine rewrites to add new fulfilment types

---

## 17. Architecture Decision Record (ADR) summary

| Topic | Decision |
|-------|----------|
| Scope | Design all fulfilment types; implement Instant Digital + QR first |
| Client order | Admin ops → mobile → movrr-app Partner workspace |
| movrr-app role | Reward Partner workspace, not rider marketplace |
| Inventory | Generalised fulfilment resources |
| Settlement | Immediate debit + compensating refund; settlement strategy interface |
| Public contract | Platform API `/api/v1`; RPCs internal-only if needed for atomicity |
| API versioning | Breaking changes require a new version; existing versions stay stable |
| API domains | Full rewards/fulfilment/wallet/partners; no empty stubs for others |
| Instant Digital | One handler; pool + generated providers; external interface defined |
| Tenancy | Generic Organisation + membership + permission bundles |
| Identity | Dual: admin_users vs Organisation; Supabase JWT; principal abstraction |
| Data model | Redemption ≠ Fulfilment; strict 1:1; fulfilment created immediately |
| Code organisation | Feature modules; no `lib/platform` business layer |
| Dependencies | Inward only; cross-feature via contracts/events only |
| Auth pipeline | AuthN → Principal → AuthZ → Capability Guard → Service |
| Events | First-class immutable past-tense facts; post-commit |
| SM | Sole mutator of fulfilment state; handlers request transitions |
| Evolution | New types via registry/contracts/providers — no engine structural change |
| Jobs | Platform clients; idempotent; same services |

---

## Appendix A — Repository structure (movrr-admin)

Intended layout (persistence remains Supabase SQL under `scripts/`, not Prisma):

```
movrr-admin/
  app/
    api/
      v1/
        rewards/
        fulfilment/
        wallet/
        partners/
        internal/          # secured job triggers, health (ops)
    # existing Admin UI routes continue to consume Platform APIs / feature services
  features/
    identity/
      domain/
      application/
        contracts/
        commands/
        queries/
      infrastructure/
    organisations/
    rewards/
    wallet/
    fulfilment/
    partners/
    notifications/
    analytics/
    fraud/
    audit/
  lib/                     # cross-cutting infrastructure only
  schemas/                 # Zod contracts shared at edges (migrate toward features over time)
  scripts/                 # SQL migrations, internal RPCs (atomicity helpers)
  __tests__/               # unit, application, API, contract, fraud, SM tests
  docs/
    superpowers/
      specs/
      plans/
```

Each feature follows the same inward dependency rule: `application` → `domain`; `infrastructure` implements ports defined in `application/contracts`.

---

## Document control

**Authors:** Collaborative design (Product Architecture + Engineering)  
**Status:** Canonical architectural blueprint — single reference for implementation plans, migration plans, and feature work  
**Review:** Architecture review complete; documentation refinements incorporated  
**Next:** Implementation planning (`docs/superpowers/plans/…`)  
**Supersedes:** Ad-hoc redeem-to-requested lifecycle as the end state of redemption
