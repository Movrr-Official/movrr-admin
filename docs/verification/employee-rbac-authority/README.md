# Canonical employee authority — release acceptance

2026-10-21. The approved production rollout is complete: migration `20261021071500` (`070_employee_rbac_authority`) and Admin `89c3a0b7f874af7e3a68a343a22bed8bc244f142`, deployment `dpl_83NGcnrxQAu6CSShrAS4sAoCBcey`, at `admin.movrr.nl`. See [production evidence](production.json) and [preflight schema evidence](preflight-contracts.json).

The migration converted three historical employee role labels to `operations_manager`, with audit records. Protected identities, account types, Rider history, organisation memberships, financial rows and staff IDs were unchanged within the migration. After traffic resumed, separate operational activity granted `partner_operations_manager` to an existing Rider while preserving Rider classification/profile; acceptance did not initiate that grant. No synthetic production identity, financial mutation or email was created by this acceptance run.

## Authoritative contracts

Supabase Auth UUID identifies a person. `public.user.role` classifies the existing account; it never grants employee capabilities. `admin_users.role` contains one exact canonical employee role, or NULL when revoked. Organisation ownership and roles remain exclusively in `organisation_membership` and its existing capability contracts. Workboard team roles are a separate resource membership, not an employee identity.

An existing Rider can receive `partner_operations_manager` without rewriting Rider classification, deleting its profile or changing Wallet/history. New employee accounts use the existing non-Rider account classification during reserved bootstrap; no enum value is added. Revocation retains staff row IDs because session and historical operational records reference them.

## Executable entry points traced

| Entry | Authoritative mutation or boundary |
|---|---|
| User Details profile + employee selection | Strict `updateUser` → three-argument `update_admin_user_profile`; profile and employee grant commit or roll back together |
| Direct employee modification/revocation action | `updateUserRole` → `assign_employee_role`; NULL revokes only employee access |
| Create User / employee provisioning service | Durable `provision_employee` reserve/persist/complete; persist delegates to `assign_employee_role` |
| Rider and Advertiser creation | Product-only provisioning; cannot assign employee roles or reclassify existing identities |
| Auth signup trigger | Reservation-derived account kind; operational metadata without a reservation fails; no enum-cast fallback to Rider |
| Workboard invitation acceptance | Existing active canonical employee with `workboard.access`, exact Auth identity/email and team ownership checks; grants team membership only |
| Organisation employee/member management | Existing organisation membership contracts; employee provisioning rejects organisation-role payloads |
| Dashboard, MFA and Platform API | Same canonical template grants; revoked/noncanonical memberships deny employee access; owned Rider endpoints retain independent Rider context |
| Role-targeted notifications and operational alerts | Canonical employee membership lookup, independent of underlying Rider classification |
| Community / direct RLS access | Approved Rider creator contract retained; cross-Rider staff join requires `community.manage`; retained revoked staff rows confer no access |

Removed runtime aliases, deprecated role/permission helpers, role-array shims, alternate employee inserts, old profile-RPC signature and obsolete `get_user_role()` authority. Historical migrations and input fixtures remain as evidence; test harnesses apply the replacement contracts after historical prerequisites. No executable employee assignment writes `public.user.role`.

## Verification evidence

