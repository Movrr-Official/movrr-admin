# Admin creation workflows: P1 identity provisioning

Status: source remediation verified locally; production migrations and deployment require explicit approval. Incident account remains unchanged.

## Production evidence and root cause

On 2026-10-20, read-only inspection confirmed the reported error:

`invalid input value for enum user_role: "partner_operations_manager"`

The designated account has an Auth identity, an active `public.user` with role `rider`, and an active Rider profile. It has no `admin_users` grant, no organisation memberships, no recorded sign-in and no Auth ban. Customer identifiers are intentionally excluded from this repository report; the incident transcript and the read-only inspection command identify the subject.

The failure has four concrete causes:

1. `createUser` sent an employee job role as `server_assigned_role`, then wrote that same string into `public.user.role`.
2. Production `handle_new_user` casts this metadata to the legacy PostgreSQL enum. Its catch-all exception handler substitutes `rider` when the cast fails, then creates a public user and Rider profile in the Auth transaction.
3. The subsequent public-user update, in a separate transaction, raises the enum error. Auth and Rider provisioning have already committed.
4. The error branch calls Auth deletion and ignores the returned error. Production has `auth.users -> public.user ON DELETE CASCADE`, followed by a Rider foreign key with no cascade. The Rider dependency blocks Auth deletion. Isolated PostgreSQL reproduces the enum error, fallback and blocked deletion. No production deletion was attempted to prove it.

The final read-only inspection at 2026-10-20T19:21:52Z confirmed the incident account still has the same state. Shop remained `disabled` with redemption disabled; the account-deletion request gate remained enabled. This work issued no production DDL, business writes, Auth Admin mutations, permission changes or deployments.

## Role authority and boundaries

| Domain | Authority | Meaning |
|---|---|---|
| Public account classification | `public.user.role` | Existing coarse enum; employee profiles use `admin` |
| Employee job role | `admin_users.role` + canonical employee templates | Exact employee capabilities; new writes use canonical names |
| Organisation access | `organisation_membership.role` + bundle key | `owner`, `manager`, `staff`, `viewer` for an actual tenant |
| Auth identity | `auth.users` | Authentication and ban/confirmation state; metadata is not an employee permission authority |
| Creation intent/recovery | Provisioning and creation ledgers | Immutable request identity and stage, never a capability source |

`partner_operations_manager` is the existing employee template with bundle `employee.partner_operations_manager`, not a legacy enum value or tenant membership role. Its existing capabilities include partner approvals, reward/catalog operations and fulfilment operations. It does not gain user-role assignment or tenant ownership through provisioning.

The approved architecture explicitly keeps employee RBAC separate from organisation RBAC and excludes expanding the public enum with job titles. No enum values, capability bundles or compatibility aliases were added. New account creation accepts canonical employee names and product roles only. Historical aliases remain readable through the existing template resolver; they are not new account creation options.

An employee does not automatically receive a partner/organisation membership. The existing `organization` form field is descriptive text, not a tenant ID. Explicit organisation/membership fields are rejected by employee creation. Tenant staff creation rejects employee job roles and cannot assign access across organisation boundaries. Existing-user staff addition and Workboard invitation do not create another Auth identity or Rider.

The employee template's `organisation` data-scope preset is declarative: the existing dashboard architecture does not implement tenant row filtering for employee capabilities. This change preserves that approved boundary and does not claim that the preset enforces tenant isolation. Organisation principals retain their actual membership boundary.

## Permanent corrections

Migration 068 and the identity services reserve a stable UUID and exact, authorized input before contacting Auth. The Auth insert trigger reads that durable reservation by UUID. This is essential: real GoTrue HTTP tests show custom application metadata may be attached after the initial Auth insert. Depending on insertion-time custom metadata alone would leave the profile incorrectly active.

The trigger supplies the correct coarse account type and bootstrap fields from the reservation, enforces a ban, and marks reserved profiles pending inside the Auth transaction. Employee bootstrap cannot create a Rider. Ordinary signup without an employee reservation retains the existing Rider path. Explicit invalid or operational metadata without an authorized reservation is rejected instead of reaching the old Rider fallback.

After Auth creation, a database RPC commits the exact public profile, employee grant or intended product profile, creation audit and durable stage together. Waitlist conversion commits its conversion link in that same transaction. Auth activation follows database persistence. Persistence failure leaves the new Auth identity banned, the public profile pending, and no employee/tenant grant. Retries reconcile the reserved UUID, reject changed input or ownership and preserve completed/changed accounts. Activation failure remains recoverable. This is a durable workflow across separate transactions, **not distributed atomicity**.

