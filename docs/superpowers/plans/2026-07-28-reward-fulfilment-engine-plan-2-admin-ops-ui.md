# Reward Fulfilment Engine — Plan 2: movrr-admin Operations UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend movrr-admin so operators manage fulfilments, resource pools, organisations/partners, cancel/refund/override, and timelines exclusively through `/api/v1` Platform APIs — validating the engine before customer-facing clients.

**Architecture:** Thin Admin UI client. New ops pages under `/rewards/*` follow existing AuthWrapper + table/drawer patterns. A small `lib/platformApi` (or `features/*/ui` fetch helpers) calls `/api/v1` with the admin session JWT/cookie. **No new business rules** in server actions; legacy reward actions remain only for non-migrated earning/adjust surfaces until explicitly moved.

**Tech Stack:** Next.js 16 App Router, React Query hooks, existing shadcn/DataTable/PageHeader patterns, fetch to `/api/v1` (same pattern as `useAuditLogsData` / suggested-routes).

**Spec:** `docs/superpowers/specs/2026-07-28-reward-fulfilment-engine-design.md` §9.1  
**Depends on:** Plan 1 complete (`/api/v1/rewards|wallet|fulfilment|partners` live)  
**Programme:** `docs/superpowers/plans/2026-07-28-reward-fulfilment-engine-programme.md`

## Global Constraints

- All fulfilment/ops mutations go through `/api/v1` — never duplicate engine logic in `app/actions`
- Reuse existing design system / rewards chrome — no redesign
- AdminPrincipal capabilities only (`fulfilment.*`, `resources.manage`, `rewards.manage`, `staff.manage`, …)
- Show fulfilment **state + outcome + derived progress**; never invent client-side state machines
- Correlation ID: send/propagate `X-Correlation-Id` on Platform API calls
- Verify: `npm run typecheck`, `npm test`; smoke ops flows manually
- Commit after each task

---

## File structure (units of change)

| Path | Responsibility |
|------|----------------|
| `lib/platformApi/client.ts` | Authenticated fetch to `/api/v1`, error→toast mapping, correlation ID |
| `lib/platformApi/types.ts` | Zod/TS read models mirroring Plan 1 API DTOs (client-side only) |
| `hooks/useFulfilmentOpsData.ts` | React Query for fulfilment list/detail/timeline |
| `hooks/useResourcePoolsData.ts` | Resource pool queries/mutations |
| `hooks/useOrganisationsData.ts` | Org/partner/staff ops queries |
| `app/rewards/fulfilment/page.tsx` | Fulfilment queue |
| `app/rewards/fulfilment/[id]/page.tsx` | Detail: timeline, actions |
| `app/rewards/resource-pools/page.tsx` | Pool management / import |
| `app/rewards/organisations/page.tsx` | Organisations list |
| `app/rewards/partners/page.tsx` | Reward Partner orgs |
| `app/rewards/partners/[id]/page.tsx` | Partner profile + staff |
| `components/rewards/fulfilment/*` | Tables, drawers, action dialogs |
| `components/layout/Sidebar.tsx` | Optional secondary nav / keep in-page links |
| `__tests__/ui/platformApiClient.test.ts` | Client mapping/error handling (no business rules) |

---

### Task 1: Platform API client for Admin UI

**Files:**
- Create: `lib/platformApi/client.ts`
- Create: `lib/platformApi/types.ts`
- Test: `__tests__/ui/platformApiClient.test.ts`

**Interfaces:**
- Consumes: Plan 1 `/api/v1` JSON shapes
- Produces: `platformGet/Post(path, options)` returning typed results or structured errors (`PermissionFailure`, `ConcurrencyConflict`, …)

