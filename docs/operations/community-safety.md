# Community safety operating policy and release contract

Policy approved by the MOVRR owner on 23 October 2026. The owner authorizes a
controlled backend/Admin production rollout only after successful preflight.
**Current status: stopped before migration/deployment because preflight failed.**
Mobile builds, OTA delivery and store submissions remain outside authorization.
No synthetic production users, reports, blocks or moderation decisions are authorized.
The owner's separate policy approval was also confirmed in the final acceptance
task. Additional fresh isolated/component/browser results and the dependency-
ordered [rollout procedure](community-safety-rollout.md) supplement this policy;
the [implementation assessment](community-safety-policy-assessment.md) records
the remaining governance/disclosure work. MOVRR has no dedicated staging
environment: isolated tests and separately authorised production gates apply.
The production and isolated receipts are in
[`preflight.json`](../verification/community-safety-rollout/preflight.json)
and [`rehearsal.json`](../verification/community-safety-rollout/rehearsal.json).

## Approved internal operating policy

| Record or activity | Approved rule |
| --- | --- |
| Safety reports | Retain for 12 months after resolution |
| Moderation decisions and evidence | Retain for 24 months after case closure |
| Active rider blocks | Retain while active, until unblocked |
| Legal/safety holds | Retain the relevant evidence until its documented hold is released |
| Moderation ownership | Authorized internal MOVRR administrators, through existing `community.manage` and session/MFA checks |
| Urgent reports | Target initial review within 24 hours |
| Routine reports | Target initial review within 3 business days |

These are approved internal targets, not public service guarantees. They do not
approve any broader account-deletion policy, change an operating gate or establish
another retention period for unresolved reports, backups or general audit data.
Unblock removes the active relationship; do not create an unapproved block-history
archive. Do not duplicate report narratives into general operational logs.

Administrators must inspect the existing queue and triage urgency manually; its
reason filter is not an urgency classifier. Record initial review and outcome in
authorized case evidence, with a responsible administrator and a reference.
Escalate capacity shortfalls to the operating owner; do not automatically publish
content, close reports or promise a response to meet a target. Ownership and the
targets are approved; an assigned coverage rota, monitored escalation route and
reliable first-review measurement have not been demonstrated. No public SLA is
published by this policy.

At resolution/closure, record the authoritative event and applicable period.
Retain only necessary fields and evidence with restricted access. A hold needs a
specific reason/authority, scope, responsible authorized owner and recorded release;
an account deletion request does not by itself erase or indefinitely hold evidence.
Assess rights requests through the existing privacy/deletion process. Preserve
legitimate shared rides and financial history independently of Safety case disposal.
Never reveal a reporter's identity or a private block relationship to another rider
through a routine export, notification or moderation response. Rights responses
require third-party/confidentiality review rather than copying the staff projection.

Image evidence is private and follows the applicable case retention, including a
documented hold. Check every live ride and case reference before object disposal:
removing expired report data must not destroy evidence still legitimately needed
by an open/retained case or an active ride. A surviving live asset reference does
not justify retaining an expired report narrative or unrelated identifiers.

### Privacy and lifecycle assessment

The approved durations alone do not prove necessity or lawful processing. GDPR
requires purpose limitation, minimization, storage limitation, a lawful basis,
retention disclosure and rights handling. A specific legal-claims exception can
justify necessary evidence, not blanket profile/location retention. See
[GDPR Articles 5, 6, 13, 15 and 17](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).
The internal periods must be supported by MOVRR's documented necessity/balancing
assessment and minimum-field inventory, including sensitive allegations in free
text/images. This assessment is not recorded as completed or legally certified.

Current implementation gaps are release blockers:

- `082` has report status/version and audit creation times, but no authoritative
  moderation case-closure event, hold/release workflow or constrained evidence
  disposal command. Do not start a 24-month clock at an arbitrary earlier decision
  or purge shared images by age. Report resolution can be linked to its transactional
  decision audit; that is not a general case-closure authority.
