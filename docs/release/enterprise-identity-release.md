Current release state: see [production release](enterprise-identity-production.md). Approved migrations are installed and pinned applications promoted. ID-25 requires a focused Admin ingress correction; do not replay migrations or backfill. The following requirements preserve the original reviewed procedure and historical preflight state.

# Enterprise identity release requirements

**Approved rollout stopped in preflight; amended SQL requires renewed approval.** The exact original release was authorized on 21 October 2026, but its missing Advertiser column and search-path-dependent policy rewrite failed verification before production changes. See [the stopped-rollout report](enterprise-identity-rollout-stopped.md) for corrected 071/075, exact backfill scope and evidence. Both application repositories disable automatic deployment from `main` in `vercel.json`. No deployment, migration, synthetic production account, role change or financial mutation has been performed for this remediation.

Source and isolated acceptance: [architecture](../architecture/enterprise-identity.md), [findings matrix](../architecture/enterprise-identity-findings.md), [verification](../verification/enterprise-identity/verification.json). Exact source commits and migration SHA256 values are recorded in the verification receipt. Checksums use UTF-8 source normalized to LF; compare that representation before execution. The existing launch roadmap retains unrelated completed milestones.

## Required approval scope

Approve the seven reviewed SQL migrations below, including their ACL/RLS changes and the explicit historical Advertiser ownership backfill, followed by coordinated Admin and authenticated-web deployment from the recorded commits. An existing active canonical super administrator must be explicitly selected as `movrr.migration_actor` for migration 074. The snapshot contains one active historical Advertiser and zero organization memberships; reconcile this again immediately before execution. Existing Manager memberships must not be renamed or upgraded to Partner Operations Manager.

This release approval does not authorize synthetic production accounts, marketing/provider messages, financial test transactions, irreversible deletion, Shop redemption activation or Mobile releases. Authenticated acceptance can be performed by the owner using legitimate approved identities. Any operator-performed account/role mutation for that acceptance requires its own explicit authorization.

## Migration order and contracts

| Order | Source | Change |
| --- | --- | --- |
| 071 | `scripts/071_external_account_domains.sql` | External role catalog and role/bundle integrity; canonical membership command; account/Auth guards; recoverable external reservations; exact Auth insert trigger; shared reservation exclusions; retire direct membership and user creation grants |
| 072 | `scripts/072_organisation_invitations.sql` | Issue, verified acceptance, expiry/version checks and revocation in existing invitation ledger |
| 073 | `scripts/073_account_status_and_staff_commands.sql` | Expected-role employee command, drop old three-argument signature, canonical profile/status changes and durable Auth reconciliation; retire direct employee grant DML |
| 074 | `scripts/074_identity_consumer_authorization.sql` | Active capability-based creation contract; migrate explicit active advertiser.user_id ownership to an organization Owner grant using the approved actor |
| 075 | `scripts/075_identity_rls_capability_boundaries.sql` | Capability/MFA RLS predicates; current identity guard; tenant campaign/Advertiser checks; retire historical owner helper and direct client campaign writes; preserve explicit Mobile personal-route author/contract; protect client identity/status/certification fields |
| 076 | `scripts/076_identity_notification_audiences.sql` | Explicit active domain/staff notification audience selection without legacy enum authority |
| 077 | `scripts/077_invitation_authority_boundaries.sql` | Retire public resend/expiry EXECUTE and old one-argument commit/abort; service-only Workboard actor/scope/token checks, abandoned preparation recovery and organization invitation protection |

All migrations require installed 070 and preceding platform schema. They preserve financial/audit rows and IDs. Existing PostgreSQL `user_role` is not expanded or dropped. Installation must use the approved database owner/migration role; journal each filename, version and exact checksum once. Do not run historical 068/070 bootstrap scripts again. Each reviewed file has its own BEGIN/COMMIT; SQL is atomic within that migration, not across seven files or Auth/deployments.

## Execution after approval

