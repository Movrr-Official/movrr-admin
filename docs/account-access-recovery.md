# Organisation account access recovery — 28 October 2026

Production backend and Admin UI are deployed. **Recovery is enabled and verified** following the user's direct confirmation that production Email OTP Expiration is 3,600 seconds. See [the activation report](account-access-activation.md) for the real production end-to-end checks and migration 088's cooldown HTTP correction. No affected-user invitation was sent. The initial gated release and its verification are documented below.

## Root cause and existing architecture

Organisation access and Auth onboarding are separate existing lifecycles:

- `provisionExternalAccount` reserves an existing durable UUID, provisions Supabase Auth, then persists the organisation membership through the canonical database commands. Provisioning can install a random credential, so password presence does not prove that the person chose a password.
- `createUser` optionally calls `notifyAccountSetup`, which generates a Supabase recovery link and sends the existing React Email account setup template through Resend. Notification failure returns a warning after the identity has already been committed. It does not roll back that identity or membership.
- `issue_organisation_invitation` uses `platform_invitations`, stores a hashed membership invitation token, and binds acceptance to the exact membership version. Existing invitations expire after seven days. The existing app acceptance page requires signing in with the verified invited email. Acceptance records the recipient and timestamp, then activates the membership using the canonical authority and Owner protections.
- Account setup uses the existing `/auth/confirm` → recovery session → `/auth/reset-password` flow. Password login requires a usable password; an existing federated account can use its identity provider, so password setup can be optional. Recovery link verification itself does not replace the current password.
- Existing Workboard resend RPCs are deliberately restricted to Workboard scope by migration 077 and cannot be reused for organisation membership invitations.

The drawer only exposed generic password reset in Edit User. The membership editor could create/copy a membership invitation link but had no emailed resend/setup recovery workflow or authoritative account access status. Assigning an Owner role does not complete Auth onboarding.

## Implementation

- Added `AccountAccess` to the existing user drawer for external organisation accounts, using its existing Card, Button, typography and spacing. It works in View and Edit modes, displays Auth credential presence separately from sign-in evidence, and reports invitation/membership state, attempt time, expiry, provider status and cooldown.
- Added `getAccountAccess` and `sendAccountAccess` authenticated server actions. Recovery returns no link, token or provider email body to Admin. Auth/provider failures are sanitized and are not logged with their payloads.
- Migration 087 adds four private service-role-only RPCs: `account_access_state`, `begin_account_access`, `finish_account_access`, and `record_account_access_delivery`. No new identity system, membership table, mail provider, worker, cron or staging environment was introduced.
- The recovery command reads the exact existing membership and never changes its ID, user ID, organisation ID, role, status or version. Invited memberships receive a one-hour membership invitation bound to that version. Pending/expired invitations rotate in the existing ledger; revoked, accepted or mismatched invitations are not resurrected.
- The existing Supabase `generateLink({type: "recovery"})` supplies setup/reset links. The returned Auth user ID must match the existing target. There is no password creation, email of a password, Auth account creation, or administrative password update in this workflow. Existing customer-app confirmation and reset pages are reused without an app deployment.
- Extended the existing branded setup template with organisation name, optional membership acceptance action, expiry information and support guidance. Setup links are described as expiring within 60 minutes; enabling the release requires the provider policy to meet that bound.
- Removed the duplicate existing-member invitation-link recovery button from this drawer. New organisation assignment/invitation and revoke workflows remain in the membership editor. The legacy generic reset action directs external organisation accounts to Account Access, preventing it from bypassing the recovery guards. Employee account recovery remains on its existing Admin path.
- Added a server-side release gate, `ACCOUNT_ACCESS_RECOVERY_ENABLED`, defaulting to false. The initial production release explicitly disabled it; the verified activation release sets it to true at build and runtime. Disabled state remains visible and enforced whenever the gate is closed.

## State/action matrix

All send actions additionally require the release gate, platform email/security policy, configured email infrastructure, eligible account, active organisation, employee authority and cooldown/rate-limit eligibility.

| Authoritative state | Available contextual action |
| --- | --- |
| Existing eligible identity, invited membership, no invitation record | Send Invitation |
| Invited membership, matching pending or expired invitation | Resend Invitation |
| Active membership, no Auth password credential | Send Setup Link; password can be optional for federated sign-in |
| Active membership, credential present but no recorded sign-in | Send Setup Link; human setup completion remains unconfirmed |
| Active membership, credential present and sign-in recorded | Reset Password |
| Suspended, inactive, deleted or banned identity | None |
| Inactive organisation or revoked membership | None |
| Revoked/accepted/superseded invitation with an invited membership | None; review membership first |
| Insufficient employee authority or mixed employee identity | None through this external recovery operation |
| Production Auth expiry unconfirmed | None; release disabled |

Historical invitation emails without a recorded receipt are shown as not recorded. Email verification and membership are never used to infer password configuration. A sign-in timestamp is presented as sign-in evidence, not proof of a particular password setup event.

## Security and RBAC

Both the server action and database enforce authorization. Database checks reuse the active account predicate and canonical employee capability map. Sending requires `users.manage` plus `users.role.approve` for Owners or `users.role.assign` for other members. Organisation-only principals cannot invoke the employee recovery operation. The target must have the exact requested organisation membership; supplying another organisation ID fails closed.

The existing authority lock serializes membership/role/status authorization. A per-identity lock serializes recovery across organisations. Durable audit attempts enforce a five-minute cooldown, a fifteen-minute hold for unresolved requests, five target attempts per hour and twenty employee attempts per hour. Provider submissions use a server-generated attempt ID as the Resend idempotency key. These controls do not depend on process-local memory.