- The canonical account-deletion retention registry has no Safety-specific rules
  for these periods/minimum fields. Its existing immutable policies must not be
  silently edited, and irreversible deletion must remain Disabled. Safety period
  approval does not approve the remaining legal/financial deletion rules.
- New Safety tables are absent from the existing deletion write barriers. In the
  current-schema local rehearsal, a queued/restricted account cannot update its
  Community participation (`42501`), yet can call `set_community_block` and
  `report_community_content`. Integrate the canonical fence and disposition/export
  inventory; any intentional Safety exception needs an explicit product decision.
  Do not add a parallel authorization or deletion engine.
- Mobile's shared EN/NL privacy source still describes public Community assets
  and omits Safety-specific data, periods and confidentiality/rights limits. The
  corresponding website copy must remain synchronized through the existing
  `sync-legal-documents.cjs` process. No future-state disclosure was silently
  published while the backend remains unchanged.

No deletion job, retention scheduler, new infrastructure or additional retention
period has been introduced. The controls above are an operational instruction and
release gate, not a claim that timed disposal is implemented.

## Controlled rollout preflight — 23 October 2026

Canonical migration `scripts/082_community_safety.sql`, byte and LF SHA-256:
`6072bdf88bb1256439ad2ab6a1510b3894014125154f35c44449b6ba84ad20d0`.
Production Supabase project: `kzdvunpuxaxlphqvmzxw`; latest journal is
`20261022150000 / 081_rider_status_command`. All six required Community signatures,
the captured 23 policies and six helper bodies match; 082 is absent. Three public
rides retain paths and URLs. Shop remains Disabled; deletion intake Enabled and
irreversible execution Disabled. Production access was read-only.

A fresh schema-only dump of all 192 public/Auth/Storage tables was restored to a
separate disposable PostgreSQL instance. Fourteen targeted assertions verify
installation, rollback before commit, existing public discovery, cover-path
preservation, roster/counts and block/unblock participation preservation. It also
reproduces the unresolved lifecycle exception above. Restore uses no production
rows, no production role memberships and `--no-owner`; extension prerequisites
are local and the push trigger is inert. It is a schema/lifecycle integration
probe, not full account-erasure or production authorization acceptance. Previously
passing 96 SQL / 21 authenticated HTTP / 28 real Storage checks are reused; the
unchanged suites were not rerun.

**Installed-client gate fails.** `082` clears `cover_image_url` and makes the bucket
private. Pre-Safety Mobile `2c110d3` maps that URL directly and does not sign paths.
The rehearsal confirms null URLs/private storage after migration, and prior real
Storage tests confirm old public routes fail while authorized signed reads work.
The documented device artifacts predate Safety; their currently installed identity
is unverified. There is no verified supported-client transition. Applying 082 now
would risk broken covers and old image-replacement flows. No public fallback or
split schema contract is authorized. Resolve delivery/adoption before the private
transition; the present no-build/no-OTA boundary remains in force.

Current Admin alias `admin.movrr.nl` is READY at
`dpl_7mCqnZszEdxyjgPHSkccpeWZjNnD`, source
`e0bbd5cadc858282b3796dcde5e510b1c386b460`. No candidate was built or promoted.
Any later rollout must re-read the alias, pin a compatible descendant of its then
current revision, verify 082 first, and abort on concurrent alias/source changes.

Recovery: a failure before transaction commit rolls back 082 (locally verified).
Post-commit reversal is not approved or rehearsed: dropping Safety tables loses
evidence/blocks, and making the bucket public exposes pending evidence. Before an
apply, record the exact journal/source/record and gate baseline, verify platform
backup recovery, and prepare scoped containment that preserves evidence and
visibility decisions. Do not use a blanket schema downgrade or public-bucket
toggle as rollback. No recovery readiness is claimed from a metadata digest alone.

