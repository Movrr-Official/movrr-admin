# Enterprise identity production release — 21 October 2026

The approved corrected SQL and both pinned applications are deployed. **Complete acceptance is blocked by ID-25: the Admin cookie proxy intercepts canonical external bearer APIs.** The verified source correction awaits approval for a new Admin deployment. No additional SQL, backfill or web deployment is needed for that correction.

## Installed release

- Migration source: `43b15cd46c8aaf56fcba427bacbf145a75777ba7`; 071/075 are corrected and the other five approved files are unchanged. All seven exact bodies and journal entries committed in one database transaction.
- Admin: `8d7320ea96325bbc9adbc67f7e4b820baba9c5e1`, deployment `dpl_Cpxc7H62VD3zLpCdVot4MzGYFe8X`, `admin.movrr.nl`.
- Web: `5e44a6fdc8a03ab2241b43faef5dd7e1a27cc5b0`, deployment `dpl_FgZDgMTfSM3Zaaaov2VSc2xdCp35`, `app.movrr.nl`.
- Both builds reached READY before migration. Project production targets and custom-domain aliases match these deployment IDs. Scoped holds were verified, then removed after promotion; both firewalls remain enabled with zero custom rules. Automatic deployment from main remains disabled.

The exact seven journal versions, SHA256 checksums and protected-table comparisons are in the [production receipt](../verification/enterprise-identity/production.json). The original [stopped-rollout report](enterprise-identity-rollout-stopped.md) and [correction receipt](../verification/enterprise-identity/rollout-blocked.json) remain historical evidence, not the current production state.

## Actual backfill and preservation

Exactly one canonical Advertiser organisation was created, the verified existing profile was linked, and its verified existing identity received exactly one active organisation Owner membership. One authorization audit records the existing approved super-administrator actor. No ownership came from user_role. No other membership or identity was created or changed.

The first transaction attempt rolled back when the verifier encountered a lazy deletion write-guard row. Journal, schema, ACL and gate comparisons confirmed rollback to 070. Investigation proved this is the existing deletion barrier protecting the authorised profile/membership write. The full-schema local rehearsal was extended with 83 non-personal barrier bindings and 16 parent bindings and reproduced exactly one unrestricted guard for that fixture identity. Verification now permits only that one subject's new unrestricted row, requires no deletion job and preserves every existing guard. The approved migration SQL was never changed. The subsequent transaction passed and committed.

All 150 other protected table fingerprints matched before/after the migration and immediate independent readback, including Auth users, public identities, Riders, Wallet/financial ledgers, campaigns, ride history, provisioning receipts and invitation history. No test financial transaction, synthetic production user, invitation email, Mobile runtime change or EAS build occurred. A later readback after traffic resumed observed ordinary changes in admin_dashboard_sessions, shop_scheduler_state and shop_worker_health. Their before/after fingerprints are recorded separately; all other protected fingerprints still match. These heartbeat changes were not initiated by acceptance and are not represented as unchanged production data.

## Effective production verification

- All 34 reviewed function bodies match exact approved SQL; all 11 external domain/role capability combinations match the canonical catalog. Invalid cross-domain Partner Operations Manager and legacy internal Admin roles have no capabilities.
- The installed Partner Operations Manager membership writer restricts new **and existing** targets to Staff/Viewer within an active reward-partner organisation. Owner, Manager, peer POM and internal grants remain outside its authority. Real isolated handler/PostgreSQL journeys cover Create → Save → Reload → Edit → Save → Revoke. No production Partner membership mutation was performed.
- Service-only granting/invitation RPCs reject untrusted execution. Direct membership/employee DML is denied. Retired granting signatures and broad legacy RLS predicates are absent. Production has 396 application functions and 380 policies.
- Existing Advertiser Owner read-only identity context sees its own profile and campaign/staff capabilities, denies another tenant and denies internal role approval. Five existing staff contexts retain access; privileged checks require MFA. Five active Rider contexts retain current_rider_id and cannot access the Advertiser tenant.
- Account-deletion intake remains Enabled, policy version 2; irreversible execution Disabled; public Shop redemption Disabled.

These are read-only PostgreSQL identity contexts and anonymous HTTP probes, not authenticated browser sign-in. Chrome DevTools has no connected session. Authenticated user-management, workspace, invitation and controlled external email/provider acceptance remain outstanding.

## ID-25 — High — Partially Resolved

Production GETs to `/api/v1/me/memberships` and `/api/v1/organisations` return 307 to `/auth/signin` rather than reaching their JWT handlers. `proxy.ts` uses the historical Rider-only allowlist, while the web client sends Bearer tokens without internal Admin cookies. An external organisation user cannot satisfy the internal staff cookie gate. Source review confirms the same problem for organisation membership/invitation/location operations, campaigns, Government programmes, partner analytics and several fulfillment routes. The existing redemption-cancellation handler was also omitted. This is an availability/functional release blocker; it does not grant unauthorized access.

The focused source correction in [lib/pathMatch.ts](../../lib/pathMatch.ts) and [proxy.ts](../../proxy.ts) replaces the Rider-named helper with one canonical Platform bearer-path predicate and migrates every caller. Exact registered endpoints reach their existing active-identity/tenant/capability handlers. Unknown descendants, internal jobs and Admin pages retain their existing gates. No compatibility alias, fallback identity, permission grant or SQL change is introduced.

[platformIngress.test.ts](../../__tests__/security/platformIngress.test.ts) discovers every registered non-internal Platform route and runs the actual proxy without an Admin cookie; unsafe descendants and Admin pages remain gated. Existing path/discovery tests are migrated. All **860 tests** pass with real PostgreSQL and GoTrue enabled. TypeScript/lint passes. Build status and the exact correction commit are recorded in the production receipt.

Approve only deployment of the recorded ingress correction Admin revision. Keep the currently deployed web and SQL unchanged. Then verify that unsigned API requests receive JSON 401, repeat database/operating-state checks and complete available legitimate authenticated acceptance. Do not repeat the Advertiser backfill or reinstall 071–077.