Generating a new link supersedes the previous provider recovery token where supported. Membership invitation tokens rotate immediately, so an email failure can invalidate the previous invitation link; the UI reports failure/uncertainty and requires the cooldown before another attempt. The current password and membership remain intact. A process crash leaves visible unknown evidence and a bounded hold rather than silently retrying delivery.

Attempts and outcomes are immutable records in `platform_audit_record`. They contain operation context and provider receipts, never Auth tokens, setup URLs or plaintext membership tokens. Provider delivery observations are receipt-bound and deduplicated in the same audit infrastructure. The private RPC grants and installed function bodies were verified in production against the tested migration source.

## Email verification

Resend API acceptance is shown as **Provider accepted; delivery unconfirmed**. Authorized reads retrieve the provider's `last_event` and expose delivered, delayed, bounced, failed, suppressed or complaint states. A delivered event is described as delivery to the receiving mail server, not evidence that the person read the email. If provider retrieval is unavailable, acceptance remains unconfirmed.

The existing production sender accepted a synthetic message to `delivered@resend.dev`; subsequent retrieval returned `delivered`. The message contained no account link, password or real recipient. Branded template rendering, escaping and text alternatives passed automated tests. Rejected and ambiguous provider submissions, bounce/delay/suppression readback and sanitized errors were separately verified. See `verification/account-access-20261028/email-delivery.json`.

Supabase supports generating links for an existing custom mail provider through its [Admin generateLink API](https://supabase.com/docs/reference/javascript/auth-admin-generatelink). Resend documents the duplicate-submission behavior of its [idempotency keys](https://resend.com/changelog/idempotency-keys). Actual token single-use and expiry behavior was exercised against local GoTrue, rather than assumed from those API descriptions.

## Regression results

| Check | Result |
| --- | --- |
| Full Admin Vitest, `--maxWorkers=2` | 1,014 passed; 110 existing opt-in tests skipped |
| Explicit local PostgreSQL + real PostgREST identity/membership/recovery suite | 32 passed, none skipped |
| Explicit real GoTrue HTTP suite, one-hour OTP policy | 22 passed |
| Web full Vitest suite | 190 passed across 36 files |
| Final drawer/access UI regressions | 31 passed |
| Final email/recovery action regressions | 34 passed |
| Admin TypeScript and lint command | Passed; Admin lint delegates to TypeScript |
| Admin production build | Passed locally and on Vercel |
| Web TypeScript and ESLint | Passed; two existing unused-variable warnings |
| Production HTTP | Sign-in 200; unauthenticated Users redirects to sign-in; anonymous recovery RPCs denied with 401 |

Coverage includes first invitation, expired resend, unchanged memberships and UUIDs, concurrent requests, missing credentials, provisioned credentials, existing sign-in, suspended/deleted targets, hourly limits, Owner approval and sole-Owner protection, cross-organisation denials, provider failure/uncertainty, delivery evidence binding, token expiry/single use, existing password login, and preservation of linked Auth identity records. No external OAuth provider flow or real production account linking mutation was performed.

One broad-suite run hit the existing five-second source-scan timeout while builds/tests competed for CPU. The source-scan passed independently, and the complete suite passed with two workers. A local Auth expiry test initially used GoTrue's longer default policy; the test container now explicitly uses 3,600 seconds, and the expiry test passes. Neither result was used to assume the production setting.

## Deployment and activation

- Supabase project: `kzdvunpuxaxlphqvmzxw`; migration `20261028103000`, source `scripts/087_account_access_recovery.sql`. Deployment confirmed unchanged identity, membership and invitation counts.
- Admin: production `https://admin.movrr.nl`; deployment receipt and immutable backend/HTTP/email evidence are in `docs/verification/account-access-20261028/`.
- Recovery is **enabled**. The user directly verified production **Email OTP Expiration = 3,600 seconds** in the Supabase Dashboard and authorized activation. The existing Vercel production gate is persistently true, with explicit true build/runtime overrides in the activation deployment.
- Migration 088 (`20261028110000`) changes expected cooldown/rate-limit/conflict error codes to PostgREST HTTP 429/409 mappings. It preserves the original migration record, authority checks, membership rules and private grants.
- The production end-to-end check passed with a real synthetic MFA employee session, two confirmed synthetic email deliveries in the final run, expiry and replay handling, concurrent cooldown denial, audit evidence and unchanged membership digests. Details are in [the activation report](account-access-activation.md).
- Sending to the affected user still requires explicit authorization. None was requested or performed during this release.

The initial gated release did not send a setup link. The later authorized activation exercised the deployed actions with synthetic recipients only. Resend Invitation and Send Setup Link are available for eligible accounts and authorized employees, subject to cooldown and platform policy.

## Reproduction and rollback

`scripts/manual/account-access/rollout.cjs` rehearses schema installation in a transaction that rolls back. `--apply` applies only this migration and records it; `--verify` checks the installed migration/source, function bodies and grants. It never generates a link or sends mail. `scripts/manual/account-access/verify-http.cjs` checks the public sign-in/protected route and anonymous RPC denial.

To disable recovery, keep `ACCOUNT_ACCESS_RECOVERY_ENABLED=false` and redeploy the existing Admin project. For an application rollback, restore the prior Vercel deployment while retaining migration 087 and its audit evidence. The migration adds private functions and partial audit indexes; it does not rewrite existing identities, memberships or invitation records during installation. Do not delete audit evidence or rewrite migration history.
