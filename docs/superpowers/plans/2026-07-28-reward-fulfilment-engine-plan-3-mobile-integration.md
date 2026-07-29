# Reward Fulfilment Engine — Plan 3: movrr-mobile Integration & Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the post-redemption dead end in movrr-mobile with Platform API–driven redeem, fulfilment timelines, progress presentation, voucher/token/QR display, and status — behind a feature flag for safe cutover from `redeem_reward_for_me`.

**Architecture:** Mobile remains a thin client. Add a Platform API client that sends the Supabase access token to movrr-admin `/api/v1`. Map Plan 1 read models to UI. **No fulfilment state machine or settlement logic on device.**

**Tech Stack:** Expo 54, Expo Router, TanStack Query, Supabase auth session, existing wallet screens.

**Spec:** `docs/superpowers/specs/2026-07-28-reward-fulfilment-engine-design.md` §9.2, §12  
**Depends on:** Plan 1 (APIs) + Plan 2 recommended for ops validation before wide mobile rollout  
**Programme:** `docs/superpowers/plans/2026-07-28-reward-fulfilment-engine-programme.md`  
**Repo:** `movrr-mobile`

## Global Constraints

- Business rules stay on Platform API — mobile only presents read models and sends commands
- Feature flag controls RPC vs `/api/v1/rewards/redeem` (gradual rollout / rollback)
- Use rider progress + outcome from API; do not re-derive operational state machines
- Token/QR display only from authorised `GET .../token`; never invent codes client-side
- Offline: redeem remains online-only; clear error if offline
- App Store / Play: keep “MOVRR does not process payments”; points ≠ cash
- No duplicated earning formula changes in this plan
- Commit in movrr-mobile repo after each task

---

## File structure (units of change)

| Path | Responsibility |
|------|----------------|
| `lib/platform/client.ts` | Bearer JWT fetch to `EXPO_PUBLIC_ADMIN_API_URL` `/api/v1` |
| `lib/platform/types.ts` | DTO types for fulfilment/rewards/wallet read models |
| `features/rewards/services/platformRewards.ts` | redeem, catalog, redemptions, fulfilment queries via API |
| `features/rewards/services/rewards.ts` | Feature-flagged redeem path; deprecate public RPC usage |
| `features/rewards/hooks/useFulfilment.ts` | Detail/timeline/token queries |
| `app/(rider)/wallet/order-detail.tsx` | Fulfilment detail + timeline + QR/voucher |
| `app/(rider)/wallet/order-history.tsx` | Wire navigation to detail |
| `app/(rider)/wallet/_layout.tsx` | Register order-history + order-detail |
| `app/(rider)/wallet/rewards-shop.tsx` | Post-redeem navigate to detail; flag-gated redeem |
| `app/(rider)/wallet/index.tsx` | Same redeem cutover |
| `features/profile/services/notificationRouting.ts` | Deep-link to fulfilment detail when id present |
| `lib/config/env.ts` / feature flags | `platformRedeemEnabled` (or reuse live flags) |
| Tests under mobile test layout (Jest/Vitest as repo uses) | Client mapping + flag behaviour |

---

### Task 1: Platform API client (Supabase JWT bearer)

**Files:**
- Create: `lib/platform/client.ts`, `lib/platform/types.ts`
- Modify: `lib/config/env.ts` if needed to expose admin API base consistently
- Test: unit test for header attachment + error mapping

**Interfaces:**
- Consumes: session `access_token` from Supabase
- `platformFetch(path, { method, body, idempotencyKey })`
- Base URL: `config.adminApiUrl` → `/api/v1/...`

- [ ] **Step 1: Failing test** — Authorization Bearer set; 401 surfaced; correlation header

- [ ] **Step 2–4: Implement + pass**

- [ ] **Step 5: Commit** `feat(mobile): add Platform API client with Supabase JWT`

---

### Task 2: Feature-flagged redeem via Platform API

**Files:**
- Create: `features/rewards/services/platformRewards.ts`
- Modify: `features/rewards/services/rewards.ts` (`redeemRewardCatalogItem`)
- Modify: flag source (`getFeatureFlags` / remote config / `EXPO_PUBLIC_PLATFORM_REDEEM`)

**Interfaces:**
- Flag ON → `POST /api/v1/rewards/redeem` with `Idempotency-Key`
- Flag OFF → existing `redeem_reward_for_me` (temporary)
- Map API failures to existing toast status unions where possible

