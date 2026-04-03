# Architecture

## System context

Movrr Admin Dashboard is a server-rendered and client-interactive admin application built on Next.js App Router. It sits in front of Supabase and an optional route optimizer microservice.

High-level components:

- Web UI (React client components + shadcn/Radix UI).
- Server actions and route handlers (Next.js runtime).
- Supabase (Auth, Postgres, Realtime).
- Resend (transactional email).
- Route optimizer service (Flask, OR-Tools), accessed through admin API proxies.

## Layered architecture

1. Presentation layer

- Located in `app/*`, `components/*`.
- Page modules: dashboard, users, campaigns, routes, rewards, waitlist, notifications, settings, workboard.
- Maps and analytics: Recharts + MapLibre components.

2. Application/service layer

- Located in `app/actions/*` and `app/api/*`.
- Server actions perform data retrieval, CRUD, derived calculations, and mutation workflows.
- API handlers support health endpoints, access logging, and optimizer proxying.

3. Data access layer

- `lib/supabase-admin.ts`: service-role client for privileged operations.
- `lib/supabase-server.ts` and `supabase/server.ts`: cookie-backed SSR session clients.
- `lib/supabase-client.ts` and `supabase/client.ts`: browser clients.

4. Contract layer

- `schemas/*` defines typed Zod schemas for users, riders, campaigns, routes, rewards, notifications, settings, and audit records.

## Auth and access control architecture

- Auth session via Supabase cookies.
- `proxy.ts` initializes session handling and validates root-path admin access (`admin_users` lookup).
- `AuthWrapper` protects pages and enforces allowed roles.
- `lib/admin.ts` centralizes `requireAdmin()` and authenticated admin lookup.
- Navigation visibility is role-filtered in `components/layout/Sidebar.tsx`.

Role model used in code:

- `super_admin`, `admin`, `moderator`, `support` (admin-space roles).
- Core role constants in `lib/authPermissions.ts`.

## Domain architecture

### Users and identity

- Primary profile table: `user`.
- Auth user lifecycle handled through Supabase Admin API in `app/actions/users.ts`.
- Admin membership via `admin_users`.

Identity bootstrap rule:

- `auth.users` creation triggers bootstrap `public.user` and role-dependent shell rows (`rider`, `advertiser`) through the database trigger.
- Application code may enrich or update those rows after creation, but it must not perform a second direct bootstrap insert for the same auth user.
- Auth creation metadata must match the trigger contract, especially `server_assigned_role`, `full_name`, and any role-specific fields that are available at creation time.
- Workflow-specific completeness requirements belong in application validation, not in the shared auth trigger.
- Advertiser onboarding is a dedicated domain flow and should not be bootstrapped from the generic admin user creation page.

### Waitlist and onboarding

- Waitlist lifecycle in `app/actions/waitlist.ts`.
- Approved entries can be converted to auth user + `user` row.

### Campaign operations

- Campaign CRUD and filtering in `app/actions/campaigns.ts`.
- Campaign selection uses RPC: `run_campaign_selection`.
- Spatial targeting entities: `campaign_zone`, `campaign_hot_zone`.

### Route operations

- Route templates and assignment: `route`, `rider_route`, `route_stop`.
- Compliance metrics derived from `route_tracking` and route metadata.
- Route detail workflows include approval/rejection/status updates and exports.

### Rewards and catalog

- Rewards accounting: `reward_transactions`, `reward_redemptions`, `rider_reward_balance`.
- Catalog management: `reward_catalog`, `reward_partner`.
- Manual adjustment flow guarded against negative balances.

### Notifications

- Admin notification broadcasting and history from `notifications` and `user_preferences`.
- Supports targeting all users, role-based groups, or explicit user IDs.

### Workboard

- Team/board/card model with membership roles and invite flow.
- Realtime update subscriptions are consumed in `app/workboard/WorkboardPage.tsx`.

## Route optimizer architecture

- Frontend route optimization UI: `components/routes/RouteOptimizer.tsx`.
- Admin API proxy endpoints under `/api/optimize/*`:
  - request validation
  - timeout handling
  - token forwarding
  - run/decision persistence to audit tables
- Python service in `services/route_optimizer_service` exposes:
  - `/health`, `/metrics`, `/optimize`, `/decision`, `/audit/previous-token-usage`

## State and data-fetch strategy

- TanStack Query handles async data and cache invalidation in hooks.
- Redux handles UI and filter state (sidebar, filters, search, maintenance, etc.).
- Many hooks support mock-mode fallbacks when enabled and not production.

## Observability architecture

- Structured logger in `lib/logger.ts` with environment-based levels.
- `/api/health` checks database and email service availability.
- Trusted dashboard-entry monitoring is session-based: first protected page access after login writes `user_activity` and `audit_log` records from the server auth layer.
- Optimizer run/decision telemetry is persisted and queryable.

## Notable architectural constraints

- `next.config.mjs` sets `typescript.ignoreBuildErrors: true`; type errors do not fail production builds by default.
- Data model naming is mixed (`snake_case` and legacy/camel-like columns in SQL history scripts), so action mappings must stay explicit.
- App relies heavily on service-role Supabase client for admin actions; environment security is therefore critical.