- [ ] **Step 1: Write failing test** for mapping 409 concurrency → `ConcurrencyConflict`; 403 → permission error; attaches correlation header

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement client using same-origin credentials (admin session)**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat(admin): add Platform API client for ops UI`

---

### Task 2: Fulfilment ops queue + detail

**Files:**
- Create: `app/rewards/fulfilment/page.tsx`, `app/rewards/fulfilment/[id]/page.tsx`
- Create: `components/rewards/fulfilment/FulfilmentQueueTable.tsx`, `FulfilmentDetailPanel.tsx`, `FulfilmentTimeline.tsx`
- Create: `hooks/useFulfilmentOpsData.ts`
- Modify: `app/rewards/RewardsOverview.tsx` or create page — link “Fulfilment ops”
- Modify: `components/layout/Sidebar.tsx` only if needed (prefer in-page link from `/rewards` to avoid nav redesign)

**Interfaces:**
- `GET /api/v1/fulfilment?status=&type=` (if list endpoint missing from Plan 1, add thin list query in Plan 1 follow-up **only** via application query service — do not put filtering logic in UI)
- `GET /api/v1/fulfilment/:id`, `GET /api/v1/fulfilment/:id/timeline`

- [ ] **Step 1: Confirm Plan 1 exposes admin list query**; if not, add `FulfilmentQueryService.listForOps` + `GET /api/v1/fulfilment` in movrr-admin (application layer only) before UI

- [ ] **Step 2: Build queue page with filters (state, type, partner) — presentation only**

- [ ] **Step 3: Detail page shows state, outcome, progress, version, timeline events**

- [ ] **Step 4: Typecheck + smoke**

- [ ] **Step 5: Commit** `feat(admin): add fulfilment operations queue and detail views`

---

### Task 3: Cancel, refund, override actions

**Files:**
- Create: `components/rewards/fulfilment/FulfilmentActionsDialog.tsx`
- Extend: `hooks/useFulfilmentOpsData.ts` mutations
- Test: optional RTL smoke or contract that POST bodies match commands

**Interfaces:**
- `POST /api/v1/fulfilment/:id/cancel`
- `POST /api/v1/fulfilment/:id/refund`
- Override uses same endpoints with admin capabilities + reason field
- Send `Idempotency-Key` and handle 409 version conflicts (reload detail)

- [ ] **Step 1: Wire cancel/refund dialogs calling Platform API only**

- [ ] **Step 2: On ConcurrencyConflict, refetch and show “state changed” message**

- [ ] **Step 3: Verify no `app/actions` mutation for these flows**

- [ ] **Step 4: Commit** `feat(admin): wire fulfilment cancel and refund via Platform API`

---

### Task 4: Resource pool management UI

**Files:**
- Create: `app/rewards/resource-pools/page.tsx`
- Create: `components/rewards/resources/ResourcePoolTable.tsx`, `ImportPoolCodesDialog.tsx`
- Create: `hooks/useResourcePoolsData.ts`

**Interfaces:**
- Partner/admin resource endpoints from Plan 1 (`/api/v1/partners/.../resources` or admin-capable fulfilment resource routes)
- Import codes → pool provider; show available/reserved/fulfilled counts from read models

- [ ] **Step 1–3: List pools, import CSV/codes, show exhaustion warnings (presentation of API health fields)**

- [ ] **Step 4: Commit** `feat(admin): add fulfilment resource pool management UI`

---

### Task 5: Organisations & Reward Partner ops UI

**Files:**
- Create: `app/rewards/organisations/page.tsx`
- Create: `app/rewards/partners/page.tsx`, `app/rewards/partners/[id]/page.tsx`, `app/rewards/partners/create/page.tsx`
- Create: `components/rewards/organisations/*`, `components/rewards/partners/*`
- Create: `hooks/useOrganisationsData.ts`

**Interfaces:**
- Create Reward Partner organisation + link profile (Plan 1 org APIs / partners APIs)
- Manage staff membership (owner/manager/staff/viewer) via Platform API — no local permission math beyond hiding buttons the API would 403

- [ ] **Step 1: Org list + partner create/edit**

- [ ] **Step 2: Partner detail — staff invite/role change**

- [ ] **Step 3: Catalog create/edit gains fulfilment_type + resource binding fields via Platform/catalog API (or migrate catalog upsert to API)**

- [ ] **Step 4: Commit** `feat(admin): add organisation and reward partner operations UI`

---

### Task 6: Catalog alignment for fulfilment_type

**Files:**
- Modify: `components/rewards/RewardCatalogPanel.tsx`, create/edit forms under `app/rewards/catalog/create`
- Modify: hooks to read/write `fulfilment_type` + resource config through Platform API where Plan 1 exposes it

- [ ] **Step 1: Require fulfilment_type on active catalog items in UI validation mirroring API**

- [ ] **Step 2: Block selecting unsupported types with clear copy (API remains source of truth)**

- [ ] **Step 3: Commit** `feat(admin): align catalog forms with fulfilment types and resources`

---

### Task 7: Navigation + ops smoke verification

**Files:**
- Modify: `app/rewards/RewardsOverview.tsx` — tabs/links to Fulfilment, Resource Pools, Partners
- Optional: Sidebar secondary entries only if overview links insufficient

- [ ] **Step 1: Add clear ops entry points from `/rewards`**

- [ ] **Step 2: Manual smoke:** list fulfilment → open detail → cancel/refund on test data → import pool codes → create partner org

- [ ] **Step 3: `npm run typecheck`**

- [ ] **Step 4: Commit** `feat(admin): link fulfilment ops surfaces from rewards overview`

---

## Spec coverage (Plan 2)

| Spec item | Task |
|-----------|------|
| Admin consumes same Platform APIs | 1–5 |
| No UI business rules / SM | all |
| Resource management | 4 |
| Manual overrides cancel/refund | 3 |
| Org/partner ops foundation | 5 |
| Validate engine before mobile | programme order |

## Out of scope (Plan 2)

- movrr-mobile / movrr-app UI
- New fulfilment handler types
- Redesign of Rewards earning/adjust ledger UX (may keep existing actions until a later migration)

---

**Plan 2 saved.** Execution starts only after programme approval and Plan 1 completion.