Setup-email failure no longer deletes or apparently rolls back a committed account. The UI reports creation success with a delivery warning. Notification delivery remains an external operation; this change does not promise exactly-once email delivery.

Role edits update public classification and the exact employee grant atomically. Combined profile/role edits share that transaction. Ordinary profile edits, suspension and reactivation no longer rebuild an employee's role from the coarse public enum. Both dashboard and Platform employee lookup enforce active account status. Privileged assignments retain the existing approval capability and self-escalation is denied.

Migration 069 adds transaction/replay boundaries for the wider demonstrated defects. Its dispatcher uses the existing capability vocabulary and server-only RPCs; private record helpers are not callable by application roles. It preserves the existing catalog/Shop command, partner/location transactions and controlled retirement boundaries.

## Wider workflow review

| Implemented Create/Add/Invite/Import path | Review result / correction |
|---|---|
| User: employee roles | Correct role domain, preflight authorization, durable reservation, pending/banned bootstrap, exact grant, replay and audit |
| User: ordinary Rider | Same durable safety boundary; correct intended Rider profile and location; real ordinary `/signup` remains operational |
| Advertiser creation | Complete advertiser profile persists before activation; no Rider; failures/retries retain the owned pending identity |
| Waitlist approval/conversion | Stable identity and conversion link; public/Rider/waitlist persistence is transactional; email verification remains separate from manual verification |
| Employee role/profile editing and suspension | Atomic grant/profile edits; no coarse-role downgrade or accidental generic-Admin promotion; active-status checks preserve exact role |
| Organisations / Partner Operations create | Existing organisation/partner transaction gains replay; bound partners cannot be silently reparented by a duplicate name |
| Add organisation staff | Natural unique membership key; identical retry returns the existing membership; conflicting access requires a role update; cross-tenant and owner-escalation guards |
| Partner locations | Existing location/reward-link transaction gains creation replay; wrong partner/reward association rolls back |
| Reward catalog create | Partner creation/linking and the existing audited catalog command share the transaction; draft/independent-approval rules preserved |
| Catalog media Add/upload | Existing staged upload, compensation and version checks reviewed; no new identity/role domain or Shop-state changes |
| Campaign create / duplicate | Campaign, route attachments and creation audit commit together; failed attachment leaves no campaign; immutable operation replay; advertiser cannot select another tenant's identity/routes |
| Route create / template / duplicate | Route, stops, campaign zones and hot zones commit together; PostGIS validates/normalizes polygon input; request replay |
| Route detail Add/save stops/zones | Whole save is transactional, including new and existing children; parent/retirement checks; confirmed IDs replace temporary UI IDs |
| Assign route to Riders | Route lock serializes concurrent batches; natural membership deduplication; assignment and audit share one transaction |
| Suggested route create | Existing schema/enum contract retained; server-owned actor and operation replay |
| Workboard bootstrap | Team and owner membership are one transaction; concurrent requests cannot leave ownerless/duplicate teams |
| Workboard board/card Add | Existing team/board/write-membership checks plus immutable operation replay; refresh failure cannot appear to undo creation |
| Workboard invite / resend / accept | Existing-user-only model, active employee eligibility, pending uniqueness and existing resend recovery retained. Production accept SQL's ambiguous `ON CONFLICT (team_id,user_id)` now names the existing constraint; membership and acceptance remain atomic |
| Pro Tip create | Server schema validation and operation replay |
| Incident create | Existing operation UUID, server schema and atomic incident command reviewed; unchanged |
| Notification send/create | Existing durable queue, operation UUID and batch recovery reviewed; unchanged |
| Voucher-code import | Existing audited import transaction, target ownership and code uniqueness retained; UI reuses its idempotency key after failure/lost response |
| Manual badge award / creator grant | Existing natural unique keys prevent duplicate entities; existing explicit already-awarded feedback and grant upsert retained |
| Settings defaults / operational inserts | Existing keyed upserts/default initialization reviewed; no identity provisioning or role fallback |
| Account-deletion suppression import | Existing reviewed proposal/receipt/idempotency path inspected; no changes to its services, policies or operating gates |

Rider-facing participation, reward redemption, fulfilment financial commands, account deletion execution and Mobile runtime/UI were not rewritten. The relevant existing suites remain part of verification. There is no automatic cleanup or reclassification of the incident account.

## Regression evidence