Resume sequence: resolve client/privacy/lifecycle/coverage blockers; verify the
final changed source and migration checksum in isolation; refresh read-only
production baselines; apply/journal 082 atomically using the established migration
process; verify grants/RLS/data and schema reload; deploy the pinned matching
Admin descendant; perform authorized Rider/Staff verification without synthetic
production records; recheck Community journeys and all operating gates. Stop
before Mobile builds, OTA or store submissions. Physical-device acceptance remains
open and no native visual acceptance is claimed.

The independent post-implementation audit corrected the publication/block policy
below. Its detailed regression matrix and remaining acceptance requirements are
in Mobile `docs/implementation/community-safety-regression-audit.md`. The latest
isolated run passes 96 SQL, 21 HTTP and 28 actual Storage API assertions using
`node scripts/test-community-safety.cjs --http --storage`. Historical results below
describe the original source handoff, not a release acceptance decision.

## Implementation

The canonical migration is `scripts/082_community_safety.sql`, following the
existing Community/referral contracts, approved-creator migration 065 and current
identity/capability migrations. It adds `moderation_state` and a content revision
to the existing `community_ride`, plus `community_block`, `community_report` and
`community_moderation_audit`. It does not create another ride or role authority.
The migration is transactional, has a five-second lock timeout, explicit table
and function ownership, constraints, RLS and narrow grants, and requests a
PostgREST schema refresh. Preserve existing migration history; do not apply the
candidate while the preflight blockers above remain.

Reports use `report_community_content`. Active authenticated riders can report a
ride, its text or image, or its rider organiser. Seven reasons and an optional
2,000-character description are accepted. A reporter gets one report per target
and content revision; replays return the same identifier, and an account lock
serializes the ten-new-reports-per-24-hours cap. A newly reviewed content revision
can be reported again. Evidence contains the public title, description,
organiser/meeting text and immutable private image path. There is no ride/account
foreign key that could cascade away report evidence. Ordinary riders have no
report-table read/write grant. The Admin projection also omits reporter identity.
No report count automatically suspends an account.

Blocks use the single directional `community_block` relation and
`set_community_block`/`my_community_blocks`. Self-blocking is rejected; the pair is
unique and operations are idempotent. Targets must be discoverable organisers or
participants in accessible Community content, or an existing block being managed.
Only the blocking rider can list their choices. The list returns a stored public
display label, not private profile/contact information.

MOVRR/Admin platform identities are not blockable organisers. The Mobile action
requires a rider organiser; backend blocking/discovery/participation and cache
eviction distinguish `organizer_type = 'rider'`. Even an individual rider block
does not hide or end participation in MOVRR/Admin-organised rides. Their ride
content remains reportable. SQL and Mobile tests protect this distinction.

Backend enforcement includes restrictive discovery/detail and participant RLS,
the canonical joining RPC and a participant write trigger (including direct API
writes). Discovery hides other rides from organisers blocked by the requesting
rider. Existing participants and the organiser retain the previously authorised
shared-ride details, roster/count and completed/cancelled history. Joining and
new invite creation are denied if either rider has blocked the other. Existing
invitations remain stored but cannot bypass the join guard. Pair locks serialize
joins with blocks. Blocking and unblocking never change participation, timestamps,
counts, invitations, Wallet, financial transactions, tracked rides or rewards.
Departures and removals use existing explicit authorised workflows. No
block-specific notification, private relationship projection or additional
personal/location data is introduced. This policy was explicitly approved during
the independent post-implementation audit on 23 October 2026.

## Filtering strategy

Every new or changed public-facing Community text/image submission requires
**human pre-publication review**. This is a deliberate production strategy for
the approved-creator Community, not a keyword classifier or simulated moderation
provider. It covers harassment/bullying/threats, hate/discrimination, nudity and
explicit sexual content, graphic violence, illegal/exploitative material, spam
and impersonation. Legitimate text and images are not rejected by a word list.