| Environment | Result |
|---|---|
| Pre-release production, read-only metadata | Three historical `admin` employee rows and one `super_admin`; restrictive historical staff references; 13 simple membership-existence policies inspected |
| Released production | All ten installed function bodies match approved source; old RPC signatures absent, aliases denied, 13 existence policies retired and four restrictive Workboard policies installed. Five current employee memberships pass read-only effective-access checks; five active Rider own-identity checks pass; no duplicate/orphan employee grants |
| Admin automated suite | 709 passed; 46 opt-in tests skipped by default and executed separately below |
| Isolated PostgreSQL + actual provisioning handlers | 39 passed; assignment, revocation, canonicalization preservation, retries, concurrency, lost responses, status restrictions, privileged demotion, last-super-admin protection and atomic rollback |
| Isolated actual GoTrue HTTP | 7 passed; exact identity provisioning, failed persistence/resume, concurrent creation, ordinary password login and invalid metadata denial |
| Isolated integration PostgreSQL + PostgREST | 125 database assertions and 31 HTTP assertions passed, including canonical employee notification audiences and cross-account denial |
| Isolated creation/invitation/PostGIS | 82 assertions passed; ownership, duplicate acceptance, inactive/revoked employee and Auth-ban denial, pending invitation preserved on failure |
| Static/build | TypeScript, lint (repository alias for TypeScript), migration generator check and Next production build passed |
| Physical devices, live provider/inbox | Not verified by this task. No live invitation sent; controlled recipient authorization is still absent. Database idempotency does not establish exactly-once email delivery |

Preservation tests retain Rider profile, account kind, organisation membership, fixture ledger/history and staff foreign-key references across migration, revocation and regrant. Production financial and membership data remained read-only. One failed integration attempt exposed a historical pre-065 creator fixture, now replaced by the deployed approval predicate; a separate local port collision was corrected without touching the parallel session's container.

Reproduce with `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `node scripts/generate-employee-rbac-authority.cjs --check`. Opt-in identity tests require disposable PostgreSQL 17 at localhost:55442 and a disposable Supabase PostgreSQL/PostGIS instance at localhost:55443; set `MOVRR_EMPLOYEE_POSTGRES=1` and `MOVRR_EMPLOYEE_AUTH_HTTP=1`, then run both `employeeProvisioning` Vitest files. GoTrue uses localhost:55444. `test-alignment-database.cjs --http` uses local PostgreSQL (default 55439, `MOVRR_ALIGNMENT_PORT` may select another local port) and PostgREST at 55440. `test-creation-workflows.cjs` uses 55443. These harnesses never load production environment credentials.

## Approval and coordinated release

Candidate: `scripts/070_employee_rbac_authority.sql`, SHA-256 `185617e57be2f3f33f926dc0c19380b793f3bd7aff4f079b406021d85d0f2728` (normalized LF repository content). Prerequisites: deployed migrations 068/069 and existing Community/operations contracts. This migration is intentionally incompatible with the obsolete profile-RPC signature and legacy employee values.

1. Obtain authorization for migration 070 and the matching Admin source deployment. Prepare the verified source artifact before the release window. Pause employee-management/provisioning operations during the coordinated cutover.
2. Recheck deployed revision, migration journal, policy shapes and pending provisioning records read-only. Preserve schema/data recovery evidence. The migration fails on unreviewed compound employee policies rather than replacing ownership predicates.
3. In the authorized migration session, set `movrr.migration_actor` to the verified active super administrator's UUID before applying the transaction. Existing historical roles are converted once with explicit actor/audit evidence: admin→operations_manager, moderator→product_operations, support→support_agent, compliance_officer→compliance_analyst, government→programme_operations_manager. Confirm these intended grants before execution. No runtime resolver remains.
4. Apply/journal/checksum 070, then deploy the matching Admin source while the operation pause remains in place. The same advisory lock serializes provisioning, role changes and actor revocation. No other application release or new native build is part of this approval.
5. Verify migration versions, canonical role counts, unchanged staff IDs/account kinds/membership/financial counts, RLS predicates and read-only authenticated Admin access. Verify a controlled employee mutation or invitation only under separate explicit authorization. Resume operations after checks pass.

Do not roll back only the source or reinstall legacy granting functions. If cutover fails, keep employee mutation operations paused and use an approved coherent recovery/forward-fix plan preserving audit and identity data.

Decision: GO for the completed canonical RBAC production release. The temporary cutover hold is removed, retired RPC signatures return PostgREST `PGRST202`, aliases grant no employee capabilities, and canonical function bodies/ACLs match the approved source. Full launch acceptance still requires device and external-provider evidence. Authenticated browser journeys were unavailable in this environment; read-only existing-identity database checks are recorded separately.