The combined Vitest run passed **732 tests across 67 files**, with the two opt-in suites enabled: 33 isolated PostgreSQL provisioning tests and 7 real GoTrue HTTP tests. The separate PostgreSQL/PostGIS creation runner passed **79 assertions**. `npm run typecheck` and the optimized Next.js build passed. The unused-installation rollback rehearsal passed 8 assertions; the existing Shop and account-deletion preservation suites passed 306 and 87 assertions respectively, using dedicated localhost fixtures.

| Mandatory scenario | Evidence |
|---|---|
| Successful Partner Operations Manager | Exact `admin_users` template, coarse public `admin`, correct status; PostgreSQL and real Auth HTTP |
| Invalid role before side effects | Canonical request schemas, RPC validation and real Auth invalid-metadata rejection; no Auth/public/Rider row |
| Wrong organisation/role combination | Employee request rejects membership/tenant keys; staff commands reject employee job roles |
| No employee Rider | Exact persisted-state queries in SQL and real Auth suites |
| Auth succeeds, grant fails | Injected employee-grant trigger failure; banned Auth, pending profile, no grant/Rider; same UUID recovers |
| Duplicate/lost-response retry | Lost Auth/DB response injection, durable stages, immutable replay and exact row counts |
| Concurrent requests | Real Auth and SQL concurrency; one identity/grant; one creation aggregate or membership |
| Existing-user invitation | Production invitation baseline ambiguity reproduced; acceptance/replay and injected rollback tested with an existing employee and unchanged Auth count |
| Ordinary Rider signup | Real GoTrue `/signup`, Admin Rider creation and intended profile/location state |
| Other valid roles/capabilities | All 16 canonical employee roles; canonical template tests and role-assignment authorization |
| Cross-organisation / unauthorized assignment | Staff scope/ownership tests, advertiser ownership checks, RPC/helper ACL assertions and privileged-role denial |
| No leftover active identity/grant after persistence failure | New Auth remains banned; pending/inactive profile; no employee/tenant grant; no destructive compensation. Existing invitation targets remain their existing legitimate identities |

Tests use synthetic, isolated databases and captured production contracts. They are not a full production clone. Auth HTTP uses GoTrue v2.197.0 and the actual installed Auth SDK; RPC SQL runs in separate PostgreSQL transactions. Provider email delivery, full production trigger/dependency rehearsal and production deployment smoke tests are not claimed as completed.

## Reproduction and rollout

The approved 068 → 069 production rollout and exact Git-source deployment of
`7d5d53753a1c68b10c49ec614e4360c580e8f9ce` completed on 2026-10-20. See
[production evidence](../verification/admin-creation-rollout/README.md) for the
journal checksums, deployment ID, preserved-state fingerprints, independent
security checks and verification limits. The earlier verification results above
describe the pre-rollout candidate; no incident-account repair was performed.

Use dedicated localhost PostgreSQL 17 on port 55442 and PostgreSQL 17 with PostGIS on 55443, with test-only user `postgres` and password `isolated-local-test-only`. The real Auth suite starts/removes its own cached GoTrue container on localhost 55444. It never loads production `.env`.

```powershell
$env:MOVRR_EMPLOYEE_POSTGRES='1'
$env:MOVRR_EMPLOYEE_AUTH_HTTP='1'
npm.cmd test -- --reporter=dot
node scripts/test-creation-workflows.cjs
npm.cmd run typecheck
npm.cmd run build
```

Read-only production inspection is separate and explicit:

```powershell
node scripts/inspect-creation-provisioning.cjs <incident-email>
```

Before approving production rollout, review the candidate SQL and captured-contract drift, provisioned-ledger ownership/retention, and the production trigger/dependency set. Apply **068, then 069**, and deploy the verified Admin source in a coordinated window. The old employee-create implementation will fail closed under the new reservation guard until the Admin deployment is complete. Neither migration enables Shop, changes the account-deletion request gate, expands enums, alters capability bundles or repairs customer identities.

Recovery uses the original authorized request and reservation UUID. `reserved` means Auth/database persistence needs reconciliation; `ready` means the database committed and Auth activation/acknowledgement may need retry; `complete` replays without new identities. Conflicting or subsequently changed accounts require review; a retry never adopts an unrelated email match. Unresolved reservations are retained as evidence rather than deleted by best-effort compensation.

`scripts/manual/creation-workflows/rollback-unused.sql` is an approval-gated DDL rollback for an unused installation. It refuses to discard provisioning, creation or role-assignment evidence. Once used, preserve ledgers and prefer a reviewed forward recovery. It does not reverse business data or automatically repair the incident. Rolling back to the old unguarded employee-create behavior would reintroduce this P1 and is not a containment strategy.
