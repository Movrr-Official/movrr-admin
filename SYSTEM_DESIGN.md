# System Design

## Purpose

This document describes how data and control flow through Movrr Admin Dashboard, from UI interactions to backend processing and persistence.

## Runtime topology

- Browser client (React components, TanStack Query, Redux).
- Next.js server runtime (server components, server actions, API routes, proxy).
- Supabase services:
  - Auth (session + admin user provisioning)
  - Postgres (operational entities)
  - Realtime subscriptions (workboard and route-tracking update patterns)
- Optional route optimizer service (Flask/OR-Tools), called only via Next.js admin API proxy.

## Request and interaction patterns

### 1) Page load and role gating

1. Request enters Next.js and session cookies are available.
2. `AuthWrapper` and/or `proxy.ts` fetch the current Supabase user.
3. `admin_users` table is queried to resolve role.
4. Unauthorized users are redirected to `/auth/signin` or `/unauthorized`.
5. Authorized users receive page + role-filtered navigation.

### 2) Read path (dashboard data)

1. Client hook (`hooks/use*`) invokes a server action (or returns mock data in mock mode).
2. Server action uses `createSupabaseAdminClient()` for DB queries.
3. Action maps DB rows into schema-conformant UI objects.
4. Hook caches data in TanStack Query.

Examples:

- `useUsersData` -> `getUsers` + campaign joins for advertiser stats.
- `useRouteData` -> `getRoutes` for rider-route aggregates.
- `useRewardStats` -> `getRewardStats` for awards/redeems trends.

### 3) Write path (admin mutation)

1. UI action triggers server action/API route.
2. Zod schema validates input.
3. Action performs one or more writes to Supabase tables.
4. `revalidatePath()` invalidates affected routes.
5. Client hooks refetch or query cache updates reflect changes.

Examples:

- Approving waitlist entry writes to `waitlist`, creates auth user, inserts `user`.
- Manual points adjustment writes `reward_transactions` or `reward_redemptions` and updates `rider_reward_balance`.
- Campaign zone upsert writes to `campaign_zone` with geometry payload.

## Domain data model (operational view)

### Identity and admin control

- `auth.users` (Supabase-managed)
- `user` (application profile)
- `admin_users` (admin role membership)
- `admin_access_logs` (access audit)

### Rider and route execution

- `rider`, `rider_route`, `route`, `route_stop`
- `route_tracking` (GPS path snapshots/telemetry)
- `impression_events` (delivery proof events)

### Campaign lifecycle

- `campaign`, `advertiser`
- `campaign_assignment`, `campaign_signup`
- `campaign_zone`, `campaign_hot_zone`

### Rewards economy

- `reward_transactions`
- `reward_redemptions`
- `rider_reward_balance`
- `reward_catalog`, `reward_partner`, `reward_catalog_sync_log`

### Internal operations

- `notifications`, `user_preferences`
- `admin_settings`
- `audit_log` or `audit_logs` (dual-table fallback in code)
- `workboard_*` tables (team/member/board/card/invite)

### Optimizer auditing

- `route_optimizer_runs`
- `route_optimizer_decisions`

## Integration with rider mobile operations

Integration is table-driven and backend-mediated:

- Rider execution telemetry in `route_tracking` is consumed by admin maps and compliance calculations.
- Reward ledger data (`reward_transactions`, `reward_redemptions`, `rider_reward_balance`) is surfaced and administratively adjusted from dashboard.
- Campaign/route assignment entities (`campaign_assignment`, `rider_route`) reflect operational dispatch and completion states.

The admin dashboard does not call rider-device APIs directly in this repository; it operates over shared backend persistence.

## Route optimizer design

### Request flow

1. UI component prepares optimization payload (locations + optional context).
2. `/api/optimize/penalties` optionally builds edge penalties.
3. `/api/optimize/route` validates payload, enforces size/time limits, forwards to optimizer service with bearer token.
4. Proxy persists sanitized request/response telemetry to `route_optimizer_runs`.
5. Admin accepts/rejects result via `/api/optimize/decision`; decision persisted to `route_optimizer_decisions`.

### Reliability controls

- Request body size caps.
- Location count caps.
- Upstream timeout (10s).
- Trace ID propagation.
- Service unavailability behavior exposed to UI.

## Settings and feature-control design

Settings are grouped and persisted by key in `admin_settings`:

- `system`
- `points`
- `campaignDefaults`
- `featureFlags`

`SettingsPage` edits these through schema validation and key-based upserts.

## Data consistency and cache behavior

- Server actions return normalized DTO-like objects.
- Query hooks use bounded stale/gc times and keyed filters.
- Mutations generally call `revalidatePath`, then query refetch reconciles client state.
- Workboard additionally uses Supabase realtime channels for near-live board/card updates.

## Health and diagnostics design

- `/api/health` checks:
  - DB readability (`user`, `reward_catalog`)
  - Resend domain listing
- `lib/logger.ts` provides structured console output with environment-level filtering.
- Optimizer service exposes `/health` and `/metrics` and writes structured logs.
