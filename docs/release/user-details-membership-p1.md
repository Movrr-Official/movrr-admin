# User Details and membership management P1

Date: 2026-10-21. Source and isolated acceptance complete; production deployment and authenticated production UI acceptance pending. This change requires an Admin-only deployment, with existing migrations 071–079. No migration, permission grant, web or Mobile release is required. Migration 080 and concurrent account-activity/cleanup work are excluded from the deployment source.

## Demonstrated production cause

Vercel retained runtime logs for production deployment `dpl_8LSDe7hSSjpb2NgZjGC2sqjNFrrR` (source `083fe8ce749e012dea6812cafea10289bdd8a2eb`) contain `/users` POST failures at `2026-10-21T14:55:19.784Z` and `14:57:12.794Z`: **Cannot remove last active organisation owner**, digest **3448287092**. Read-only production SQL at `15:04:10.952Z` confirmed the Rider + internal Staff + Partner account has an active Partner Owner membership with exactly one effective active Owner. A separate Advertiser Owner has the same ownership protection. No private identifiers are included here.

The removed `components/users/AccountMemberships.tsx` exposed assignment, immediately persisted role selection and Revoke inside the View header. It checked the actor's broad capability but not sole-Owner protection. The prior `changeAccountMembership` action threw the SQL denial. Next.js redacted that expected Server Action exception into its production Server Components error; the client displayed that message inline. This is a demonstrated denial/error-presentation defect, not evidence that the canonical SQL should permit removing the final Owner.

The canonical safeguard remains in `scripts/071_external_account_domains.sql:87` (`change_organisation_membership`), particularly expected-version validation and last-Owner rejection at lines 117–121. Production membership data has not been changed for this task. The reported Owner remains intentionally protected until another authorized effective Owner exists.

## Findings and independent final review

| ID / severity | Initial evidence and impact | Permanent correction / exact source | Final disposition |
| --- | --- | --- | --- |
| UD-01 / P1 | Old `AccountMemberships` mounted in `UserDetailsDrawer` View header; mutation controls and asynchronous failures disrupted read-only details. | Delete old component. `UserDetailsDrawer` renders concise actual memberships inside Basic Information only; `OrganisationMembershipEditor` mounts inside the existing Edit form. `UsersTableContent` sends Edit, Manage Access and Reset Password to that same drawer. | Partially Resolved: source and isolated rendering verified; production acceptance pending. |
| UD-02 / P1 | Two production log events above show SQL last-Owner denial thrown by `app/actions/accountMemberships.ts`, causing generic Next production error. | The same action returns typed expected denial/conflict results; framework redirects propagate, unexpected failures remain logged. `features/identity/domain/membershipManagement.ts` defines its result contract. No fabricated empty reads or authorization bypass. | Partially Resolved: actual action → local PostgREST → PostgreSQL denial verified; deployment pending. |
| UD-03 / P1 | Revoke enabled for sole Owner despite verified production owner count of one; operation cannot succeed by design. | `getAccountMemberships` computes effective other Owner guidance using existing `account_identity_active`; Edit disables protected controls with the exact reason. SQL remains authoritative for races. Ordinary authorized revocation persists, audits and survives reload. | Partially Resolved: isolated successful revoke, forbidden Owner and concurrency cases verified; production acceptance pending. |
| UD-04 / P1 | Isolated rendered multi-domain Edit → Save exposed Radix empty initialization overwriting an existing Staff selection and failing schema validation. | `UserDetailsDrawer` ignores empty initialization; only explicit canonical selections or explicit removal change Staff access. Profile baseline survives membership refresh. | Partially Resolved: real rendered form regression verified; deployment pending. |
| UD-05 / P2 | Previous role dropdown persisted immediately; read/cache failures and parent refresh could lose unsaved edits or misrepresent committed outcomes. | Explicit Save Assignment; version-bound row drafts and profile baseline; validate canonical mutation receipt; distinguish committed refresh failure from denied/unknown mutation. Paginated membership, organisation and invitation readers; all live callers migrated. | Partially Resolved: isolated handler/DOM cases verified; deployment pending. |

