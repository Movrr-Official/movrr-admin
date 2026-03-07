# Contributing

## Contribution policy

This repository is an internal production admin system. Changes must be implementation-driven and operationally safe.

## Development workflow

1. Create a focused branch.
2. Implement changes in smallest safe increments.
3. Validate behavior locally against real data mode when possible.
4. Run lint/build checks before review.
5. Open PR with migration/ops notes if database behavior changed.

## Local setup

```bash
npm install
npm run dev
```

If your change touches route optimization:

- Run the Python service locally (`services/route_optimizer_service`) or via Docker.
- Verify `/api/optimize/*` proxy behavior from the dashboard UI.

## Coding standards

- TypeScript + Zod validation for server inputs.
- Prefer explicit table/field mapping in server actions.
- Keep role checks and auth boundaries explicit (`requireAdmin`, `AuthWrapper`).
- Avoid silent behavior changes in data contracts used by hooks/components.
- Treat the auth bootstrap trigger as the owner of initial `public.user` creation after `auth.users` inserts.
- When adding or changing user creation flows, pass metadata that matches the trigger contract instead of adding parallel bootstrap inserts in app code.
- Keep role onboarding canonical: advertisers through the Advertisers module, public self-signup for riders only, and admin-created users through the admin user flow.

## Schema and migration changes

If changing DB shape:

1. Add/update SQL script(s) in `scripts/`.
2. Document required ordering/dependencies.
3. Update affected server actions and schemas.
4. Include rollback strategy in PR notes.

## Testing and verification

Minimum checks before PR:

```bash
npm run lint
npm run build
```

Additional targeted checks:

- Users: create/update/role/status flows.
- Routes: assignment, compliance recompute, GPS view loading.
- Campaigns: create/update/status, zones/hot zones CRUD.
- Rewards: transactions, balances, manual adjustment validations.
- Notifications: create + history/stat filters.
- Workboard: invite, membership, board/card CRUD and ordering.

Optimizer-related:

- `/api/optimize/health`
- `/api/optimize/route` with valid/invalid payloads
- decision audit write path

## Pull request requirements

Each PR should include:

- What changed and why.
- Any schema/API contract changes.
- Any operational impact (env vars, migrations, backfills).
- Manual verification steps and outcomes.
- Screenshots for UI changes affecting operator workflows.

## Areas requiring extra caution

- `lib/env.ts` (env contract changes).
- `proxy.ts` and auth wrappers (access control).
- `app/actions/users.ts` delete/creation flows.
- shared auth bootstrap trigger and any server action that creates `auth.users`.
- `app/actions/routes.ts` status/compliance/export logic.
- `app/actions/rewards.ts` balance and adjustment logic.
- `app/api/optimize/*` token forwarding and audit persistence.

## Documentation updates

When changing behavior in any module, update the relevant top-level docs:

- `README.md`
- `ARCHITECTURE.md`
- `SYSTEM_DESIGN.md`
- `OPERATIONS.md`
- `SECURITY.md`

and module-specific docs in `docs/` where applicable.
