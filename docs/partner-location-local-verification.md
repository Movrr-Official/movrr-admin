# Migration 051 — local PostgreSQL verification (2026-10-12)

**Local verdict: GO for the tested candidate on PostgreSQL 17.6. Deployed Supabase/staging acceptance: HOLD.** No production database was accessed and no deployment status was inferred. All fixtures were synthetic. Docker resources created by this task were removed; final task-labelled container/volume/network inventories were empty.

## Execution environment

Docker Desktop engine 29.8.1; Linux PostgreSQL 17.6, x86_64, GCC 15.2.0. Cached image public.ecr.aws/supabase/postgres:17.6.1.165, digest sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518. Fresh internal Docker networks and named volumes, no published ports. Connections used docker exec and the local Unix socket, never an environment connection URL. No software installation or global configuration changes.

The image provided actual auth.users, auth.uid(), anon/authenticated/service_role roles, service_role BYPASSRLS, and gen_random_uuid(). Installed extensions: pgcrypto 1.3, plpgsql 1.0, uuid-ossp 1.1, pg_stat_statements 1.11 and supabase_vault 0.3.1. Migration 051 does not require a new extension, PostGIS or an external geospatial service.

Use the image's actual supabase_admin schema-owner role for local DDL. Its postgres role is not the owner/superuser: the first bootstrap correctly failed with permission denied for schema public. Role privileges were not weakened to bypass that failure.

## Required baseline and ordering

The runner extracts existing definitions, rather than creating guessed partner/organisation entities:

1. Supabase-image auth schema, roles and functions, checked before bootstrap.
2. The referenced admin_users table from scripts/schema_visualizer.sql; only this dependency table, not the whole context-only dump.
3. Exact is_dashboard_admin function/grants from 033; not the entire unrelated security-hardening migration.
4. Exact reward_partner and reward_catalog table definitions from reward-catalog.sql, with its active-catalog read policy. Unrelated redemption/wallet/ride schema and RPCs are excluded.
5. Full migrations 040, 041 and 045, in that order.
6. Full migration 046, then the unchanged repaired 051 candidate.

Local default table grants intentionally include anon/authenticated/service_role so 051's revocations are exercised. No auth schema/function substitute was introduced. This is a deliberately scoped prerequisite harness, not a certification of a complete historical MOVRR schema replay or the unknown deployed schema.

## Results

| Check | Executed result |
| --- | --- |
| Migration 051 SQL/PLpgSQL creation and COMMIT | PASS |
| Existing 051_partner_locations.integration.sql | PASS after its missing-quote repair |
| Fresh database/container/volume setup | PASS twice, separate resources and the same cached image digest |
| Missing migration 046 | Expected error, no partial 051 table/index/RPC left behind, twice |
| Injected failure immediately before 051 COMMIT | Expected error, all 051 DDL rolled back, twice |
| RLS enabled on all three tables; service-only mutation RPC grants | PASS; actual role checks and service-role RPC execution |
| Anonymous/authenticated direct access and RPC calls | PASS: denied; temporary SELECT grant still exposed no rows under RLS |
| Draft/create/edit/publication, reward association and wrong-partner rollback | PASS |
| Invalid latitude/longitude, NaN, one-sided coordinates, unverified publication | PASS: rejected |
| Cross-organisation location edit and composite partner/organisation FK | PASS: rejected |
| Organisation/partner create/link, legacy link, relink/deletion restrictions and suspension | PASS |
| Partial organisation/partner and location/audit failures | PASS: prior state preserved |
| PostgreSQL six-digit microseconds, JSON timestamps and offset-equivalent expected version | PASS: 2026-10-12T12:00:00.123456+02:00 accepted as 2026-10-12T10:00:00.123456+00:00 |
| Stale optimistic version | PASS: Location version conflict |
| Two overlapping native PostgreSQL edit sessions | PASS: writer A committed; writer B waited and rejected the stale version; no lost update or extra audit |
| Geographic bounds and active/publication filtering | PASS |
| 351-branch cursor traversal in pages of 100 | PASS, all 351 discovered |
| Migration 046 quota, 35 attempts at a limit of 30 | PASS: exactly 30 accepted |
| Fixture and temporary-grant rollback | PASS |

