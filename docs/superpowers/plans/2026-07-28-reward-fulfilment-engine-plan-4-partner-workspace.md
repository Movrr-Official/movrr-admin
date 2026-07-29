# Reward Fulfilment Engine — Plan 4: movrr-app Reward Partner Workspace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reward Partner workspace to movrr-app as an authenticated business surface (not a rider marketplace) that authenticates via Organisation membership and consumes `/api/v1/partners` and shared fulfilment commands for dashboard, pending collections, QR validation, collection confirmation, resources, rewards, staff, analytics, and settings.

**Architecture:** Mirror advertiser workspace patterns (role nav + pages + components) but **do not** invent local tenancy. Session resolves OrganisationPrincipal capabilities via Platform API (`/api/v1/partners/me`). All mutations are Platform API calls with Supabase JWT. UI hides actions the API would deny; server remains authoritative.

**Tech Stack:** Next.js 16, existing dashboard shell (`PageShell`, `Sidebar`), Zod schemas, server-side fetch to Platform API (prefer RSC/route handlers that forward cookies/JWT — avoid embedding service-role fulfilment writes).

**Spec:** `docs/superpowers/specs/2026-07-28-reward-fulfilment-engine-design.md` §6, §9.3  
**Depends on:** Plan 1 (orgs + `/api/v1/partners`) + Plan 2 (partner orgs can be provisioned in Admin)  
**Programme:** `docs/superpowers/plans/2026-07-28-reward-fulfilment-engine-programme.md`  
**Repo:** `movrr-app`

## Global Constraints

- Not a second rider marketplace — no rider redeem shop in this plan
- Organisation membership + domain capabilities from Platform — no partner-specific permission names in UI code beyond capability checks returned by API
- No fulfilment business logic in movrr-app
- Extend product session to support partner staff without requiring `admin_users`
- Reuse existing visual language / dashboard chrome
- Breaking API needs would be Plan 1 changes — stop and escalate per programme rules
- Commit in movrr-app after each task

---

## File structure (units of change)

| Path | Responsibility |
|------|----------------|
| `lib/constants.ts`, `schemas/user.ts`, `lib/appUser.ts` | Allow partner session; load org membership context from Platform or linked profile |
| `lib/platform/client.ts` | Server-side Platform API client (JWT from session) |
| `schemas/partner.ts` | Partner dashboard DTOs (presentation) |
| `services/partner.ts` | Thin wrappers calling `/api/v1/partners/*` (no SQL fulfilment) |
| `app/actions/partner.ts` | Form actions that call Platform API then `revalidatePath` |
| `components/partner/*` | Dashboard widgets, collections table, validate scanner UI, staff table |
| `components/layout/Sidebar.tsx` | `partner` nav map |
| `app/dashboard/layout.tsx` | Allow partner in `requireProductSession` |
| `app/dashboard/page.tsx` | Partner branch |
| `app/dashboard/collections/page.tsx`, `[id]/page.tsx` | Pending collections |
| `app/dashboard/validate/page.tsx` | QR/code validation |
| `app/dashboard/resources/page.tsx` | Fulfilment resources |
| `app/dashboard/rewards/page.tsx` | Extend gate for partner catalog management |
| `app/dashboard/staff/page.tsx` | Membership management |
| `app/dashboard/analytics/page.tsx` | Partner analytics read models |
| `app/dashboard/settings/page.tsx` | Partner settings branch |
| Tests | Session gate + client mapping; no engine unit tests here |

---

### Task 1: Partner session + Platform client

**Files:**
- Modify: `lib/constants.ts`, `schemas/user.ts`, `lib/appUser.ts`, `app/dashboard/layout.tsx`, `app/unauthorized` flows
- Create: `lib/platform/client.ts`
- Test: session rejects non-member; accepts org member linked to reward_partner org

**Interfaces:**
- Product role may be `partner` **or** retain base user role while membership is discovered via Platform `GET /api/v1/partners/me` (prefer API as source of partner context to avoid duplicating org tables in movrr-app)
- Recommended: user can sign in; if `/partners/me` succeeds, enable partner workspace shell

- [ ] **Step 1: Decide session shape (document in code comment): `partnerContext` from Platform me endpoint**

- [ ] **Step 2: Implement Platform client forwarding Supabase session access token**

- [ ] **Step 3: Layout allows partner context; unauthorized when no membership**

- [ ] **Step 4: Commit** `feat(app): add partner session context via Platform API`

---

### Task 2: Sidebar + partner dashboard home

**Files:**
- Modify: `components/layout/Sidebar.tsx`, `app/dashboard/page.tsx`
- Create: `components/partner/PartnerOverview.tsx`
- Create: `services/partner.ts` → `getPartnerDashboard()`

