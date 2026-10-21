# P1 Users dashboard correction — 21 October 2026

**Approved migration 079 and Admin revision `083fe8c` are deployed.** The production target and `admin.movrr.nl` alias independently identify deployment `dpl_8LSDe7hSSjpb2NgZjGC2sqjNFrrR`. The [production receipt](../verification/users-dashboard-p1/production.json) records exact journal/ACL/data/handler verification. Authenticated production browser acceptance remains unperformed; backend verification is not represented as browser acceptance. The earlier [source receipt](../verification/users-dashboard-p1/verification.json) remains historical evidence.

Fresh production reads and the corrected source handler reconcile to **17 Users, 17 active, 13 distinct Rider Users, 2 organisation Users, 5 Staff and 200% 30-day growth** at 14:47 UTC. Organisation Users increased from 1 after a concurrent super-administrator added an active reward-partner Owner membership through the canonical audited `users.role.approve` command at 14:45:16 UTC. This release did not initiate that write. No stale count was forced.

079 committed at 14:41:14 UTC under journal version `20261021144000`, checksum `6d29a01faa98716c0b6d073f8863bdd5154cfe6e89d65a24d47cfe09e9e1ee4b`. It added one stable service-only reader and preserved all rows across 184 public/Auth tables inside the transaction. Existing functions, RLS, table grants, columns, constraints, triggers and release gates remained unchanged. Post-release record differences are limited to the independently audited membership/audit addition and routine session/worker activity; User, Rider, Wallet and historical records match.

Four read-only production handler/security checks pass, including actual records, literal search, combined filters, 17-account membership readback, the live guarded RPC, MFA denial at AAL1 and external-tenant denial. Campaigns still succeed when the harness injects a failed User read, and that failure returns no fabricated data. Another 193 focused regressions pass; the pinned source retains the earlier 941-test full SQL/PostgREST/GoTrue acceptance. The Vercel production build reached READY. Direct receipt-table SELECT remains denied; only the guarded RPC succeeds.

A concurrent approved terminology release changed the live alias to `0999175` during the candidate build. Promotion stopped, its exact source was reviewed as an ancestor of `083fe8c`, and promotion resumed while preserving all approved terminology changes. No other session files or cleanup work were reset, overwritten or deployed from the working tree.

## Root cause and authoritative counts

The production alias identifies `dpl_CmD93XcJu3yxdh9iDYQoAbk2G9Y4`, revision `f3f0dec1bccf515cb53f48356bc1007b56e5eea1`. Read-only PostgreSQL and Supabase GET probes independently reproduce `42501: permission denied for table account_auth_sync`. Migration 073 intentionally revoked direct receipt-table access from **all** API roles, including `service_role`. `getUsers()` still selected that private table after successfully reading all accounts and relationships, then returned failure. `UsersOverview` ignored its query error and rendered zero defaults and an empty table. The old early return did not log this Users error.

The historical pre-release snapshot at `2026-10-21T14:20:38Z` was:

| Metric | Observed / expected corrected display |
| --- | ---: |
| Public User accounts / Auth accounts | 17 / 17 |
| Active account status | 17 |
| Inactive / pending | 0 / 0 |
| Distinct Users with Rider profiles | 13 |
| Rider profile rows / missing User links | 15 / 2 |
| Organisation Users / membership rows | 1 / 1 |
| Internal Staff | 5 |
| Registrations, last 7 / last 30 / preceding 30 days | 2 / 3 / 1 |
| 30-day registration growth | 200% |
| Recently active in 30 days / activity rate | 6 / 35% |
| Verified accounts / verification rate | 5 / 29% |

Account totals count distinct `public.user.id`. Relationship totals count Users holding each explicit relationship; they overlap and must not be added to calculate account totals. Organisation Users includes non-revoked memberships, including invitations, and counts each User once. “Active Users” is account status; recent activity is a separate metric. Eleven existing Users are Rider-only without organisations; three are Staff-only; two hold multiple domains. No User-only, Partner-only or Government-only production identity was fabricated.

Existing authenticated SQL contexts for the super-administrator and three Operations Managers see all 17 Users with `users.read`. An internal Partner Operations Manager and an external organisation member lack that capability and see only their own account through RLS. These are read-only SQL contexts, not HTTP sessions or browser acceptance.

## Source corrections

- `app/actions/users.ts:getUsers` retains `requireCapability("users.read")`, including the existing MFA/trusted-session checks, and passes the server-resolved actor to a narrowly scoped pending-sync reader. Accounts remain the base projection; Rider/Staff/membership relations are optional. All projections paginate with stable unique ordering. Search escapes LIKE syntax and PostgREST quoted values separately.
- `scripts/079_users_dashboard_sync_read.sql` proposes one `STABLE SECURITY DEFINER` function with an empty search path. Only `service_role` may execute; it verifies the active actor's canonical `users.read` capability, accepts at most 500 account IDs and returns only requested pending IDs as scalar JSON. JSON avoids PostgREST row-cap truncation. It does not expose private receipt fields or grant direct table access, and changes no existing RLS, writer, role catalog or data.
- `hooks/useUsersData.tsx` reads only Users. The unused Campaigns enrichment and historical `user.role`/mock branches are removed. Statistics, overview consumers and exports retain the canonical account projection.
- `app/users/UsersOverview.tsx` uses existing error components with Retry; loading, successful empty results, failures and partial activity availability are separate. A failed refresh hides stale totals. Activity failure preserves valid account counts but hides unavailable health metrics and activity trends.
- `lib/userActivity.ts` paginates activity by bounded User batches instead of truncating the global feed. `lib/activitySignals.ts` propagates Auth activity failure. `lib/dashboard/readTransport.ts` bounds requests to 30 seconds, preserves no-store credentials and distinguishes session redirects, expired sessions and denied requests.
- `app/riders/RidersOverview.tsx` reports shared reader failures. Production runtime logs also demonstrated null-linked Rider account requests; `RiderDetailsDrawer.tsx` now reports an unavailable linked account before issuing User reads or rendering account controls. Both orphan profiles and their historical/financial records remain intact.

