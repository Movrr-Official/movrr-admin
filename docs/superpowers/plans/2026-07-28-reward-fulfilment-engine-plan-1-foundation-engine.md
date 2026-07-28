# Reward Fulfilment Engine — Plan 1: Platform Foundation + Engine Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Identity, Organisations/RBAC, Wallet settlement, Rewards redeem commitment, and the Fulfilment Engine (all types registered; Instant Digital + QR/Barcode implemented) behind `/api/v1` Platform APIs in `movrr-admin`.

**Architecture:** Feature-first bounded contexts under `features/*`. Thin `app/api/v1/*` handlers. Application owns behaviour; SQL/RPC only for atomicity. Redemption 1:1 Fulfilment; immediate debit + compensating refund; handler registry + resource providers.

**Tech Stack:** Next.js 16, React 19, Supabase (Auth + Postgres), Zod, Vitest, existing `lib/supabase-admin.ts` / JWT verification patterns.

**Spec:** `docs/superpowers/specs/2026-07-28-reward-fulfilment-engine-design.md`

## Plan series (do not collapse into one PR mega-merge)

| Plan | Scope | Repo |
|------|--------|------|
| **1 (this)** | Foundation + Engine + `/api/v1` + jobs + tests | movrr-admin |
| **2** | Admin ops UI consuming Platform APIs | movrr-admin |
| **3** | Mobile redeem cutover + fulfilment UX | movrr-mobile |
| **4** | Partner workspace | movrr-app (+ admin org APIs if gaps) |

## Global Constraints

- Spec is canonical — do not invent alternate architecture
- Dependencies inward only; cross-feature via `application/contracts` or domain events only
- `lib/` = infrastructure only — no business workflows
- Platform API versioned `/api/v1`; no empty placeholder domain routes
- Default-deny capabilities; dual identity (`admin_users` vs Organisation membership)
- Settlement: immediate debit + compensating refund; no point holds
- State transitions only via `FulfilmentStateMachine`
- Domain events post-commit, past-tense
- Jobs invoke same application services; never direct table updates
- Unsupported fulfilment types blocked at catalog redeem validation; `UnsupportedFulfilmentHandler` as safety net
- Persist via Supabase SQL in `scripts/` (not Prisma)
- Verify with `npm test`, `npm run typecheck` after each task group
- Commit after each task

---

## File structure (units of change)

| Path | Responsibility |
|------|----------------|
| `features/identity/**` | JWT verify, principal resolution, RequestContext, correlation ID |
| `features/organisations/**` | Organisation, membership, permission bundles, AuthorisationService |
| `features/audit/**` | Immutable AuditService |
| `features/fraud/**` | FraudPolicyEngine (idempotency, replay, rate limit) |
| `features/wallet/**` | SettlementStrategy, balance/ledger queries |
| `features/rewards/**` | Catalog query, RedeemRewardCommand, redemptions |
| `features/fulfilment/**` | Engine, SM, handlers, resources, tokens, queries |
| `features/partners/**` | Partner profile + partner command/query services |
| `features/notifications/**` | Event consumers → in-app notifications |
| `features/analytics/**` | Event metrics sink (minimal Phase 1) |
| `lib/http/**`, `lib/events/**`, `lib/result/**` | Cross-cutting infra (result type, event bus sync, HTTP helpers) |
| `app/api/v1/**` | Thin route handlers |
| `app/api/v1/internal/**` | Secured job endpoints |
| `scripts/040_*.sql` … | Org, fulfilment, idempotency, resources schema |
| `__tests__/features/**` | Unit/application/SM/fraud/API tests |

---

### Task 1: Shared result type + sync domain event bus

**Files:**
- Create: `lib/result/ApplicationResult.ts`
- Create: `lib/events/DomainEventBus.ts`
- Create: `lib/events/types.ts`
- Test: `__tests__/features/platform/resultAndEvents.test.ts`

