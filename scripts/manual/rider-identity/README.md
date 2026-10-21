# Partner identity and authenticated activity correction

Owner-approved production rollout completed on 21 October 2026. Migration 080 is
installed as `20261021160000`; the exact single-account correction is committed;
Admin `eb32272596cb4d91765af822e19c1557176d101b` is READY/PROMOTED as
`dpl_fac81Hhr7wWpNKEyzfj8fwDfdjuu` at `admin.movrr.nl`. See
`docs/verification/rider-identity-activity/production.json` for exact source
checksums, before/after integrity and remaining authenticated browser limitations.
The reviewed SQL below is historical execution evidence, not authorization to
reapply either operation or recreate the removed Rider.

## Confirmed cause

Read-only production inspection on 21 October 2026 found Auth/User
`007b5ab8-fea0-41f2-9068-055f154d7db0` (`powerdonnl@gmail.com`), created
20 October at 18:20:11 UTC, with `server_assigned_role=partner_operations_manager`.
The captured original Auth trigger casts that string to `public.user_role`, whose
enum has no such label, catches the error and substitutes `rider`. It then creates
the Rider profile. Its signup trigger creates the empty reward balance.

This is a historical partial-provisioning defect. There is no durable Employee,
Product or External provisioning reservation for this identity. The exact original
HTTP failure/response is unavailable; it must not be invented. The later Partner
Owner membership was created on 21 October at 14:45:16 UTC. Adding that membership
did not remove the unintended Rider. A legacy `admin_users` row has **null role**:
it grants no Staff authority and is preserved.

The installed `handle_new_user` matches the 078 architecture: reservations govern
managed creation, unsupported unreserved roles are rejected, and ordinary public
Mobile signup intentionally provisions Riders. Historical migrations and the old
trigger fixture remain as reproducible evidence, not live fallback behavior. The
last redundant `server_assigned_role` writer in managed Product creation is removed;
the existing Product reservation supplies its canonical account domain. No Mobile
runtime changes or broad RBAC redesign are needed.

## Exact reviewed production scopes

1. `scripts/080_authenticated_account_activity.sql`: add one service-only bounded
   activity read RPC, one private trigger function, and DELETE triggers on
   `auth.sessions` and `public.admin_dashboard_sessions`. Revoke public/client
   execution; grant only the read RPC to existing `service_role`. No new role
   grants, backfill, heartbeat, tracking identifiers, IP collection or per-request
   writes. Session removal retains the old recorded timestamp in `user_activity`.
   Cascade account deletion is excluded. Journal version `20261021160000`.
2. `correct-powerdon.sql`: delete Rider
   `183c4512-228b-441a-9b4f-e1d97359773a` and its one zero balance; set this User's
   historical `role` to NULL; remove only its Auth metadata `server_assigned_role`.
   Preserve Auth ID, email, status, all other metadata, the null-role legacy Staff
   row, Partner organisation `17be1d12-9e61-4654-afd0-fad0bf2d0278`, and active Owner
   membership `16773fed-3edd-493b-bce4-fc366beb2cea` (`org.owner`).

The correction takes an ACCESS EXCLUSIVE lock on `public.user` briefly while the
immutable-classification trigger is disabled, updates this one role, and restores
the trigger in the same transaction. All other security/deletion triggers remain
enabled. Lock timeout is five seconds. No persistent bypass or repair RPC remains.
Any failure rolls back the entire transaction, including trigger state.

The only Rider FK dependency observed is its zero-valued `rider_reward_balance`:
balance and lifetime/daily/weekly/tier earned values are all zero. Every other
Rider FK count is zero, including rides, routes, assignments, events, transactions,
redemptions, fulfilments and settlements. The correction rechecks all current FKs
under a Rider row lock and refuses unexpected contracts, history, nonzero balances,
sign-ins, Staff authority, or changed ownership/status. Two staff-authored account
updates and all audit/financial history remain intact.
The additional `rider_dashboard_stats` reference is one derived view row, not a
stored dependency; it disappears when its Rider source is removed. The other
non-FK projection, `rider_campaign_accessory_overview`, has zero rows for this Rider.

`execute.cjs --activity` and `execute.cjs --correction` require
`MOVRR_OWNER_APPROVED_SQL_SHA256` to equal the LF-normalized SQL checksum approved
by the owner. The wrapper checks deletion intake Enabled, irreversible deletion
Disabled and Shop redemption Disabled, and fingerprints every public/Auth table
inside a repeatable-read transaction. Only the four specified tables may change
for the correction; the activity migration changes no existing rows. Unexpected
changes roll back. Durable execution receipts go to `docs/verification`.

