# Independent User accounts: approved production release

The approved migration 078 and pinned Admin/web revisions were released on 21 October 2026. The [production receipt](../verification/user-relationships/production.json) contains the journal, deployment readbacks, authorization results and protected-record fingerprints. This supersedes the pending-release status in the earlier source acceptance report; it does not claim authenticated browser acceptance.

| Component | Verified production revision / journal | Deployment |
| --- | --- | --- |
| Supabase `kzdvunpuxaxlphqvmzxw` | `20261021131000`, `078_independent_user_accounts` | Transaction committed at `2026-10-21T13:18:57.858Z` |
| `admin.movrr.nl` | `f3f0dec1bccf515cb53f48356bc1007b56e5eea1` | `dpl_CmD93XcJu3yxdh9iDYQoAbk2G9Y4` |
| `app.movrr.nl` | `2d14d76fcfe4974626f96ec845f13f5ca061cfc0` | `dpl_5CbDEtdhy6Jk4Y53vXhFxXQbirVN` |

Migration SHA256, UTF-8/LF: `4508df3709a058777661d3aff6cff1e834e4d855acb42abb7a2cda910514d516`.

## Baseline and cutover

Before execution, the production journals and committed checksums for 071–077 matched the reviewed corrected sources. All 396 public function definitions and 380 RLS policies matched the tested production-schema snapshot. All 34 canonical SQL bodies and 11 domain-role catalogs matched the reviewed source. The existing Admin production target and alias identified ID-25 correction `75105bd8c7ab29323803987e334403f12b918b86`, deployment `dpl_4NKHidcv6wEUzewztKniP5Wny6pm`.

Both immutable Git-source candidates reached READY before the cutover. Automatic custom-domain assignment was disabled. Safe candidate probes verified Admin JSON authentication denial, the Admin cookie gate, independent web account copy and the web workspace sign-in gate. Initial web probes encountered expected Vercel protection; explicit web project targeting resolved CLI access without disabling protection.

The existing release procedure established scoped identity-path holds on both applications, independently observed as HTTP 403. Then 078 was applied atomically and verified before either promotion. Both promoted aliases and production targets were independently verified before removing the holds. Final firewalls remain enabled, have zero custom rules and are version 10. There was no migration/deployment failure, rollback or legacy fallback.

## Authorization and preservation

078 replaces only `guard_employee_auth_insert`, `handle_new_user` and `provision_product`. An explicit owned null-role reservation supports User-only creation; the intentional public Mobile Rider signup contract remains. No new role aliases, writers, tables, fallback profiles, memberships or data backfills were introduced.

All rows across **184 public and Auth tables** matched before/after fingerprints within the migration transaction. Policies, table grants, columns, constraints, triggers, unrelated functions and the three functions' owners, ACLs, SECURITY DEFINER and search-path settings remained unchanged. Post-migration read-only comparisons also found no concurrent non-routine data changes. Existing identity, financial, ride, organisation, invitation, audit and cleanup records were preserved. No synthetic account, membership change, financial test, provider email, Mobile runtime change or EAS build was performed.

Post-release checks verified the exact journal/checksum, 34 canonical SQL bodies, 11 role catalogs, retired endpoint/signature absence and denied direct grant DML. The external Partner Operations Manager ceiling remains Staff/Viewer administration only; Owner, Manager, peer and internal/platform grants remain excluded by the exact installed contract. Read-only SQL contexts verified five Riders, five Staff accounts including privileged MFA enforcement, and the existing Advertiser membership with tenant isolation. Inventory found 11 Rider-only accounts without organisations, three Staff accounts without Rider profiles and two identities with multiple relationships.

Deletion intake remains **Enabled**, policy version 2. Irreversible execution remains **Disabled**. Public Shop redemption remains **Disabled**. The live-domain HTTP receipt records 13 passing anonymous GET probes, including canonical JSON API denial, protected pages and available sign-in pages.

## Findings and acceptance boundaries

All PM-01–PM-08 source corrections are now deployed at the exact verified revisions. Their underlying source and isolated acceptance evidence remains in the [initial/final correction matrix](user-relationships-simplification.md) and [source receipt](../verification/user-relationships/verification.json). No finding is automatically marked Fully Resolved from a successful build or deployment.

| Findings | Source / isolated acceptance | Production acceptance |
| --- | --- | --- |
| PM-01 User-only creation; PM-07 independent authentication | Real handler/GoTrue/PostgreSQL creation, login, retry and operational-denial tests passed | Exact SQL installed; no existing active User-only account was available for live login. Partially Resolved pending legitimate authenticated acceptance. |
| PM-02, PM-03, PM-04, PM-08 relevant controls, relationships, counts and refresh | Actual DOM edit/save, status, membership, invitation readback and shared-schema tests passed | Exact Admin revision and domain verified. Authenticated Details/Create lifecycle not executed in production. Partially Resolved pending browser acceptance. |
| PM-05, PM-06 independent web account and landing | Account session, switching/revocation, landing rendering and sign-out tests passed | Exact web revision/domain and anonymous gates verified. Authenticated account switching and User-only landing not executed in production. Partially Resolved pending browser acceptance. |

Source acceptance includes 887 Admin tests (real PostgreSQL/GoTrue and actual DOM coverage), 91 web tests, TypeScript/lint and both production builds. An offline real-schema rehearsal preserved all 157 public tables. These tests were not rerun as production lifecycle writes.

Chrome DevTools could not connect and computer-use inventory exposed no browsers. Therefore production Create → Save → Reload → Edit → Revoke, actual User Details presentation, authenticated account switching and successful bearer HTTP journeys remain **external authenticated browser acceptance**. Production had no existing User-only, Partner or Government membership contexts; none were fabricated. The exact deployed contracts and isolated real SQL/GoTrue tests cover these cases, without claiming a live production journey. External email/provider acceptance remains unexecuted.

## Operational record

Reproducible tooling is under `scripts/manual/user-relationships/`: `production-release.cjs` (read-only preflight/default, explicit approved apply, verify), `coordinated-release.ps1`, `verify-access.cjs`, `verify-http.cjs` and `record-production.cjs`. Detailed snapshots remain in ignored `.tmp/user-relationships-rollout-20261021/`; committed evidence contains no account identifiers or credentials.

Do not replay 078, 071–077 or the Advertiser backfill. Future changes require a separately reviewed forward migration. Preserve canonical authorization and all identity/history records; do not restore retired executable role paths. The unrelated seven-account cleanup and parallel-session files were left untouched.