The Dashboard overview already renders unavailable statistics on query failure and uses explicit `domains` for growth series; its shared input now recovers with Users. Organisation/Staff readers, User Details and permissions continue using their existing independent contracts. Actual DOM, authorization, API matrix and financial contract tests pass. No broader identity redesign, competing repository, legacy fallback or UI redesign was introduced. The separately committed approved terminology change `0999175` is preserved.

## Verification

Final regression: **941 tests in 81 files, no skips**, with `MOVRR_EMPLOYEE_POSTGRES=1`, `MOVRR_USERS_HTTP=1` and `MOVRR_EMPLOYEE_AUTH_HTTP=1`. Tests cover independent domain fixtures, multiple memberships, suspended/pending accounts, denied table/function execution, API failures, partial activity, literal search, combined filters, genuine empty results, failed refresh, cache invalidation and account switching. Existing actual User Details DOM and security suites pass.

The actual `getUsers` handler was exercised through real local PostgREST and PostgreSQL with a **37-row API limit**, 1,213 total fixture accounts (1,207 additional), 1,001 Rider Users, 1,001 organisation Users and 201 pending-sync flags. Search containing comma, percent, underscore, quote and backslash passes. The existing real GoTrue HTTP harness passes all 21 cases, including independent User creation and domain lifecycle handlers.

TypeScript, repository lint and the production build pass. Repository `lint` invokes TypeScript; there is no separate ESLint check. The first enabled GoTrue attempt lacked its local PostgreSQL prerequisite; an isolated local server was started and the subsequent complete run passed. Earlier mock-only search checks missed escaping and RPC truncation issues; real PostgREST exposed them, and the final corrected tests pass.

Production evidence is read-only: actual counts, exact 071–078 journals, relevant identity/financial fingerprints, table privileges, existing RLS contexts, release gates and anonymous HTTP authentication redirects. The reproducible verifier is `scripts/manual/users-dashboard/verify-production.cjs`. Recent retained runtime logs show four null-linked Rider activity failures; the earlier two-hour log query exceeded hosting retention. Chrome DevTools could not connect. No authenticated production UI acceptance is claimed.

## Approval and release sequence

The owner explicitly approved **both** exact migration 079 (including EXECUTE on the new service-only function) and pinned Admin revision `083fe8c`. Both are now deployed and independently verified. Automatic main deployments remain disabled. The first apply attempt stopped before DDL because the release verifier compared PostgreSQL Result objects with JSON arrays; normalization was corrected, the absent journal was reverified and the atomic retry passed.

The controlled release followed this sequence; interactive authenticated acceptance in step 5 remains outstanding:

1. Pin the correction commit on remote `main`; build the Admin candidate without assigning the live domain and verify READY, source SHA and project. No web or Mobile release is required.
2. Re-run the read-only production verifier. Confirm schema journals and release gates have not drifted; compare any concurrent identity/financial changes with their owning work. Do not replay, revert or interfere with the seven-account cleanup.
3. Apply exactly `079_users_dashboard_sync_read.sql` and its normal checksum journal entry atomically after approval. SHA256 UTF-8/LF: `6d29a01faa98716c0b6d073f8863bdd5154cfe6e89d65a24d47cfe09e9e1ee4b`. Recheck exact function definition, ACL, empty search path, direct-table denial, RLS and protected data fingerprints. This additive function needs no data backfill, identity mutation or path hold.
4. Promote the pinned Admin candidate through the established release mechanism. Independently read back the production target and domain alias. Preserve firewall, MFA and tenant isolation.
5. Using an available authorized production session, load `/users`, reconcile live values against a fresh read-only count, inspect actual records and Details, exercise search/combined filters/pagination/refresh and switch accounts. Confirm unauthorized role/tenant denial and the orphan Rider error state. Do not create test identities, change relationships or financial records for acceptance.
6. Preserve final production evidence and update the roadmap only after live acceptance. If app rollback is necessary, retain the additive reader; reverting to the original application reintroduces the P1 and is not resolution.

Deletion intake remains **Enabled**; irreversible deletion and public Shop redemption remain **Disabled**. There were no production identity/financial writes, cleanup changes or Mobile runtime modifications. The P1 backend correction is deployed; authenticated browser acceptance remains open. No User-only production identity exists, so that shape remains verified with isolated real SQL/HTTP fixtures. The 11 existing Rider-only Users are present without organisation requirements.