Trusted database triggers place creates and changes to title, description,
organiser name, meeting text or cover into `pending`. Only the authorised staff
command can approve publication. Uncertain or unreviewed content remains pending;
staff can restrict violations. Review unavailability never approves content.
The Admin UI bounds requests at 20 seconds and preserves the operation ID for
uncertain write retries. Approval also waits for the cover preview to load.

The existing `community-rides` bucket becomes private. Uploads use new immutable
UUID object paths, with `upsert: false`; replacements cannot overwrite previously
reviewed bytes. Covers must reference an existing object under that ride and
organiser. Arbitrary user-supplied cover URLs are discarded. Storage policies
permit authorised private previews and approved visible covers; update-in-place
is denied. A storage trigger retains objects referenced by a ride, report or
moderation audit, including against service cleanup. Unreferenced owner uploads
can be removed. Riders receive 60-second signed reads; staff evidence uses
five-minute reads. Token expiry is not a guaranteed production cache-revocation
bound; warmed CDN entries require separate containment verification. Downloaded
copies cannot be recalled. See the final rollout's Supabase Smart CDN reference.

The existing backend-supplied cover URL remains authoritative for ordinary
readers. Do not discard it and require owner-only signed reads on today's public
bucket: production checks reproduced that all-placeholder regression even though
all three public uploads returned HTTP 200. During migration 082, existing URL
strings are cleared under a transaction-local service claim (restored immediately
afterward), preserving paths, uploaded objects and participants. The private
bucket then requires signed paths. A narrow approved-visible SELECT policy
explicitly grants viewer reads; restrictive policies alone cannot extend the
existing owner-only read policy. The integration fixture uses that actual policy
shape and verifies preservation of pre-existing content and participation.

No external moderation provider, provider key or new Edge Function is needed for
this strategy. This does **not** claim automated image classification. Staff must
actually inspect each image and all public text before approving. Do not release
without staffing and a monitored queue/response process. If throughput exceeds
that operational capacity, add a separately reviewed server-side provider before
changing this publication gate; do not introduce automatic approval on failure.

## Staff controls and atomicity

The existing `/community-rides` page contains the safety queue. Reads and actions
require the existing `community.manage` capability through the canonical active
employee/session/MFA authority. External organisation membership does not grant
this platform capability. The UI reuses Admin Card, Select, Checkbox, Badge,
Textarea, Skeleton, Button and toast components. It shows the oldest 100 reports
per status/reason filter, submitted evidence, current content and past outcomes,
plus the pending publication queue.

`moderate_community_content` is executable only by `service_role`; the server
action binds the actor after `requireCapability(..., { mutation: true })`.
Approve/restrict and report dismissal/removal use row locks, expected content and
report versions, and a unique operation ID. The content/report transition and
audit insert commit in the same transaction. An audit failure rolls back the
decision. Reports transition from open to dismissed or actioned; a stale reviewer
must refresh. Replaying the same operation is safe; reusing its ID for a different
decision is rejected. Removal restricts public availability while preserving the
ride record; it does not silently cancel or delete ride history.

Account enforcement links to existing Rider operations; their separate
capabilities and existing audited commands remain required. No new suspension
command or permission authority was added. Private image signing is a read-only
POST in Supabase; the existing managed-write transport now recognises only the
object-read-signing endpoint as a read, while preserving write permits for
uploads, upload signing and Auth/Storage mutations.

## Mobile and Home boundaries

Mobile adds a discreet Report or block action on ride details, a modal route
using the existing Screen/header/form/dialog system, and Account > Blocked riders.
Copy and Guidelines are English/Dutch. Selection treatment follows Language &
Units; cards/text follow Brand Preferences and existing tokens. Loading, empty,
error, success, keyboard and confirmation components are reused. No Home,
Wallet, Campaigns, Maps or Rewards redesign is part of this work.

