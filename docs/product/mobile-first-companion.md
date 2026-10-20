# Mobile-first companion scope and Community approval

MOVRR Mobile owns Community discovery, creation and participation, Shop purchasing and Partner discovery. The authenticated rider web companion owns account management, historical visibility, Wallet and self-service. Platform consistency does not imply identical feature sets.

## Web scope

Primary navigation: Overview, Campaigns, Routes, Ride history, Rewards, Notifications, Settings. Existing sidebar styling, dimensions, role navigation, selected-state logic and responsive behavior are retained.

Removed web routes: `/dashboard/community`, `/dashboard/partners`, `/dashboard/rewards/shop`, `/dashboard/account`, `/dashboard/privacy`. There are no compatibility redirects. The existing authentication gate applies before route resolution; authenticated missing destinations use Next's existing not-found behavior. Self-service moves to `/dashboard/settings/self-service`; privacy moves to `/dashboard/settings/privacy`. Settings links to these subsections rather than adding all forms to its main page.

Community server actions, form components, the Community Platform adapter, scheduling utilities and rider Shop catalog reader are removed after caller inspection. Production server bundles contain no Community API, rider catalog or Partner discovery consumer paths. Canonical Admin APIs remain for Mobile and legitimate staff/partner roles. Partner catalog management is retained because it serves a separate authorized role.

Rewards retains the canonical Wallet statement and signed CSV export, earns/adjustments, achievements, redemption list, order detail and owned digital credentials. Campaigns, route assignments, completed ride summaries, notifications, account language, equipment/brand self-service, personal export and deletion receipts remain. The existing deletion intake operating gate remains disabled; no financial transaction or deletion request was executed.

## Authoritative Community approval

Approval is an existing `community_ride_creator_grant` row for the rider's account with `revoked_at IS NULL`. It is a specific creator permission, not waitlist approval or merely an active account. Admin's rider drawer already reads it using `riders.read`, and grants/revokes it using `riders.manage` with actor attribution and user activity auditing. Ordinary riders, Support and Moderators cannot grant it. No new role, approval concept or Admin runtime control was introduced.

Mobile UI calls `fetchCommunityRideCreateAccess` / `can_create_community_ride`; creation resolves the authenticated rider and inserts directly into `community_ride`. Cover-image updates follow successful insertion. The Platform creation RPC is `create_my_community_ride(uuid,jsonb)`. Both paths need database enforcement.

Read-only production metadata captured on 2026-10-20 confirms the existing restrictive `community_ride_creator_required` INSERT policy composes with older permissive policies, requiring creator approval and rider/account ownership. Thus the older permissive insert policy alone is not a creation bypass. The helper nonetheless accepts any `admin_users` membership without a creator grant and lacks rider-status / Auth-ban checks. An isolated reconstruction of captured production functions/policies reproduced a suspended rider creating through a direct insert while the public account stayed active. Production customer records were not mutated to reproduce it.

## Migration 065 � deployed with explicit owner authorization

Applied to production project `kzdvunpuxaxlphqvmzxw` on 2026-10-20 as journal version `20261020151107`, from tested revision `be89fbcd11c368d66c9cb8ab9b1fda292aecc59d`. Tested-artifact SHA-256: `6e95dea6827fc7cc02dd88e09d9922739c2281e84f5a98377f29536aa8155f3f`. See [production rollout evidence](../verification/community-065-rollout/production.json).

`065_community_approved_rider_authorization.sql` keeps the helper signature and Mobile contract. Eligibility is current-account-only, requires the existing grant, active rider and public account, no public/Auth deletion, and no current Auth ban. Generic 42501 denials disclose no account details. Admin membership no longer substitutes for rider approval.

An insert/update trigger also covers SECURITY DEFINER paths that bypass RLS. Creation verifies rider ownership and eligibility; rider identity cannot be reassigned through direct updates. Existing official Admin creation through service_role remains available. Delegating rider-organized creation still requires an approved active target rider. Existing creation validation, auto-enrolment, lifecycle triggers and deletion barriers remain installed.

Creation approval is required only for new rides, including RPC retries after eligibility is revoked. Active legitimate organizers may edit/cancel existing rides after grant revocation. Existing ownership, optimistic concurrency, capacity and lifecycle checks remain. Suspended/inactive/banned/deleted organizers cannot mutate, including RPC no-op paths. Discovery and join/leave functions are unchanged; active unapproved riders retain their existing discovery and participation rights. Existing staff participation authority is also unchanged.

No Mobile source, runtime, navigation, native configuration, Shop or Community code was changed. No EAS build or OTA update was generated.

## Verification and operating procedure

- Web: 77 tests across 12 files; TypeScript and production build pass. Changed source/test lint passes. Full lint has 18 pre-existing `no-explicit-any` errors in untouched `services/advertiser.ts` and two existing warnings.
- Admin: 683 tests across 64 files, TypeScript, lint (TypeScript alias) and production build pass. Focused tests cover existing Admin approval grants, revocation and denied roles.
- `node scripts/test-community-authorization.cjs --http`: 56 PostgreSQL assertions plus nine real PostgREST HTTP assertions, using a disposable localhost PostgreSQL 17 database and synthetic identities. Covers the baseline gap, approved/denied creation, account states, bans/deletion, ownership, self-approval denial, RPC replay, organizer rights, legitimate participation, official staff creation, migration replay, rollback and record preservation. Existing alignment database suite: 88 assertions pass.
- Browser history selection is tested with real DOM history traversal in jsdom; existing account-language keyboard/focus tests remain. No connected authenticated browser was available for live production interaction. Do not describe DOM tests as a production browser acceptance pass.

Production rollout and post-commit checks passed. All four rides, four participants and three creator grants retained identical counts and row digests. Read-only checks evaluated all 22 existing identities: two eligible and 20 denied, including one active grant holder with an inactive rider. Unapproved active riders retained public discovery. There are no current suspended, Auth-banned, deleted or revoked-grant subjects; these scenarios were verified by exact deployed guards and the isolated tests, without changing production identities. No successful production creation/edit/participation or Admin grant mutation was performed.

Use `node scripts/manual/community-approval/verify-production.cjs` for read-only identity/RPC/policy checks and `node scripts/manual/community-approval/apply-and-verify.cjs --verify` for read-only journal, exact-body and protected-catalog/data comparisons. The older `inspect-community-authorization.cjs --check-baseline` intentionally checks the pre-065 fixture and is no longer the post-deployment acceptance command.

Manual rollback: `scripts/manual/community-approval/rollback.sql`. It restores captured pre-065 function bodies/ACL and removes only this migration's trigger/private helpers. It preserves ride, grant, participant and receipt data. It restores the older authorization gap, so requires explicit production authorization and a documented incident reason.