Do not alter the parallel seven-account cleanup manifest or protection pins.
This separately requested account correction may change a protected fingerprint;
the cleanup owner must review its own protection baseline before that cleanup runs.
Do not resume or execute that cleanup as part of this task.

## Last Active contract

The latest reliably **recorded authenticated account activity**, as the maximum of:

- `auth.users.last_sign_in_at` (successful Auth sign-in);
- `auth.sessions.refreshed_at`, explicitly interpreted as UTC (authenticated token
  exchange, including an automatic refresh; this does not prove a human interaction);
- `admin_dashboard_sessions.last_seen_at` (existing authenticated request touches,
  already limited to once per minute);
- non-system `user_activity.occurred_at`, attributed to `actor_user_id`.

Do not use the event subject `user_id`, account creation, arbitrary `updated_at`,
legacy `user.last_active_at` or `user.last_login`. A staff edit is activity by the
staff actor, not by the edited account. Auth's `sessions.updated_at` is deliberately
excluded. Logout/expiry/revocation retains the last recorded session time; removal
time never invents new activity. Unrecorded page views do not advance this value.

Successful reads with no timestamp display **No recorded activity**; outages or
invalid/incomplete projections display **Unavailable**, with the existing retry
state. Null does not claim that an account has never existed or never used an
unrecorded historical session. This incident account has no Auth sign-in or session
and only two events by other actors, so its corrected result is no recorded activity.

The RPC and transport batch by 500 IDs and fail on incomplete/cross-ID responses.
Sorting compares instants before client pagination, placing unknown values last.
Relative time uses date-fns and the actual instant; details use the viewer's local
timezone. Reads use the existing no-store GET transport and manual refresh, with
the existing one-minute query stale time. No polling/heartbeat is added.

## Verification and release

See `docs/verification/rider-identity-activity/verification.json` for checksums,
read-only findings and test results. Local PostgreSQL tests cover correction
refusal, history/Owner preservation, replay, Rider denial, cross-organisation
denial, timestamp authority, logout retention, ACLs and deletion cascades. Real
GoTrue tests verify password login, token exchange and logout. Existing identity
contracts cover all five domains, explicit multi-domain accounts and failure recovery.
The complete integration-enabled run passed 979 tests. Fifteen final focused checks
also passed, including the real Users handler with 1,213 accounts through PostgREST
at a 37-row cap and the final JSON RPC. TypeScript, configured lint and the production
build passed. Existing `vercel.json` disables automatic deployment of `main`, so
pushing this source does not deploy its reader before the approved SQL installation.

After explicit approval: rerun read-only inspection, install 080 with its journal,
apply the exact correction, independently verify unchanged memberships/history and
gates, deploy the pushed source, then check the authenticated production Users view,
filters/counts, details, login/activity/logout and denied Rider operations. Never
claim production completion from local tests. Roll back application source if
needed; remove only the two new triggers/functions to roll back 080. Retained
session activity remains audit evidence. Do not recreate the unintended Rider as
an automatic rollback; inspect and obtain separate approval for any restoration.

## Completed production verification

The account's actual production DTO and relationship renderer yield
`Partner · Powerdon · Owner`. Both Rider lookups and Rider-only capabilities are
denied. Partner Owner RLS and scoped permissions succeed; other-tenant selection
is denied. Auth ID/provider identity, active status, null Staff role and exact
Owner membership remain unchanged. Auth has no sign-in for this account and the
two staff updates remain audit evidence; Last Active is correctly unrecorded.

Migration changed zero existing rows. Correction changed only the four reviewed
records across Auth User, public User, Rider and zero balance; other accounts and
all financial/history tables were preserved. The role guard is enabled. Across
184 public/Auth tables, post-release changes are limited to unrelated routine Shop
scheduler/worker health. Production Users stay at 11; Rider profiles decrease
10→9 and distinct Rider accounts 8→7; organisation memberships stay at two.

Five read-only production handler checks pass, including exact labels, role
filters/counts, genuine activity/null/refresh, Owner/Rider/tenant authorization,
MFA and sorting/pagination over actual data. Eighteen focused activity/cache/UI
checks pass again; configured lint/TypeScript pass. Live browser login, logout,
account switching and visual acceptance were not performed because Chrome
DevTools was unavailable and the browser inventory was empty. No production
credentials, sessions, synthetic identities or financial transactions were created.