Home's approved split is unchanged: first-time carousel, returning compact entry.
The attempted all-rider carousel change was reverted. Discovery keeps its existing
select contract: moderation state is not required in the rider DTO. Candidate
backend RLS, not client state, controls publication. Ordinary snapshot caching is
retained. After an acknowledged block, only that account's affected Community
cache content and disk presentation snapshot are cleared; safe results are seeded
before refetch so failed refreshes cannot revive the blocked content.

The separate Mobile Home investigation records a demonstrated *local* Safety
query mismatch (`42703` for a not-yet-deployed column), its removal, and the exact
200/three-row read-only result afterward. It does not claim an affected physical
installation was diagnosed or changed.

## Earlier source-handoff dependencies (superseded by approved policy above)

1. Review and rehearse 082 against the current full Supabase schema, including
   account lifecycle barriers and actual Storage service behavior. The isolated
   test fixture is not a full production clone.
2. Coordinate the private-bucket transition, Admin and Mobile delivery. Old
   installed clients that use public cover URLs require an update. Verify legacy
   cache/CDN behavior before relying on old URLs being unavailable; do not promise
   recall of downloaded copies. No legacy public-URL fallback is supplied.
3. Preserve the publication decision on existing rides: 082 initializes their
   moderation state to approved without changing is_public or lifecycle status.
   New content and changes to public text/images start pending. Restrict existing
   content only through a specific justified audited decision. Blanket moderation
   of existing rides was explicitly rejected during the independent audit.
4. Confirm staffing, ownership, escalation, monitored `support@movrr.nl` and a
   measurable timely-response process. A 24-hour initial triage target is proposed
   for operational approval, not represented as an already staffed SLA.
5. Obtain the exact privacy disclosure/retention updates below, then conduct
   isolated rehearsal and controlled production/physical-device acceptance using
   separately authorised accounts.

## Exact privacy disclosure work still required

The current Mobile privacy document's `community` section says community covers
use public asset URLs. Before rollout it must distinguish still-public profile
photos from private, moderated Community covers and expiring authorised reads.
That privacy text was deliberately **not** edited as part of the Guidelines task.

The same English/Dutch disclosure needs an approved explanation of report reason,
optional narrative, reporter/reported account identifiers, public-content
snapshots and image evidence, block relationships/display labels, moderation
decisions and staff audit metadata; the safety/abuse handling purposes and chosen
lawful basis; restricted staff access and reporter/block confidentiality limits;
manual review and account/content enforcement; retention/end criteria, evidence
holds and rights/appeal routes. The `retention` section and operational retention
registry must cover these new records and retained private images, including
account deletion. The approved schedule above still requires a verified disposal
process before release. No blanket deletion promise, legal basis, consent claim or
indefinite-retention justification is invented here.

Only Guidelines sections in Mobile's shared legal JSON were changed; unrelated
Terms/Privacy text and global legal version metadata remain unchanged.

## Source verification and limits

`node scripts/test-community-safety.cjs --http` uses hardcoded localhost
PostgreSQL 17 and a disposable PostgREST v16.4 container. It never loads .env or
production credentials and drops its own database/container. It reconstructs
existing canonical functions/triggers and tests the candidate schema with real
SQL/RLS/transaction behavior. Current result: 69 SQL assertions and 21 HTTP
assertions. Tests cover report replay/rates/privacy/evidence, blocks/isolation,
joining/races/history, private immutable image metadata, create/update publication
gates, uncertain review, restricted content, audit rollback, stale/concurrent
staff decisions and preservation of reward/tracked-ride tables.

The image classification cases are **human decision workflow fixtures**, not
simulated machine detections. Actual Supabase Storage byte transfer, human
classification effectiveness, staffing response times and physical-device
acceptance require controlled operational verification. There is no external model
acceptance claim because no external model is used.