- [ ] **Step 1: Failing test** for flag branching

- [ ] **Step 2: Implement dual path; invalidate queries on success**

- [ ] **Step 3: On success, return fulfilment id for navigation**

- [ ] **Step 4: Commit** `feat(mobile): feature-flag Platform API redeem path`

---

### Task 3: Order detail screen — timeline, progress, voucher/QR

**Files:**
- Create: `app/(rider)/wallet/order-detail.tsx`
- Create: `features/rewards/hooks/useFulfilment.ts`
- Create: UI component for QR/code display (e.g. `components/rewards/FulfilmentTokenCard.tsx`) — use a maintained QR lib if needed
- Modify: `app/(rider)/wallet/_layout.tsx` — register `order-history`, `order-detail`
- Modify: `app/(rider)/wallet/order-history.tsx` — `onPress` → detail with id

**Interfaces:**
- `GET /api/v1/fulfilment/:id` → state, outcome, progress, presentation fields
- `GET /api/v1/fulfilment/:id/timeline`
- `GET /api/v1/fulfilment/:id/token` when ready (authorised)

- [ ] **Step 1: Detail screen renders progress + timeline from API**

- [ ] **Step 2: Show voucher code / QR when token payload present; empty state when preparing**

- [ ] **Step 3: Screenshot/security copy: token is one-time / show to partner only (UX copy, not business logic)**

- [ ] **Step 4: Commit** `feat(mobile): add fulfilment detail with timeline and token display`

---

### Task 4: Post-redeem navigation + shop/wallet wiring

**Files:**
- Modify: `app/(rider)/wallet/rewards-shop.tsx`, `app/(rider)/wallet/index.tsx`

- [ ] **Step 1: After successful redeem, navigate to `order-detail` with fulfilment id (prefer over only opening partnerUrl)**

- [ ] **Step 2: Keep partnerUrl as secondary action if API/read model provides it — do not treat as fulfilment completion**

- [ ] **Step 3: Gate shop entry with `rewardsShopEnabled` if flag exists**

- [ ] **Step 4: Commit** `feat(mobile): route riders into fulfilment detail after redeem`

---

### Task 5: Notification & deep-link targeting

**Files:**
- Modify: `features/profile/services/notificationRouting.ts`
- Modify: `features/profile/hooks/usePushNotifications.ts` as needed
- Coordinate with Plan 1 notification payloads including `fulfilmentId` when present

**Interfaces:**
- If `fulfilmentId` in notification data → `/(rider)/wallet/order-detail?id=`
- Else legacy → wallet home

- [ ] **Step 1: Extend resolver + tests**

- [ ] **Step 2: Commit** `feat(mobile): deep-link reward notifications to fulfilment detail`

---

### Task 6: Types cleanup + map legacy redemption statuses

**Files:**
- Modify: `types/index.ts`
- Modify: `features/rewards/services/rewards.ts` mappers

- [ ] **Step 1: Align client types with Platform read models (progress/outcome/state) while tolerating legacy list rows during flag-off**

- [ ] **Step 2: Prefer Platform `GET /api/v1/rewards/redemptions` for order history when flag on**

- [ ] **Step 3: Commit** `refactor(mobile): align redemption types with Platform fulfilment read models`

---

### Task 7: Cutover verification & RPC retirement checklist

- [ ] **Step 1: Test matrix** — flag off (RPC), flag on (API); Instant Digital + QR catalogue items; insufficient points; offline redeem error; token display; notification open

- [ ] **Step 2: Document ops flag rollout steps in `docs/` or CONTRIBUTING note in mobile repo**

- [ ] **Step 3: After stable rollout, open follow-up to remove public RPC call path (RPC may remain server-internal per spec)**

- [ ] **Step 4: Commit** `docs(mobile): record Platform redeem cutover verification`

---

## Spec coverage (Plan 3)

| Spec item | Task |
|-----------|------|
| Replace post-redeem dead end | 3–4 |
| Platform redeem + feature flag | 2, 7 |
| Timeline / token / QR | 3 |
| Notification deep links | 5 |
| No client business rules | all |
| Store compliance copy retained | 3–4 |

## Out of scope (Plan 3)

- Partner validation UI (Plan 4)
- Admin ops (Plan 2)
- Implementing new fulfilment types
- Offline redeem queue

---

**Plan 3 saved.** Execution after Plans 1–2 (ops validation recommended before enabling flag broadly).