1. Record current main/deployment identifiers and database backup/recovery reference. Rerun the read-only inspector with an explicit evidence destination: `node scripts/manual/enterprise-identity/inspect-production.cjs <output.json>`. Confirm production still matches the reviewed 070 baseline or re-review drift. Verify no competing migration/version collision.
2. Arrange a short coordinated operational hold on Admin account/membership mutations during schema and application cutover. This is an operator release procedure, not a new feature flag or staging prerequisite. Do not disable ordinary Rider sign-in or deletion request intake.
3. Reconcile existing Auth/profile/reservation states, organisation types, role/bundle consistency, advertisers with null or mismatched organization IDs and current active owners. Preserve ambiguous/suspended historical records for explicit review; do not infer a membership from public.user.role. Resolve any failing prerequisite before migration.
4. Install 071, 072 and 073 in order. Set the approved active super administrator UUID in the migration session using `set_config('movrr.migration_actor', <approved UUID>, false)` before 074, and apply 074, then 075, 076 and 077. Preserve resulting audit records. Reset the session setting afterward. Any check failure is a stop condition; do not force constraints or bypass guards.
5. Deploy the recorded Admin and web commits together. New code requires the new SQL RPCs; old code must not remain the active account-management writer. Validate configured CUSTOMER_APP_URL/APP_URL and Supabase callback allowlist for the existing customer web origin. The acceptance page uses that origin; no new provider or infrastructure is required.
6. Rerun read-only inspection: verify expected function definitions/checksums and ACLs, no obsolete three-argument employee signature, no user_owns_campaign helper, no membership/employee direct grant DML, expected role checks, membership/bundle constraints, no broad is_admin/is_dashboard_admin RLS predicate, correct explicit advertiser backfill and its audit. Verify policies against production schema, including modules outside the isolated fixture subset.
7. Reconcile reservations and pending account_auth_sync receipts through canonical commands; do not directly alter reservations or resurrect revoked grants. An Auth outage may leave a durable pending receipt. The Admin recovery control retries the exact committed status, with version checks, rather than replaying a stale profile edit.
8. Owner acceptance: for each domain, and specifically **external Partner Operations Manager**, perform Create → Save → Reload → Edit → Save → Revoke with an approved legitimate identity. Confirm the shown domain, organization, exact role and status equal persisted values; no Rider/staff side effects. Exercise explicit multi-workspace selection, cross-tenant denial, current-session revocation, operational staff management and owner/peer escalation denial. Complete invitation issue/verified accept/retry/revoke using an authorized controlled recipient. Record browser and provider evidence separately from automated acceptance.
9. Recheck gates and reconcile identity/membership counts, financial table invariants and audit continuity before ending the operational hold. Update findings only for behavior actually accepted. Do not mark ID-20 closed from an anonymous health response.

## Protected operating states

Read-only production snapshot at 2026-10-21T09:01:55Z:

- Account-deletion request intake: **Enabled** (`requests_enabled=true`, operating_state=enabled, policy version 2).
- Irreversible/managed-resource deletion execution: **Disabled** (`managed_resources_execution_enabled=false`).
- Public Shop redemption: **Disabled** (`shop_release_control.state=disabled`, `redemption_enabled=false`).

The release must leave these values unchanged. No Mobile runtime, approved Rider interface, EAS build/channel or public website deployment is included.

## Failure and recovery

Before each migration transaction commits, a failure rolls back that file. After commit, preserve new identities, receipts, memberships, audit and historical data. Do not downgrade to the known permissive authorization functions or restore legacy direct-grant writers. If cutover fails, retain the mutation hold and fail closed, diagnose from preserved receipts and ship a reviewed forward repair. Reverting an application requires checking RPC/signature/schema compatibility first; old main is not automatically a safe rollback after direct grants/signatures have changed. Database restore is a separate explicitly approved disaster-recovery operation and must account for intervening financial data.

No unreviewed automated down-migration or destructive rollback is provided. The recoverable Auth/database protocol deliberately preserves failed owned identities, keeps them banned before persistence and never deletes valid financial/account history as compensation.