**Interfaces:**
- Produces: `ApplicationResult<T>`, `DomainEventBus.publish/subscribe`, `DomainEvent` base `{ name, occurredAt, correlationId, payload }`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { ok, fail } from "@/lib/result/ApplicationResult";
import { DomainEventBus } from "@/lib/events/DomainEventBus";

describe("ApplicationResult", () => {
  it("discriminates success and failure", () => {
    expect(ok({ id: "1" }).ok).toBe(true);
    expect(fail("validation", "bad").ok).toBe(false);
  });
});

describe("DomainEventBus", () => {
  it("does not deliver to subscribers until flushAfterCommit", async () => {
    const bus = new DomainEventBus();
    const spy = vi.fn();
    bus.subscribe("WalletDebited", spy);
    bus.enqueue({ name: "WalletDebited", occurredAt: new Date().toISOString(), correlationId: "c1", payload: {} });
    expect(spy).not.toHaveBeenCalled();
    await bus.flushAfterCommit();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run __tests__/features/platform/resultAndEvents.test.ts`

- [ ] **Step 3: Implement minimal `ApplicationResult` and `DomainEventBus`**

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/result lib/events __tests__/features/platform/resultAndEvents.test.ts
git commit -m "feat(platform): add ApplicationResult and post-commit domain event bus"
```

---

### Task 2: Identity — JWT auth + principal resolution + request context

**Files:**
- Create: `features/identity/domain/Principal.ts`
- Create: `features/identity/application/contracts/AuthenticateRequest.ts`
- Create: `features/identity/application/commands/authenticateRequest.ts`
- Create: `features/identity/infrastructure/supabaseJwtVerifier.ts`
- Create: `lib/http/correlationId.ts`
- Test: `__tests__/features/identity/authenticateRequest.test.ts`

**Interfaces:**
- Produces: `RequestContext { principal, correlationId, permissions: Capability[], audit }`
- Principals: `AdminPrincipal | OrganisationPrincipal | RiderPrincipal`
- Consumes: Supabase JWT verification (reuse project JWT/secret patterns)

- [ ] **Step 1: Write failing tests** for: valid rider JWT → RiderPrincipal; admin_users row → AdminPrincipal; org membership → OrganisationPrincipal; missing/invalid JWT → failure; client cannot self-declare principal type

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement verifier + `authenticateRequest` (resolve from DB records only)**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** `feat(identity): resolve AuthenticatedPrincipal from Supabase JWT`

---

### Task 3: Organisations schema + membership + AuthorisationService

**Files:**
- Create: `scripts/040_organisations_rbac.sql`
- Create: `features/organisations/domain/*`
- Create: `features/organisations/application/contracts/AuthorisationService.ts`
- Create: `features/organisations/application/commands/*` (create org, add member, assign bundle)
- Create: `features/organisations/infrastructure/*`
- Modify: map existing `reward_partner` → profile on org type `reward_partner` (migration backfill)
- Test: `__tests__/features/organisations/authorisation.test.ts`

**Interfaces:**
- Produces: `assertCapability(ctx, capability)`, permission bundles for owner/manager/staff/viewer
- Capabilities include: `fulfilment.validate`, `fulfilment.confirm`, `resources.manage`, `rewards.manage`, `analytics.view`, `staff.manage`, `rewards.redeem`, `fulfilment.read`, …

- [ ] **Step 1: Write failing authorisation matrix tests** (staff can validate; viewer cannot manage resources; unresolved capability denies)

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: SQL migration + AuthorisationService (default-deny)**

- [ ] **Step 4: Backfill script: one Organisation per existing `reward_partner` + profile link

- [ ] **Step 5: Tests PASS**

- [ ] **Step 6: Commit** `feat(organisations): add multi-tenant org membership and capability RBAC`

---

### Task 4: AuditService + FraudPolicyEngine (Phase 1 policies)

**Files:**
- Create: `scripts/041_platform_audit_idempotency.sql`
- Create: `features/audit/**`
- Create: `features/fraud/application/contracts/FraudPolicyEngine.ts`
- Create: `features/fraud/infrastructure/policies/{idempotency,replay,rateLimit}.ts`
- Test: `__tests__/features/fraud/fraudPolicies.test.ts`, `__tests__/features/audit/auditService.test.ts`

**Interfaces:**
- `FraudDecision = allow | deny(reason)`
- Idempotency store keyed by `(principalId, scope, key)` → prior result replay
- Audit records immutable insert-only

- [ ] **Step 1: Failing tests** — duplicate idempotency key returns same success payload; replay of consumed jti denied; audit insert cannot update

- [ ] **Step 2–4: Implement + pass**

- [ ] **Step 5: Commit** `feat(platform): add audit capability and fraud policy engine`

---

### Task 5: Wallet settlement (debit + compensating refund)

**Files:**
- Create: `features/wallet/application/contracts/SettlementService.ts`
- Create: `features/wallet/application/commands/settleDebit.ts`, `settleRefund.ts`
- Create: `features/wallet/infrastructure/ledgerRepository.ts` (wraps atomic SQL/RPC internally)
- Create: `scripts/042_wallet_settlement_helpers.sql` (if new RPC needed; keep internal)
- Test: `__tests__/features/wallet/settlement.test.ts`

**Interfaces:**
- `SettlementService.debit({ riderId, points, redemptionId, correlationId })`
- `SettlementService.refund({ riderId, points, fulfilmentId, reason, correlationId })`
- Append-only ledger; never mutate prior debit row

- [ ] **Step 1: Failing tests** — debit reduces balance; refund credits without deleting debit; overdraft → BusinessFailure; concurrent debit protected

- [ ] **Step 2–4: Implement ImmediateDebitCompensatingRefundStrategy + pass**

- [ ] **Step 5: Commit** `feat(wallet): add settlement service with compensating refunds`

---

### Task 6: Fulfilment schema + domain model + state machine

**Files:**
- Create: `scripts/043_fulfilment_engine.sql` (fulfilment, events, tokens, resources, allocations, partner_validation, version)
- Create: `features/fulfilment/domain/states.ts`, `transitions.ts`, `Fulfilment.ts`, `outcome.ts`, `progress.ts`
- Create: `features/fulfilment/application/FulfilmentStateMachine.ts`
- Test: `__tests__/features/fulfilment/stateMachine.test.ts`

**Interfaces:**
- `FulfilmentStateMachine.requestTransition(fulfilment, to, reason, expectedVersion)`
- Illegal transition → failure; legal → new state + version++ + event append intent

- [ ] **Step 1: Write exhaustive SM tests** — every legal edge for instant_digital + qr_barcode; illegal edges; terminal states; refund paths

```ts
it.each([
  ["created", "processing"],
  ["processing", "ready"],
  ["ready", "completed"],
])("allows instant digital %s → %s", (from, to) => { /* ... */ });

it("rejects completed → ready", () => { /* expect fail */ });
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement states, transition table, SM**

- [ ] **Step 4: PASS + Commit** `feat(fulfilment): add schema and authoritative state machine`

---

### Task 7: Resource providers + TokenService

**Files:**
- Create: `features/fulfilment/application/contracts/FulfilmentResourceProvider.ts`
- Create: `features/fulfilment/application/contracts/ResourceAllocationService.ts`
- Create: `features/fulfilment/infrastructure/providers/VoucherPoolResourceProvider.ts`
- Create: `features/fulfilment/infrastructure/providers/GeneratedDigitalResourceProvider.ts`
- Create: `features/fulfilment/application/contracts/ExternalPartnerResourceProvider.ts` (interface only)
- Create: `features/fulfilment/application/commands/tokenService.ts`
- Test: `__tests__/features/fulfilment/resourcesAndTokens.test.ts`

**Interfaces:**
- `allocate({ fulfilmentId, resourceId }) → reserved item/asset`
- `release` / `fulfil`
- Token: issue (hash stored), consume (one-time), revoke; publish events only (no direct state mutate)

- [ ] **Step 1: Failing tests** — pool allocate last item wins once; generated returns unique code; double consume → already_consumed; token does not set fulfilment.state

- [ ] **Step 2–4: Implement + pass**

- [ ] **Step 5: Commit** `feat(fulfilment): add resource providers and secure token service`

---

### Task 8: Handler registry + Instant Digital + QR handlers + Unsupported

**Files:**
- Create: `features/fulfilment/application/contracts/FulfilmentHandler.ts`
- Create: `features/fulfilment/application/handlers/InstantDigitalHandler.ts`
- Create: `features/fulfilment/application/handlers/QrBarcodeHandler.ts`
- Create: `features/fulfilment/application/handlers/UnsupportedFulfilmentHandler.ts`
- Create: `features/fulfilment/application/HandlerRegistry.ts` (immutable after `freeze()`)
- Create: `features/fulfilment/application/FulfilmentEngine.ts`
- Test: `__tests__/features/fulfilment/handlers.test.ts`, `engine.test.ts`

**Interfaces:**
- `FulfilmentEngine.createFromRedemption`, `start`, `onTokenConsumed`, `cancel`, `refund`, `confirmCollection`
- Registry always resolves; Unsupported returns structured `fulfilment_type_not_implemented`

- [ ] **Step 1: Failing tests** for Instant Digital happy path; QR validate→confirm→complete; unsupported start fails safely; registry immutable after freeze

- [ ] **Step 2–4: Implement handlers requesting SM transitions only; engine orchestrates wallet/resources**

- [ ] **Step 5: Commit** `feat(fulfilment): add engine, handler registry, instant digital and QR handlers`

---

### Task 9: Rewards RedeemRewardService (commitment + create fulfilment)

**Files:**
- Create: `features/rewards/application/commands/redeemReward.ts`
- Create: `features/rewards/application/contracts/RedeemRewardCommand.ts`
- Modify: catalog to include `fulfilment_type` + resource binding (`scripts/044_catalog_fulfilment_type.sql`)
- Test: `__tests__/features/rewards/redeemReward.test.ts`

**Interfaces:**
- Orchestration per spec §5.6: capability → fraud → catalog validate (supported type) → wallet debit → redemption → fulfilment create/start → post-commit events

- [ ] **Step 1: Failing tests** — successful redeem creates 1:1 fulfilment; unsupported type blocked before debit; idempotent redeem; insufficient points; failure after debit refunds

- [ ] **Step 2–4: Implement + pass**

- [ ] **Step 5: Commit** `feat(rewards): redeem creates financial commitment and fulfilment`

---

### Task 10: Platform API `/api/v1` routes (rewards, wallet, fulfilment, partners)

**Files:**
- Create: `lib/http/platformRoute.ts` (auth → principal → authz → guard → map ApplicationResult → HTTP)
- Create: `app/api/v1/rewards/catalog/route.ts`, `redeem/route.ts`, `redemptions/route.ts`, …
- Create: `app/api/v1/wallet/balance/route.ts`, `transactions/route.ts`
- Create: `app/api/v1/fulfilment/[id]/route.ts`, `timeline/route.ts`, `token/route.ts`, `cancel/route.ts`, `refund/route.ts`, `confirm-collection/route.ts`
- Create: `app/api/v1/fulfilment/tokens/consume/route.ts`
- Create: `app/api/v1/partners/**` (me, pending, validate, resources, staff, analytics, settings)
- Create: query read models under `features/*/application/queries/*`
- Test: `__tests__/features/api/v1.authz.matrix.test.ts`, `v1.idempotency.test.ts`

**Interfaces:**
- HTTP never contains business rules; returns read models only
- Capability matrix covered for Rider / Partner Staff / Manager / Owner / Admin

- [ ] **Step 1: Failing API/authz tests** (use route handler invocation or integration harness)

- [ ] **Step 2–4: Implement thin handlers + read models + pass**

- [ ] **Step 5: Commit** `feat(api): expose /api/v1 rewards wallet fulfilment partners`

---

### Task 11: Notifications + analytics event consumers (reactive)

**Files:**
- Create: `features/notifications/application/handlers/onFulfilmentEvents.ts`
- Create: `features/analytics/application/handlers/onFulfilmentMetrics.ts`
- Wire subscriptions at app composition/bootstrap
- Test: `__tests__/features/notifications/fulfilmentNotifications.test.ts`

**Interfaces:**
- Consumers only; never call FulfilmentEngine to mutate
- Map events → in-app notification rows (reuse `notifications` table patterns)

- [ ] **Step 1–4: Test emit → notification row; analytics counter; no reverse dependency**

- [ ] **Step 5: Commit** `feat(platform): wire fulfilment events to notifications and analytics sinks`

---

### Task 12: Scheduled jobs (expire + release + retry) as Platform clients

**Files:**
- Create: `features/fulfilment/application/commands/expireFulfilments.ts`, `releaseStaleReservations.ts`, `retryTransientInfrastructure.ts`
- Create: `app/api/v1/internal/jobs/fulfilment-expire/route.ts` (and siblings)
- Modify: `vercel.json` cron entries
- Test: `__tests__/features/fulfilment/jobs.idempotent.test.ts`

**Interfaces:**
- Internal auth (shared secret / service principal) still goes through commands + SM
- Running expire twice is a no-op after first success

- [ ] **Step 1–4: Implement + prove idempotency**

- [ ] **Step 5: Commit** `feat(fulfilment): add idempotent scheduled expiry and reservation release jobs`

---

### Task 13: Composition root — freeze handler registry + observability hooks

**Files:**
- Create: `features/fulfilment/infrastructure/composeFulfilmentModule.ts`
- Create: `lib/observability/fulfilmentMetrics.ts` (structured log fields + basic counters)
- Document health signals: pool exhaustion, job failure, fulfilment failure rate (log/metric hooks)
- Test: `__tests__/features/fulfilment/composition.test.ts` (registry frozen; all types registered)

- [ ] **Step 1–4: Bootstrap registers all 8 types; freeze; metrics helpers used by engine**

- [ ] **Step 5: Commit** `feat(fulfilment): compose immutable handler registry and observability hooks`

---

### Task 14: Verification suite gate

**Files:** ensure coverage across `__tests__/features/**`

- [ ] **Step 1: Run** `npm test` — all green
- [ ] **Step 2: Run** `npm run typecheck` — clean
- [ ] **Step 3: Manually verify** against DoD checklist in spec §13 (engine items; UI clients deferred to Plans 2–4)
- [ ] **Step 4: Commit** `test(fulfilment): complete plan-1 verification gate` (if any test fixes) or document results in PR

---

## Spec coverage checklist (Plan 1)

| Spec area | Task(s) |
|-----------|---------|
| Identity / JWT / principal | 2 |
| Organisations / RBAC | 3 |
| Audit / correlation (via RequestContext) | 2, 4 |
| Fraud policies | 4 |
| Wallet settlement | 5 |
| Fulfilment SM / schema / events | 6, 1 |
| Resources / tokens | 7 |
| Handlers / engine / unsupported | 8, 13 |
| Redeem orchestration | 9 |
| `/api/v1` | 10 |
| Notifications / analytics reactive | 11 |
| Jobs | 12 |
| Observability | 13 |
| Admin UI / mobile / partner UX | Plans 2–4 |

## Self-review notes

- No placeholder endpoints for non-Phase-1 domains
- No `lib/platform` business layer
- Providers are infrastructure; engine uses contracts
- Follow-on plans required before claiming full platform DoD (client consumption)

---

## Execution handoff

**Plan 1 complete and saved to** `docs/superpowers/plans/2026-07-28-reward-fulfilment-engine-plan-1-foundation-engine.md`.

**Follow-on plans to write next (separate files):**
- Plan 2 — Admin ops UI
- Plan 3 — movrr-mobile integration
- Plan 4 — movrr-app Partner workspace

**Two execution options for Plan 1:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

**Which approach?** Also confirm whether you want Plans 2–4 written now before any coding starts.