Actual pg_constraint inspection found 13 location constraints, including five foreign keys and the composite identity FK. All three new tables had relrowsecurity=true; ACLs excluded anon/authenticated. Native FK/check violations were exercised, not merely asserted from TypeScript.

The existing integration EXPLAIN used partner_location_discovery for 351 synthetic branches. Execution times in the two clean runs were 0.137 ms and 0.150 ms. These small-fixture plans do not certify production-density query performance or deployed statistics.

## Defects and harness issues recorded

- Previously corrected migration delimiters at 051 lines 3/6 and 60/99 executed successfully; no further migration edits were required in this task.
- Existing integration test line 23 omitted the closing quote in location->>'updated_at'. Restored that quote; assertion behavior remains unchanged.
- Initial bootstrap used the non-owner postgres role. Switched the disposable harness to supabase_admin, preserving existing security behavior.
- Initial runner readiness saw the temporary initialization server. Final readiness waits for PID 1 to leave the shell for postgres or the image's .postgres-wrapp process, then checks pg_isready. An intermediate runner failed because it did not yet recognize that wrapper; both failed-run command logs are retained in JSON.
- The first concurrency driver reported failure while its SQL assertions passed because Windows Start-Process returned an unavailable ExitCode. Repeated using Start-Job, checked native exit success, established overlap with pg_stat_activity/PgSleep, and passed. No unresolved SQL assertion failures remain.

## Reproduction and commands

From movrr-admin, with the local desktop-linux Docker context running and the cached image available:

~~~powershell
.\scripts\tests\run-051-local.ps1 -Runs 2
~~~

For the exact tested image, supply -Image public.ecr.aws/supabase/postgres@sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518. The runner uses --pull=never, generates new resource names, applies files with psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d movrr_051_test -f ..., tests failure rollback, runs both SQL suites, and cleans only its own created resources. It never reads .env, DATABASE_URL or production credentials. An expected failure must match its asserted message; unexpected exit codes fail the run.

partner-location-local-verification.json contains all 74 commands from the two successful clean runs, exit codes/output, source hashes, both earlier failed setup logs, and the executed SQL for the independent overlapping-session test. That separate concurrency test used a synthetic local_051_fixture table in the initial disposable container, confirmed writer A was sleeping with a held transaction before starting writer B, and checked winner state and per-location audit count. Those committed synthetic fixtures disappeared with that container/volume. The clean runner exercises the sequential optimistic-version assertions; it does not run the separate two-process test automatically.

## Files changed in this task

- scripts/tests/051_partner_locations.integration.sql — one missing quote repaired.
- scripts/tests/051_partner_locations.local.sql — additional rollback-only database assertions.
- scripts/tests/run-051-local.ps1 — reproducible fresh-resource prerequisite/migration/test harness.
- docs/partner-location-local-verification.md and .json — results, commands and historical failures.
- docs/partner-location-staging-verification.md — current status links to this local evidence; staging remains unexecuted.

Migration 051 itself was not changed during this continuation. Existing unrelated working-tree changes were preserved. No staging, commit, push, deployment, publication, marker activation or production data modification occurred.

## Remaining acceptance gates

Local PostgreSQL success is distinct from an actual Supabase deployment. Required before staging acceptance: authorized isolated staging identity; actual migration ledger and schema/default ACL/role comparison; verified backup and recovery; database integration against that environment; authenticated PostgREST/Platform API payload/error/rate-limit validation; Admin browser list/edit/save checks. Production ledger status remains unknown. If 051 was previously applied anywhere, do not replay this candidate as an upgrade: use an approved forward-migration strategy after inspecting that environment. Preserve data on recovery; no destructive down migration is introduced.

This report supersedes earlier statements that local SQL execution was blocked or the repaired migration had not been parsed by PostgreSQL. It does not turn staging or public launch HOLD into GO.
