# Operations

## Runtime prerequisites

- Node.js (current LTS recommended for Next.js 16).
- npm (repo includes `package-lock.json`).
- Supabase project with required tables/RPC/policies.
- Resend account/API key for email features.
- Optional Python runtime or Docker for route optimizer service.

## Environment configuration

Required keys are validated in `lib/env.ts`.

Core keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_MAP_STYLE_URL`
- `RESEND_API_KEY`
- `FROM_EMAIL`, `WELCOME_EMAIL`, `ADMIN_EMAIL`, `SYSTEM_EMAIL`

Optimizer keys:

- `ROUTE_OPTIMIZER_URL`
- `ROUTE_OPTIMIZER_TOKEN` (or `ROUTE_OPTIMIZER_KEY`)
- Optional rotation support: `ROUTE_OPTIMIZER_PREV_TOKEN`, `ROUTE_OPTIMIZER_OLD_TOKEN`, `ROUTE_ALLOW_PREV_TOKEN`

Mock flags:

- `NEXT_PUBLIC_USE_MOCK_DATA`
- `USE_MOCK_DATA`
- `NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS`

## Local runbook

1. Install dependencies:

```bash
npm install
```

2. Configure `.env`.

3. Start app:

```bash
npm run dev
```

4. Optional optimizer service:

```bash
cd services/route_optimizer_service
python -m venv .venv
# activate venv
pip install -r requirements.txt
python app.py
```

or Docker:

```bash
docker build -t movrr-route-optimizer:latest services/route_optimizer_service
docker run --rm -p 5000:5000 -e ROUTE_OPTIMIZER_TOKEN=<token> movrr-route-optimizer:latest
```

## Build and deployment

App:

```bash
npm run build
npm run start
```

Optimizer CI exists in `.github/workflows/ci-route-optimizer.yml` and performs:

- Docker build.
- Container startup.
- `/health` wait loop.
- smoke test script execution.

## Database provisioning and migrations

SQL scripts in `scripts/` are the operational reference for required objects and policies.

Notable scripts:

- `route-stops.sql`
- `route-optimizer-audit.sql`
- `reward-catalog.sql`
- `admin-settings.sql`
- `020_audit_logs.sql`
- `workboard.sql`
- `workboard_card_identifiers.sql`
- `workboard_defaults_and_policies.sql`

Apply scripts in controlled environments via your migration process (do not run ad-hoc in production without review).

## Health checks and monitoring

### App health

- Endpoint: `GET /api/health`
- Returns aggregate status (`operational`, `degraded`, `down`) with subsystem checks.

### Optimizer health

- Through dashboard proxy: `GET /api/optimize/health`
- Direct service: `GET /health`
- Metrics: `GET /metrics` (Prometheus format)

### Access and activity logs

- Root access attempts/logins are posted to `admin_access_logs`.
- Audit logs are read from `audit_log` with `audit_logs` fallback.

## Incident handling

### Optimizer unavailable

Symptoms:

- `/api/optimize/health` non-200
- route optimization UI shows unavailable state

Checklist:

1. Verify `ROUTE_OPTIMIZER_URL` and token env values.
2. Check optimizer container health and logs.
3. Confirm token synchronization between Next.js proxy and service.
4. Validate network reachability from app runtime to optimizer host.

### Database/read-write failures

Checklist:

1. Verify Supabase URL/key variables.
2. Validate service-role key is present in server runtime.
3. Check table existence and policies for affected module.
4. Inspect server logs for exact query errors.

### Email delivery failures

Checklist:

1. Confirm `RESEND_API_KEY` and sender identities.
2. Validate domain status and quota in Resend.
3. Use `/api/health` email check for quick confirmation.

## Backup and recovery considerations

- Operational data resides in Supabase Postgres; follow Supabase backup/PITR policies.
- Optimizer logs are file-based in service `logs/` directory if mounted; ensure log rotation and retention are defined at infrastructure level.

## Operational risks and known constraints

- TypeScript build errors are currently not build-blocking (`typescript.ignoreBuildErrors: true` in `next.config.mjs`).
- Service-role Supabase key is required for many server actions; secret exposure would be high impact.
- Mixed legacy/new schema conventions require careful migration discipline.
