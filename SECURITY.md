# Security

## Security model overview

MOVRR Admin Dashboard is a privileged admin application with service-role database access on the server side. Security depends on strict auth gating, protected runtime secrets, and careful server-action boundaries.

## Authentication and authorization controls

- Supabase auth sessions are used for user identity.
- Page and API access is guarded through:
  - `AuthWrapper` role checks
  - `requireAdmin()` in server actions/routes
  - middleware/proxy role verification for root access
- Admin membership is validated against `admin_users` table.

## Secret management requirements

Never expose these values to the browser/client bundles:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ROUTE_OPTIMIZER_TOKEN` / `ROUTE_OPTIMIZER_KEY`

Requirements:

- Store secrets in deployment secret managers.
- Do not commit secrets to repository.
- Rotate route optimizer tokens on a recurring schedule and after any suspected leak.

## Data access and least privilege

Current implementation uses service-role Supabase clients for most server actions. This bypasses RLS at runtime, so enforcement is application-level.

Hard requirements for contributors:

- Keep all privileged queries in server-only modules.
- Require authenticated admin context before any write path.
- Validate and sanitize all external/user-provided input.

## Input validation and API hardening

Positive controls implemented:

- Zod validation for server actions and optimizer API payloads.
- Payload size limits on optimizer endpoints.
- Bounded location counts and index checks.
- Upstream timeout and explicit error mapping in optimizer proxy.

Additional controls to maintain:

- Reject unbounded list queries in new APIs.
- Continue using explicit allowlists for enum-like fields.
- Avoid passing raw client payloads into persistence without sanitization.

## Logging, auditing, and traceability

- Protected dashboard entry stamps a trusted `admin_session_started_at` marker in auth metadata on first successful page access after login.
- Dashboard access monitoring is session-based, not request-based: one durable `user_activity` record and one `audit_log` record are written per authenticated admin session.
- Audit logs are retrievable via `audit_log`/`audit_logs` readers.
- Optimizer request/decision events are persisted (`route_optimizer_runs`, `route_optimizer_decisions`).
- Optimizer proxy and service propagate `trace_id` for correlation.

## Security-relevant operational checks

- `GET /api/health` validates DB and email dependencies.
- `GET /api/optimize/health` validates optimizer availability and auth path.
- Route optimizer service can expose `/metrics`; protect endpoint at infrastructure boundary if needed.

## Known risks in current implementation

1. TypeScript build errors are not fail-fast (`ignoreBuildErrors: true`).

- Risk: type regressions can reach production.
- Mitigation: enforce `tsc --noEmit` in CI and remove ignore-build-errors in production pipeline.

2. Service-role key centrality.

- Risk: server compromise or secret leak grants broad DB access.
- Mitigation: strict secret handling, least-privileged deployment environment, audit logging, rapid rotation.

3. Mixed schema conventions/legacy scripts.

- Risk: migration drift and policy mismatch.
- Mitigation: migration review checklist and explicit schema contract verification in PRs.

## Secure development checklist

Before merging changes:

- Verify role checks exist for every new privileged action.
- Verify no secret is referenced in client-side code.
- Verify input validation on new server actions/routes.
- Verify audit visibility for sensitive admin operations.
- Verify docs/env contracts are updated for any new secret or endpoint.

## Incident response basics

If compromise is suspected:

1. Rotate Supabase service-role key and optimizer tokens immediately.
2. Rotate Resend key if email layer is implicated.
3. Review `user_activity` admin-access events, `audit_log` entries, and optimizer run/decision logs for suspicious activity.
4. Disable high-risk mutating endpoints until scope is understood.
5. Re-enable incrementally with monitoring.
