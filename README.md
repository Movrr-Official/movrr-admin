# MOVRR Admin Dashboard

MOVRR Admin Dashboard is the internal operations console for the MOVRR platform. It is a Next.js 16 + React 19 application that lets admin teams manage riders, campaigns, routes, rewards, waitlist approvals, notifications, and workboard operations from a single interface.

## Scope and business value

The dashboard addresses the core operational problems in MOVRR:

- Onboarding and governing users (admins, riders, advertisers, support/moderator roles).
- Running and monitoring campaign delivery.
- Planning, assigning, and validating rider routes.
- Tracking reward point accrual/redemption and catalog operations.
- Coordinating internal operations through the Workboard module.
- Managing system settings and controlled feature behavior.

In practice, operations teams use it to:

- Approve waitlist entries and convert approved leads into rider accounts.
- Create and manage campaigns and campaign zones/hot zones.
- Create route templates, assign routes to riders, and review route execution/compliance.
- Use route optimization APIs and record accept/reject decisions.
- Monitor reward balances and perform manual points adjustments.
- Send in-app notifications to all users, roles, or selected user IDs.

## Tech stack

- Framework: Next.js App Router (`app/`), TypeScript, React 19.
- UI: Tailwind CSS 4, Radix UI primitives, shadcn-style components, Recharts.
- Data and auth: Supabase (`@supabase/ssr`, `@supabase/supabase-js`).
- Client data orchestration: TanStack Query.
- Global UI/filter state: Redux Toolkit.
- Email: Resend + React Email templates.
- Maps: `react-map-gl` + MapLibre.
- Optional optimizer service: Flask + OR-Tools service under `services/route_optimizer_service`.

## Repository layout

- `app/`: pages, API routes, and server actions.
- `components/`: UI and domain components (users, campaigns, routes, rewards, workboard, waitlist).
- `hooks/`: query hooks and live-update hooks.
- `lib/`: environment validation, auth helpers, Supabase clients, logging, export utilities.
- `schemas/`: Zod schemas and typed contracts.
- `scripts/`: SQL scripts for core tables and features.
- `services/route_optimizer_service/`: independent Python optimization service.
- `docs/`: existing API notes (`optimize-api.md`).

## Core modules

- `Overview`: cross-domain KPIs and recent admin activity.
- `Waitlist`: list/filter waitlist records and approve/reject entries.
- `Users`: manage users, roles/status, reset emails, export data, delete with cascade safeguards.
- `Campaigns`: CRUD, status updates, route attachment, campaign selection RPC, zones/hot zones.
- `Routes`: route templates, assignments, compliance calculations, GPS trace review, optimizer integration.
- `Rewards`: transaction history, rider balances, manual point adjustments, reward catalog admin.
- `Notifications`: create and review notifications, with optional preference-respecting targeting.
- `Settings`: system/points/campaign-defaults/feature flags persisted in `platform_settings`.
- `Workboard`: internal kanban boards/cards with invite/member role controls.

## Authentication and authorization

- Supabase auth session is enforced in `AuthWrapper` and `proxy.ts`.
- Access requires a matching `admin_users` row.
- Main role model:
  - `super_admin`, `admin`: full dashboard modules.
  - `moderator`: routes + workboard.
  - `support`: notifications access in UI role matrix.
- Route/page gating is role-based through wrappers and sidebar nav filtering.

## Data model highlights

The app reads/writes Supabase tables used across operations, including:

- Identity/access: `user`, `admin_users`, `user_activity`, `audit_log`.
- Rider ops: `rider`, `rider_route`, `route`, `route_stop`, `route_tracking`, `impression_events`.
- Campaign ops: `campaign`, `campaign_assignment`, `campaign_signup`, `campaign_zone`, `campaign_hot_zone`, `advertiser`.
- Rewards: `reward_transactions`, `reward_redemptions`, `rider_reward_balance`, `reward_catalog`, `reward_partner`.
- Admin ops: `notifications`, `user_preferences`, `platform_settings`, `audit_log`/`audit_logs`.
- Workboard: `workboard_teams`, `workboard_team_members`, `workboard_boards`, `workboard_cards`, `workboard_invites`.
- Optimizer audit: `route_optimizer_runs`, `route_optimizer_decisions`.

## Integration with rider mobile app

The admin dashboard integrates with rider-side operations through shared backend data in Supabase:

- Route execution telemetry from `route_tracking` is used for live map locations and compliance analysis.
- Campaign delivery signals (`impression_events`, assignment tables) feed route and campaign admin views.
- Reward earning/spending tables (`reward_transactions`, `reward_redemptions`, `rider_reward_balance`) power reward ops.

This repository does not include the rider app code, but the integration boundary is the shared data model and tables consumed by dashboard actions/hooks.

## APIs and server actions

- Server actions in `app/actions/*` perform domain CRUD and aggregation.
- API routes in `app/api/*` provide health and optimizer proxy endpoints:
  - `/api/health`
  - `/api/optimize/health`
  - `/api/optimize/route`
  - `/api/optimize/penalties`
  - `/api/optimize/decision`
  - `/api/optimize/audit`

Optimizer routes require authenticated admin access and forward to the Python service with service token auth.

## Environment variables

Environment is validated in `lib/env.ts` with Zod. Required server-side values include:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Database/email: `DATABASE_URL`, `RESEND_API_KEY`, sender/admin emails.
- App config: `APP_URL`, `NEXT_PUBLIC_APP_URL`, map style URL(s).
- Optimizer: `ROUTE_OPTIMIZER_URL`, `ROUTE_OPTIMIZER_TOKEN` (or `ROUTE_OPTIMIZER_KEY`), optional previous-token settings.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Configure `.env` with required keys.

3. Run dev server:

```bash
npm run dev
```

4. Optional: run route optimizer service (`services/route_optimizer_service`) and point `ROUTE_OPTIMIZER_URL` to it.

## Build and run

```bash
npm run build
npm run start
```

## Additional documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md)
- [OPERATIONS.md](./OPERATIONS.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [docs/optimize-api.md](./docs/optimize-api.md)