Admin's full suite passed 932 tests with 105 opt-in tests skipped. Mobile's final
full run passed 2,946 tests with one skipped and two failures. The two untouched
Impact-grid tests expect an English `1,234 km` from locale-dependent
`toLocaleString()`. Those same two failures were reproduced with the original
Surface wrapper. They were not hidden by changing unrelated app/test behavior.
An earlier full-run Route Summary timeout passed on focused rerun and the final
full run. Additional returning-rider state tests passed separately after that run.
Focused Safety/Home/Surface suites, type checks, lint/build/export evidence are
recorded with the source handoff. No native or Apple approval is implied.

Final focused Mobile verification passed 288 tests in 25 suites, including Home
segmentation/query states/uploaded covers, blocking, report commands, Community
forms, approved creator contracts, Surface/dialog geometry and Rewards skeletons.
Mobile TypeScript, targeted ESLint and iOS/Android JavaScript exports passed;
exports use `--no-bytecode` and are not Hermes/native build acceptance. Admin's
TypeScript and local production build passed. The initial sandboxed Admin build
could not fetch its existing Google fonts; the network-enabled local retry passed.

Browser fixtures rendered the actual new Mobile screens with existing components,
tokens, bundled fonts, synthetic data and EN/NL at 320x568, 414x896 and 412x915,
light/dark and reduced motion: 84 entry/form/success/confirmation/list/empty/error
states had no JavaScript errors or horizontal overflow. A long new Dutch header
was shortened using the existing header component. Admin's actual queue and
compiled styles passed 16 browser states at 320/1280 widths, light/dark and
ready/empty/error/loading. These fixtures stub network/session operations; they
are not an authenticated end-to-end flow, native text-scale/accessibility test,
keyboard/safe-area acceptance or device screenshot certification. The existing
design components were reused; full visual parity acceptance is still pending.

## Apple acceptance checklist and proposed notes

Reference: [Apple App Review Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).

Use separately authorised review accounts, one approved creator, a second rider
and authorised staff. Do not create/mutate production test accounts without
approval. Use an ordinary title such as "Morning canal ride" and a MOVRR-owned
landscape cover; offensive real material is unnecessary.

- Create a test ride: it is absent from another rider's discovery until staff
  reviews its text/image and approves publication. Repeat with an edit and an
  image replacement. Leaving an uncertain submission pending demonstrates the
  fail-closed state; staff restriction demonstrates rejection safely.
- From details, report the ride/text/image with a benign "App Review fixture"
  explanation, and separately report its organiser. Observe the neutral success
  confirmation and accessible support address, without exposing decisions.
- Block the organiser, verify their content is absent and joining fails, and
  check the stated participation policy. Unblock via Account > Blocked riders;
  confirm there is no automatic rejoin and unrelated history/rewards remain.
- Staff filters the queue, inspects retained evidence/current content, dismisses
  a benign test report or removes a test ride, and records a reason. Verify the
  audit and the resulting visibility with the second rider. Account action, if
  needed, remains subject to the existing separate Rider permissions.
- Open Community Guidelines and `support@movrr.nl`. Verify EN/NL, narrow phones,
  large text, reduced motion, safe areas, keyboard behavior, VoiceOver/TalkBack,
  iPhone XR and Samsung S23 Ultra with installed bundle identity recorded.

Proposed App Review Notes, to use only after approved rollout and acceptance:

> Community Ride details include Report or block. Signed-in riders can report
> rides, ride text, cover images and organisers with a reason and optional
> explanation, and block organisers. Blocks can be managed in Account > Blocked
> riders. Community text and cover images are held privately for staff review
> before publication; edits and image replacements require review again. Staff
> review reports, remove/restrict violating content and use authorised account
> enforcement where appropriate. Guidelines are under Account > Rider Guidelines,
> and support is available at support@movrr.nl. The supplied authorised review
> accounts and non-offensive test ride demonstrate these controls.

Provide credentials through the approved App Store Connect review channel only,
never in this repository. Do not state that Apple has approved the mechanisms.