**Interfaces:**
- `GET /api/v1/partners/me` and dashboard summary read model
- Nav: Dashboard, Collections, Validate, Resources, Rewards, Staff, Analytics, Settings

- [ ] **Step 1: Add partner nav map**

- [ ] **Step 2: Dashboard cards from API (pending count, failure rate presentation fields only)**

- [ ] **Step 3: Commit** `feat(app): add partner dashboard shell and navigation`

---

### Task 3: Pending collections + confirm

**Files:**
- Create: `app/dashboard/collections/page.tsx`, `app/dashboard/collections/[id]/page.tsx`
- Create: `components/partner/CollectionsTable.tsx`, `CollectionDetail.tsx`
- Create: actions calling `POST /api/v1/fulfilment/:id/confirm-collection` or `/api/v1/partners/collections/confirm`

- [ ] **Step 1: List pending from `GET /api/v1/partners/fulfilments/pending`**

- [ ] **Step 2: Detail + Confirm Collection (Idempotency-Key)**

- [ ] **Step 3: Handle already confirmed / concurrency errors from API**

- [ ] **Step 4: Commit** `feat(app): partner pending collections and confirmation`

---

### Task 4: QR / code validation UI

**Files:**
- Create: `app/dashboard/validate/page.tsx`
- Create: `components/partner/ValidateTokenForm.tsx` (manual code entry + optional camera later)
- Wire: `POST /api/v1/partners/validate` / `POST /api/v1/fulfilment/tokens/consume`

- [ ] **Step 1: Manual code validation form (Phase 1); camera optional stretch**

- [ ] **Step 2: Show API success/failure reasons; never local accept/reject rules**

- [ ] **Step 3: Commit** `feat(app): partner token validation against Platform API`

---

### Task 5: Resources + partner rewards management

**Files:**
- Create: `app/dashboard/resources/page.tsx`
- Extend: `app/dashboard/rewards/page.tsx` for partner gate + management UI
- Components for pool counts / import if API supports partner resource manage capability

- [ ] **Step 1: Resources list/read models**

- [ ] **Step 2: Import/manage codes when `resources.manage` present (hide otherwise)**

- [ ] **Step 3: Partner-scoped rewards list/edit via API**

- [ ] **Step 4: Commit** `feat(app): partner resources and rewards management UI`

---

### Task 6: Staff management

**Files:**
- Create: `app/dashboard/staff/page.tsx`
- Create: `components/partner/StaffTable.tsx`, invite/role dialogs
- Actions → Platform staff endpoints (`staff.manage`)

- [ ] **Step 1: List members + roles from API**

- [ ] **Step 2: Invite / change role / revoke — API only**

- [ ] **Step 3: Viewer cannot see manage controls (capability from me endpoint)**

- [ ] **Step 4: Commit** `feat(app): partner staff management via Organisation membership APIs`

---

### Task 7: Analytics + settings

**Files:**
- Extend: `app/dashboard/analytics/page.tsx` (partner branch)
- Extend: `app/dashboard/settings/page.tsx` (partner branch)
- `GET /api/v1/partners/analytics`, settings GET/PATCH

- [ ] **Step 1: Analytics cards from API sink read models**

- [ ] **Step 2: Settings form patches via API**

- [ ] **Step 3: Commit** `feat(app): partner analytics and settings`

---

### Task 8: Programme end-to-end verification

- [ ] **Step 1: Provision partner org in Admin (Plan 2) → partner user signs into movrr-app**

- [ ] **Step 2: Mobile redeem QR reward → appears in pending → validate → confirm → mobile shows completed**

- [ ] **Step 3: Instant Digital path: mobile shows code; partner not required**

- [ ] **Step 4: Authz: viewer cannot confirm; staff can validate; owner can manage staff**

- [ ] **Step 5: Confirm no direct Supabase writes to fulfilment tables from movrr-app**

- [ ] **Step 6: Document verification results; commit** `test(app): partner workspace end-to-end verification notes`

---

## Spec coverage (Plan 4)

| Spec item | Task |
|-----------|------|
| Partner workspace surfaces | 2–7 |
| Organisation membership / RBAC | 1, 6 |
| Platform API only | all |
| Not rider marketplace | global |
| Validate + confirm collection | 3–4 |
| Resources / rewards / staff / analytics / settings | 5–7 |
| Full programme E2E | 8 |

## Out of scope (Plan 4)

- Advertiser/Government org types beyond Reward Partner
- ExternalPartnerResourceProvider implementation
- Native camera QR as hard requirement (manual entry sufficient for Phase 1)
- Rider marketplace features

---

**Plan 4 saved.** Final phase of the sequential programme.
