# Security

## Security model overview

MOVRR Admin Dashboard is a privileged admin application with service-role database access on the server side. Security depends on strict auth gating, protected runtime secrets, rider JWT validation on mobile ingest APIs, and careful server-action boundaries.

## Authentication and authorization controls

- Supabase auth sessions are used for user identity.
- Edge middleware (`middleware.ts` → `proxy.ts`) enforces admin membership for dashboard routes.
- Rider mobile ingest (`/api/sessions/*`) bypasses admin cookies; **Bearer JWT + session ownership** is enforced in route handlers (`lib/riderSessionAuth.ts`).
- Page and API access is guarded through:
  - `AuthWrapper` role checks
  - `requireAdminRoles()` in server actions/routes
  - middleware/proxy role verification for dashboard access
- Admin membership is validated against `admin_users` table.
- Read-only roles: `compliance_officer`, `government` (view-only; mutations require `admin`/`super_admin`/`moderator`).

## Secret management requirements

Never expose these values to the browser/client bundles:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ROUTE_OPTIMIZER_TOKEN` / `ROUTE_OPTIMIZER_KEY`
- `MAINTENANCE_JOB_TOKEN` / `CRON_SECRET`

Requirements:

- Store secrets in deployment secret managers.
- Do not commit secrets to repository.
- Rotate route optimizer tokens on a recurring schedule and after any suspected leak.
- Set `CRON_SECRET` in Vercel for scheduled privacy retention cron (or use `MAINTENANCE_JOB_TOKEN` with the same value).

## Data access and least privilege

Current implementation uses service-role Supabase clients for most server actions. This bypasses RLS at runtime, so enforcement is application-level.

Rider GPS ingest validates JWT before any service-role write.

Database migrations `033_phase1_security_hardening.sql` and `034_phase3_storage_gps_retention.sql` harden RLS and RPC authorization.

## Input validation and API hardening

Positive controls implemented:

- Zod validation for server actions and optimizer API payloads.
- Payload size limits on optimizer endpoints.
- Bounded location counts and index checks.
- Upstream timeout and explicit error mapping in optimizer proxy.
- Per-IP and per-session rate limits on GPS ingest and heartbeat.
- GPS timestamp validation and anti-spoof gates in `complianceVerifier.ts`.
- Reward policy resolved server-side from platform settings (ignores client `policy_snapshot`).

## Logging, auditing, and traceability

- Structured logging with PII/token redaction (`lib/logRedaction.ts`).
- Dashboard access monitoring via `admin_dashboard_sessions`.
- Audit logs in `audit_log`; data exports recorded via `recordDataExport`.
- Optimizer request/decision events persisted (`route_optimizer_runs`, `route_optimizer_decisions`).
- Privacy retention cron: `vercel.json` → `POST /api/internal/privacy-retention` daily.

## Security-relevant operational checks

- `GET /api/health` validates DB and email dependencies.
- `GET /api/optimize/health` validates optimizer availability and auth path.
- CI: `.github/workflows/ci-admin.yml` (typecheck, tests, build).
- CI: `.github/workflows/ci-route-optimizer.yml` (Docker build + auth smoketest).

## Known residual risks

1. Service-role key centrality — server compromise grants broad DB access. Mitigate with secret rotation, audit logging, and scoped operations.

2. In-memory rate limiting — resets on serverless cold starts. Consider Redis/Vercel KV for production scale.

3. Cloudinary unsigned uploads — security depends on upload preset restrictions in Cloudinary dashboard.

## Secure development checklist

Before merging changes:

- Verify role checks exist for every new privileged action.
- Verify rider JWT ownership on any new mobile ingest endpoint.
- Verify no secret is referenced in client-side code.
- Verify input validation on new server actions/routes.
- Verify audit visibility for sensitive admin operations.
- Run `npm run typecheck` and `npm test`.

## Incident response basics

If compromise is suspected:

1. Rotate Supabase service-role key and optimizer tokens immediately.
2. Rotate Resend key if email layer is implicated.
3. Review `audit_log`, `user_activity`, and optimizer run/decision logs.
4. Disable high-risk mutating endpoints until scope is understood.
5. Re-enable incrementally with monitoring.
