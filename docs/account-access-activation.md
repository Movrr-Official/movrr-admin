# Production activation — 28 October 2026

Organisation invitation recovery is **enabled and verified** on [MOVRR Admin](https://admin.movrr.nl). The user confirmed directly in the production Supabase Dashboard that **Email OTP Expiration is 3,600 seconds**, separately from Access Token Expiry.

`ACCOUNT_ACCESS_RECOVERY_ENABLED=true` is saved in the existing Vercel production configuration and explicitly enabled at build/runtime in deployment `dpl_Cb4ZtZk4SsnxJUerwW2bcfhaW85E`. The deployed authenticated `getAccountAccess` action returned `recoveryEnabled: true`. Its eligible states expose **Resend Invitation** and **Send Setup Link** to employees with the required permissions. Accounts in cooldown retain the existing disabled/retry state.

## Production verification

The final controlled run completed at **12:04:50 Europe/Amsterdam** using a dedicated synthetic organisation, synthetic recipients on Resend's test domain, and a real MFA-authenticated synthetic employee session. It invoked the actual deployed Next server actions over HTTPS; it did not mock the employee boundary or fabricate an existing employee session.

| Check | Result |
| --- | --- |
| Production feature gate and action eligibility | Enabled; setup and Owner invitation resend eligible for the authorized operator |
| Real employee MFA | Verified at AAL2 |
| Unauthenticated access | Redirected/denied |
| Organisation-only principal | Denied |
| Owner approval restriction | Employee without Owner approval denied |
| Cross-organisation request | Denied |
| Synthetic setup email | Provider-confirmed `delivered` |
| Synthetic Owner invitation resend email | Provider-confirmed `delivered` |
| Organisation name and expiration guidance | Present in both emails |
| Expired setup link | Rejected by the production customer app |
| Fresh setup link | Accepted by the production customer app and redirected to password setup |
| Replayed setup link | Rejected |
| Concurrent resends during cooldown | Promptly denied; no duplicate invitation attempt recorded |
| Audit evidence | Attempts, accepted submissions and confirmed delivery recorded |
| Existing production memberships | Exact before/after record digests unchanged |
| Synthetic memberships | Exact before/after record digests unchanged |
| Affected user | Not contacted |

Expiry was tested without waiting an hour: only the exact newly created synthetic Auth identity's recovery timestamp was moved to 3,601 seconds in the past. The same emailed link was then submitted through the actual production confirmation form and rejected. The project expiry policy was not changed. The Owner invitation's membership acceptance link was never followed, and no organisation membership was activated, revoked or edited by the test.

The two messages in the final passing run were sent only to Resend synthetic recipients. An earlier setup message was also delivered during troubleshooting. The earlier invalid-address submissions were rejected and preserved in the audit trail; no customer received them. Authentication links, session tokens, MFA secrets and provider email bodies were held only in process memory and were not written to release evidence or logs.

## Correction discovered during activation

The live concurrency check exposed a PostgREST retry problem: migration 087 raised SQLSTATE `40001` for expected cooldown/rate-limit conflicts. The hosted PostgREST version treated these as retryable transactions, causing requests to hang. This behavior is documented in [Supabase's advisory](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions).

Forward migration **088**, recorded as `20261028110000`, changes only three business error codes in `begin_account_access`: cooldown/hourly-limit rejections return `PT429`, and a superseded invitation returns `PT409`. The Admin action recognizes these responses. Authority checks, lock order, durations, limits, membership rules and private grants are unchanged. Production verification confirmed the exact three-code diff, preserved ACLs, and no membership writes. The passing end-to-end run exercised the corrected concurrent cooldown handling. No retrying recovery backend remains active.

Added provider diagnostics log only a fixed category and reason label. This identified an overly long plus-address in the synthetic fixture, which was replaced with a bounded Resend test address. No production email credential was exported or changed.

## Verification and release evidence

- Final full Admin suite: **1,017 passed**, 111 opt-in tests skipped.
- Explicit local PostgreSQL identity/recovery suite with migration 088: **24 passed**, eight separately gated HTTP tests skipped. The final production end-to-end run exercised real hosted HTTP, Auth and email behavior.
- Recovery action tests: **16 passed**, including HTTP 429/409 handling and sanitized diagnostics.
- Admin TypeScript/lint and the final Vercel production build passed.
- Public production smoke checks passed: sign-in 200, Users redirects unauthenticated requests, anonymous recovery RPC calls denied with 401.
- Earlier web regression results remain 190 passed; no customer-app source changes were needed.

Evidence is retained in [the activation evidence directory](verification/account-access-activation-20261028/activation.json), including `production-e2e.json`, `http-error-migration.json`, `synthetic-fixture.json`, and `cleanup-verification.json`. The original release evidence remains under `verification/account-access-20261028/`.

## Synthetic fixture cleanup and retained evidence

The six synthetic accounts were permanently removed on 2026-10-28 at the owner's request, following a successful rollback rehearsal. Their Auth identities, credentials, sessions, Admin profiles, public profiles, four synthetic organisation memberships and two synthetic invitations were removed. Independent database and Auth API checks confirm their absence. No pre-existing account or membership was changed. Historical provisioning records remain as verification evidence.

Invitation, delivery, platform and deletion audit records remain unchanged. The nine synthetic dashboard session activity records that depended on the deleted profiles are preserved in `synthetic-session-activity-archive.json`. The existing durable managed-write hold remains unchanged, including its indeterminate outcome; it was neither cleared nor marked successful. It references a removed synthetic identity and does not prevent production recovery for eligible users.

The exact-six cleanup controller is `scripts/manual/account-access/remove-synthetic.cjs`. Its default mode performs a serializable rollback rehearsal; `--apply` commits only after exact identity, dependency and unrelated-record digest checks pass; `--verify-only` checks database absence and six Auth API 404 responses. Production cleanup evidence is retained in `synthetic-removal.json`, `synthetic-removal-rehearsal.json` and `synthetic-removal-verification.json`. The historical end-to-end script refuses to recreate the retired fixtures. No application deployment is needed for this operational cleanup.

The empty `MOVRR synthetic recovery verification` partner organisation (`1f6de656-c4f0-4c66-9837-760b6095f763`) was subsequently removed at the owner's request. It had no partner profile, locations, memberships, rewards, fulfilments or other UUID references. A rollback rehearsal and committed cleanup verified that every unrelated record in the dependency scope and retained audit tables stayed unchanged. A further production inventory found no remaining synthetic Auth users, public users, partner accounts or organisations matching the activation fixtures or synthetic naming markers. The controller is `scripts/manual/account-access/remove-synthetic-partner.cjs`; its rehearsal, applied and independent verification evidence is stored as `synthetic-partner-removal-*.json` in the activation evidence directory.

To disable recovery, set the production feature gate to false and redeploy the existing Admin project. Retain migrations 087/088 and their audit records. The affected user's invitation still requires explicit authorization; none was sent during activation.