No finding is marked Fully Resolved solely because tests pass. The final source review confirms there is one membership writer, the existing canonical RPC; no SQL/role aliases, default Rider paths, permission evaluators or compatibility writers were added. Create User's organisation lookup uses the new typed read result and retains its existing provisioning contract.

## Corrected presentation and authorization

View retains existing Basic Information → Account Activity hierarchy, cards, typography and controls. It contains identity, independent account-type/role badges and account Status once. Organisation details are compact read-only lines, absent when there is no actual non-revoked membership. View has no assignment, role mutation, Revoke, recovery or password-reset controls. Rider-only and Unassigned accounts need no organisation. Edit retains the existing profile form and contains explicit organisation assignment, role Save, revocation, invitation operations and Access History. Recovery is shown only for pending recoverable account synchronization.

Actor capability and MFA checks still precede the canonical mutation. SQL checks active actor/target, tenant scope, role ceiling, Owner approval, expected exact timestamp and final effective Owner; audit and membership transition remain in the same transaction. Full timestamp precision is passed unchanged. Revoking organisation access preserves User, Rider, Staff, Wallet and history. Parent profile Save/Cancel are blocked while membership work is pending. Permission denials and stale commands never claim success.

## Verification and limits

The verification receipt and local visual evidence are under `docs/verification/user-details-p1/`. Tests ran against a detached source snapshot based on `c82a74b`, containing only this P1 source patch. Concurrent activity and Rider-correction changes in the shared working tree were excluded.

The suite includes real PostgreSQL migration/RLS/tenant/Owner/version tests, real local GoTrue provisioning and actual membership Server Actions over local Supabase/PostgREST to PostgreSQL. Local test accounts are confined to isolated Docker fixtures. Account combinations include User-only, Rider-only, Partner-only, Advertiser-only, Government-only, Staff-only and Rider + Staff + Partner. Coverage includes assignment, explicit role Save, reload, successful revoke/reload, forbidden Owner removal, stale/concurrent updates, suspended/revoked actors, cross-tenant denial, invitation read/revoke and preservation of identity/financial/audit evidence. UI tests exercise actual React components and form submissions; handler tests verify expected errors and committed-but-refresh-failed feedback.

Local headless Chrome renders captured real component DOM with the production build's CSS and fonts. Rider/multi-domain View geometry, card order and read-only control assertions are checked; multi-domain Edit/sole-Owner states are visually reviewed. `scripts/manual/user-details/render-visuals.cjs` reproduces this check using test captures. These are fixture-based local rendered checks, **not authenticated production browser acceptance**. No unsolicited email, production invitation, synthetic production identity or financial test transaction was used. External email delivery is not claimed.

Production inspection was read-only. Existing 071–079 journal entries were observed; operating gates remained deletion intake Enabled, irreversible execution Disabled and public Shop redemption Disabled. This task issues no production DML/DDL/deployment, so it does not claim a new production-wide protected-record fingerprint comparison. Separate cleanup evidence and account-activity work remain intact.

## Release and remaining acceptance

1. Obtain explicit approval for the exact verified Admin source commit in the receipt. Earlier approvals name different revisions and do not authorize this deployment.
2. Deploy only that revision with the existing Admin release procedure; verify deployment SHA, ID and production aliases. Do not include concurrent migration 080 or unrelated runtime changes.
3. Complete the already grouped authenticated Users table/User Details acceptance: real counts/loading/search/filtering, View read-only hierarchy, same-drawer Edit navigation and truthful sole-Owner restriction. Use non-destructive existing-account inspection. Any real membership mutation requires appropriate authorization; do not create synthetic production data for acceptance.
4. Record source-versus-deployed acceptance separately. If validation fails, contain the affected Admin release; never restore retired role writers or weaken Owner/tenant guards.

The launch roadmap adds this P1 source-ready milestone without reopening completed Users dashboard backend acceptance or altering parallel cleanup/activity milestones.
