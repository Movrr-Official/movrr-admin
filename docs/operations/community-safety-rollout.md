# Community Safety final acceptance and controlled rollout

## Final client / containment decision — 23 October 2026

**Recommend client-first controlled replacement; defer 082 until adoption and
containment are demonstrated. Production remains no-go.** This replaces the prior
proposed signed-URL delivery approach for the future private-cover launch. No
release, production mutation, Storage policy or lifecycle execution is authorised.

### One supported-client transition

| Step / owner | Concrete action and exit condition |
| --- | --- |
| Product / release owner | Keep existing public rides and their current cover contract working while a replacement is prepared. Do not publish new private/pending material into today's public bucket. All known incompatible installations remain supported until a real replacement boundary is established. |
| Mobile / backend source | Prepare a transitional replacement that accepts today's canonical public cover field, and uses the authorised media delivery below when the backend supplies a private path. Use the existing Community API/data model; no parallel Community endpoint or permanent public-image shim. Include account-safe image loading, existing placeholders and actionable update/retry copy using established controls. |
| Release owner, separately authorised | Deliver the tested replacement to the existing iOS internal group and relevant Android tracks. Record resulting artifact IDs/source/runtime/build numbers only when they exist. Store approval/availability is a prerequisite, not adoption. Do not assign a speculative minimum build. |
| Operations / internal iOS fleet | Reconcile the existing tester/device roster, ad-hoc and preview artifacts; obtain device-by-device successful replacement/Community-image evidence. Separately authorise any withdrawal/expiry of old TestFlight availability. Do not assume testers cannot choose a previous build. |
| Operations / Android production | Reconcile Play installed-version/active-device evidence, known sideloads/internal installs and available MOVRR runtime diagnostics. Observing a replacement on one account/device does not exclude its other old installations; aggregate active-version metrics do not account for dormant copies. Establish whether this is genuinely a completely controlled population. |
| Release go/no-go | Cut over only when all supported installations are demonstrably compatible and old incompatible artifacts cannot re-enter supported use. If the public/dormant/sideload population cannot be bounded, keep 082 deferred. A percentage rollout or a quiet telemetry interval is not proof. No current evidence establishes this exit condition. |

Verified inventory remains
[Mobile's 51-job EAS/ASC/Play receipt](../../../movrr-mobile/docs/implementation/community-safety-release-inventory.json):
internal TestFlight **6 / 8 / 9** are available, valid and unexpired; iOS public
version is rejected. Android production/internal tracks are completed at **6**;
historical store artifacts **2 / 5** and internal/development jobs also exist.
iOS 9 is source **2c110d3**; iOS 8 / Android store 6 are **b3583dd**;
iOS 6 / Android store 5 are **5435f06**. These all read public cover URLs and do
not sign private paths. Build number alone does not identify the artifact.
No compatible distributed replacement or installed-adoption boundary is verified.

**Minimum-version gate: do not implement one for this cutover.** The existing
builds have no update-required UX, and an Admin-only gate would miss direct
Supabase reads/writes and Storage. Denying them at the database would produce
unhandled failures, not a safe upgrade experience. Existing EAS preview/development
channels and appVersion runtime matching do not provide production enforcement.
If the owner later chooses a new support-enforcement project, its single
server-side contract boundary must cover canonical Community RLS/RPCs and Storage,
plus the existing platform adapter, and the replacement must already handle its
stable update-required result before enforcement. Map affected artifacts from
this receipt (including older store/internal copies), rather than trusting a
self-reported build header as authorisation. That still cannot retrofit old UX;
retiring those installations requires a separate explicit support/user-impact
decision. It is not an alternative that silently satisfies today's constraints.

### Private-cover access and cache decision

**Recommend authenticated, uncached media delivery within the existing platform
API, rather than rider/staff bearer image URLs.** Proposed route:
GET /api/v1/community-rides/[id]/cover. This transports bytes; it does not duplicate
Community discovery, participation or moderation APIs.

| Boundary | Required implementation / acceptance |
| --- | --- |
| Authorisation | Use the existing request identity and caller-scoped Supabase client to reselect the current ride under canonical RLS/content visibility on every request. Derive the current immutable path server-side. Only then fetch those bytes with server-only Storage credentials. Staff evidence/owner staged-upload previews require their existing capability/ownership authorities; no arbitrary path parameter or client-supplied actor. Preserve account restrictions and shared-ride visibility policy. |
| Direct Storage | At private activation, deny direct Community SELECT/signing to anon/authenticated roles with restrictive policy coverage; preserve authorised immutable uploads. The server media path is the sole image reader for riders/staff. Otherwise a caller could still mint bearer URLs directly, even if the UI stopped doing so. Update owner preview and Admin evidence rendering before enforcing this restriction. No service key reaches a client. |
| Caches | Media responses, denials and redirects use private, no-store semantics; no redirect to a signed/public URL, CDN/image optimiser cache, ETag/304 reuse or shared rendered image cache. Verify hosted platform behaviour, not just headers in a mock. Mobile fetches authorised bytes into account-scoped session memory; do not put tokens or private bytes in disk snapshots/native URL caches. Use immutable revision keys; discard stale/in-flight results on account change, access failure, refresh removal, background/session exit. Revalidate on foreground/display; do not claim recall of pixels/copies already delivered. |
| Signed URL expiry | Current source requests 60 seconds for riders and 300 for staff. Tokens are bearer credentials, not tied to the later account session; their expiry does not purge warmed CDN entries. The replacement/private launch must remove all display/preview signing paths and direct signing grants above. Previously issued tokens remain a transition containment concern; changing Auth keys is not a revocation plan. |
| Offline / switching | Retain established offline ride metadata and public covers; a private cover that cannot be reauthorised uses the existing placeholder. No cross-account reuse. Existing readForAccount and account-keyed queries remain canonical; extend their guarantees through image byte completion, decoder lifecycle and foreground refresh. Native verification must establish disk-cache behaviour. |
| Moderation / revocation | Restriction changes the canonical publication authority; the next media request must deny before fetching bytes. Stop rendering on an authoritative removal/denial. Uncertain refresh is not new authorisation. Define this as denial of subsequent requests, not instantaneous erasure of a previously displayed/downloaded image. Race already in flight may finish; use publication version checks and cancel/drop stale client results. |
| Previously public objects | Never reuse formerly public paths for new moderated/private bytes. Under later explicit data-operation approval, preserve exact originals/recovery/evidence privately, create fresh immutable delivery paths, verify byte integrity and all reference mappings, then retire old origin objects only after live/evidence/hold references are safely reconciled. Preserve ride IDs, publication, image appearance and all participation/history. Do not bypass evidence guards. Existing public downloads/browser copies cannot be recalled. |
| CDN containment | Verify provider-supported purge/retirement for every old public and previously signed URL, including transformed variants, using warmed/cold probes through the actual CDN. Do not assume a bucket flip, new query nonce, short token, max-age=0 or object-metadata update purges every cache. Never delete the sole retained evidence copy to revoke access. If origin retirement/provider invalidation cannot contain new requests, private activation stays blocked. |

[Supabase private access](https://supabase.com/docs/guides/storage/serving/downloads)
and [signed/CDN semantics](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
support the distinction between authorisation, bearer expiry and cache lifetime.
They do not establish this project's hosted cache behaviour. The proposed media
route/policy/native byte path is **not implemented or runtime verified**. It must
pass an isolated warm-cache sequence: authorised read; restriction; fresh request
denied; anonymous/direct/signing denied; account switch/offline/background denied
reuse; owner/staff allowed only in their contexts; original bytes/evidence intact.
Actual CDN/native probes need separately authorised deployment/device access.

Cover-path relocation must be an explicitly authorised, integrity-verified
manifest operation: ordinary cover edits reset publication to pending. Reconcile
that guard and the audit in one database transaction so an unchanged existing
public ride never disappears between path replacement and approval. Byte copying
and database commit are not atomic together; stage/verify bytes first, retain
the old referenced copy on failure and resume with the same operation manifest.
Do not edit evidence/audit references without the approved lifecycle disposition.

### Approved independent correction and verification boundary

Mobile presentation snapshots previously stored signed cover credentials for the
five-minute snapshot lifetime despite the 60-second URL request. The source now
strips Community signed URLs when saving and reading existing snapshots, preserves
public covers and all ride metadata, and leaves live query objects unchanged.
Existing encrypted old snapshot bytes expire under the existing cache lifecycle;
this correction prevents replay and does not claim physical secure erasure or
native/CDN cache containment. TypeScript and 26 focused snapshot/Home/cover tests
pass. No UI layout, segmentation, participation, roster or history source changed.
Earlier SQL/HTTP/Storage/lifecycle results and the canonical account-fence fix
remain recorded in the existing verification receipt; those audits were not rerun.

### Launch roadmap and remaining approvals

1. **Owner/Privacy:** approve the final purpose/basis/field matrix, sensitive-data
   handling, closure semantics, canonical hold linkage/release and disposal/export
   projections in community-safety-policy-assessment.md. Record the real approval;
   no fabricated reference or activation of retained evidence.
2. **Source preparation:** implement only that approved lifecycle design; implement
   the proposed media delivery/restrictive Storage policy and transitional Mobile
   renderer; reconcile Admin/owner previews. Rehearse the final canonical migration
   and object transition/recovery tooling, repinning its hash after source changes.
   Current 082 alone is insufficient for this proposed cache strategy.
3. **Separate build/release authorisation:** deliver the replacement, validate real
   first-time carousel/returning compact Home, existing rides/images and account/
   offline behaviour, then complete the adoption exit conditions above.
4. **Separate production operation authorisation:** verified database/Storage
   recovery and reference mappings; deploy the compatible media/backend/Admin
   support before any client depends on it; confirm client adoption; apply the
   final private migration and approved object transition; verify schema reload,
   canonical rider/staff journeys and actual CDN/native containment. Do not enable
   the Safety launch while any of these steps is unverified.
5. **Launch decision:** activate only after acceptance and named moderation
   coverage/escalation; keep uncertain content pending. Fixed internal review
   targets remain unchanged. Shop redemption and irreversible deletion execution
   remain under their separate operating gates.

**Verdict: NO-GO pending approval, implementation and demonstrated adoption/cache
containment.** No production rollout, EAS/OTA, store submission/withdrawal,
retained-evidence execution or unrelated product/design change occurred here.

---

## Historical final acceptance and controlled rollout record

23 October 2026. **Release verdict: FAIL (production no-go).** Source preparation
and isolated checks pass, but the client cutover, Safety account-deletion
integration, remaining governance/disclosure approvals and production cache/private-cover
acceptance remain unresolved. No production change is authorised by this file.
There is no dedicated staging requirement: use the disposable environments below
and separately authorised, controlled production gates.

## Source and acceptance baseline

Mobile `0aeb626` includes `ff091aa` (Blocked Riders lifecycle/offline correction),
the Home/query/image corrections and the independent policy regression audit.
Admin `f765f1b` includes the corrected 082 and exact deployed policy fixtures.
Both were on `main`, equal to fetched `origin/main`, at preparation start.
This handoff changes test tooling/documentation only; **082 is unchanged**.

Concurrent work was preserved and subsequently committed as Admin `6dec5e9`
and Mobile `621c3cf`. Its reviewed receipt adds the fresh 192-table production-
schema-only rehearsal (14 targeted checks), confirms the same restricted-account
report/block fence gap and records approved internal policy. The fresh tests below
are additional results, not a claim that the 133-table fixture is that live schema
export. Policy periods/targets were confirmed as separately approved by the owner
during this acceptance task; production deployment remains outside this task.

Canonical migration: `scripts/082_community_safety.sql`, SHA-256
`6072bdf88bb1256439ad2ab6a1510b3894014125154f35c44449b6ba84ad20d0`.
Required contracts include approved creators (065), current identity/capability
authority (including 075), current Community/referral RPC bodies and Storage
policies. Inventory actual deployed definitions, owners and grants; do not assume
the highest migration filename proves every prerequisite was applied.

Production read-only evidence already established: 082 is absent;
`my_community_blocks` returns HTTP 404/PGRST202; ordinary Community discovery
returns HTTP 200/three rows and the three uploaded public images return 200.
The missing RPC is an undeployed dependency, not a valid empty list. Those
captured probes are not an authenticated Rider/Staff acceptance or a claim about
the installed app bundle. Do not manufacture a successful empty response.

### Fresh isolated results

| Check | Result and limit |
| --- | --- |
| Canonical SQL + real PostgREST + actual Storage API | 96 SQL, 21 HTTP, 28 Storage assertions pass on isolated PostgreSQL 17 / Storage 1.79.36. Includes replay/rate limits, confidentiality, approved creators, moderation states, RLS/bypass attempts, immutable/private image byte access, evidence preservation, audited outcomes and concurrent decisions. |
| Expanded migration rehearsal | 16 assertions pass: captured 133-table foundation, 539 constraints, 222 policies, 63 triggers, 9 views, 55 canonical Mobile lifecycle migrations and current Community helpers/policies/functions. Existing public ride stays approved/public/upcoming; complete participant rows unchanged. Real authenticated-role discovery, join, reporting and empty blocks work. Active deletion barrier and prerequisite-body drift roll back migration changes. |
| Remaining governance result | No new Safety ownership bindings after 082. A restricted synthetic account is denied participation writes but still succeeds at report/block RPCs. This is a confirmed release-blocking lifecycle write-fence gap. Periods/targets approved separately and confirmed by the owner here; lawful-basis/minimum-field/disposition implementation remains incomplete. Migration success does not establish lifecycle readiness. See policy assessment. |
| Mobile regression | 204 tests / 20 suites pass: Community/Home segmentation, query/loading/error/covers, creator/form/edit policy, reporting, block cache, empty/error/offline/account switching. |
| Admin regression | 31 tests / 3 suites pass: Safety actions/capabilities, creator approval, private image signing. |
| Types | Mobile and Admin TypeScript pass. Admin `lint` is its TypeScript script. |
| Mobile lint and exports | Focused Community/Safety ESLint passes. iOS and Android local JavaScript exports pass with `--no-bytecode`; no EAS/native build, OTA or store operation. |
| Browser evidence | Fresh 192-state matrix passes: no JavaScript errors or horizontal overflow; 24 Home entry geometry comparisons match the historical reference. Inspected narrow Dutch report form, returning compact entry and dark Admin queue screenshots. |

The foundation is a captured schema reconstructed from committed fixtures, **not
a current production clone**. The full fixture uses an inert push-webhook adapter;
notification delivery to a device is not tested. Narrow API/Storage suites use
synthetic identities and JWTs, not production accounts, CDN or external providers.
Previous full-suite/build/export evidence and its unchanged two Mobile Impact
locale failures are in Mobile `docs/implementation/community-safety-regression-audit.md`.
Do not turn that historical limitation into a claim that the entire suite passed.

Reproduce against a disposable loopback PostgreSQL 17 instance only (default
55439; optional `MOVRR_COMMUNITY_TEST_PORT`), with Mobile checked out beside Admin:

```powershell
$env:MOVRR_COMMUNITY_TEST_PORT = '55459'
node scripts/test-community-safety.cjs --http --storage
node scripts/test-community-safety-rehearsal.cjs
```

Neither runner reads `.env` or accepts a remote database host. Each creates and
drops its own database; HTTP/Storage containers use disposable synthetic data.
The rehearsal executes the same migration statements under savepoints for failure
injection and the original BEGIN/COMMIT file for the successful path. It does not
create an alternate migration or relax a lifecycle trigger.

### Product and visual boundaries

Home remains first-time full carousel / returning compact entry. No classification
or Home rendering code changed here. Existing public rides remain approved at
082; future text/cover changes become pending. Blocking never mutates existing
participants, counts, rosters, history, invitations, Wallet or Rewards. Shared
authorised access is retained; future prohibited joins/invites are blocked. MOVRR
platform rides cannot be hidden through a rider-organiser block. No block notices.

New and edited content uses **human pre-publication moderation**, including every
cover replacement. No provider key or automatic image classifier is required.
Review outage/uncertainty leaves content pending; a preview/signing failure never
authorises approval. This requires staffed capacity before launch.

Existing Mobile controls/tokens and Admin's own components remain unchanged by
this handoff. The reproducible browser matrix renders actual affected components
with synthetic network/session boundaries at 320x568, 414x896 and 412x915, EN/NL,
light/dark, reduced motion, plus Admin 320/1280 widths. Record the fresh outcome in
the acceptance evidence. Geometry checks do not certify pixel parity, full Home
placement, native fonts/safe areas/keyboards, large text or assistive technology.
iPhone XR and Samsung S23 Ultra physical acceptance remains required. Native
Metro Surface-warning elimination is not established by browser or static tests.

### Journey evidence, kept distinct from end-to-end acceptance

| Journey | Evidence now | Remaining acceptance |
| --- | --- | --- |
| Discovery, creator create/edit, joining/leaving | SQL/HTTP publication and ownership guards; Mobile discovery/form/edit contracts; established lifecycle functions remain canonical | Real authenticated Mobile UI journey, shared links and device notification delivery |
| First-time / returning Home | Focused segmentation/loading/empty/error/cover tests and 24 browser geometry comparisons | Full Home on installed XR/S23 Ultra with actual account history |
| Report ride / organiser | Authenticated SQL/HTTP command, replay/rate/confidentiality tests; component form/success matrix | Authorised production reviewer accounts after 082 |
| Block / unblock / existing shared participation | SQL block ownership/join/visibility and retained participants; Mobile cache/account-switch/offline tests | Actual multi-account installed-client journey and session expiry |
| Blocked list | Real RPC empty result in expanded rehearsal; component empty/populated/loading/error/offline/account-switch tests; browser states | Actual backend deployment; production PGRST202 currently remains an error |
| Guidelines | Existing EN/NL source, normal Account navigation and shared components retained | Installed navigation, large text and assistive technology |
| Private cover / replacement / uncertain review | Actual local Storage byte-transfer and immutable paths; SQL create/update denial/pending; Admin image-load/refresh failure gate | Production Storage/CDN, old install cutover and actual private preview |
| Staff approve / restrict / dismiss / remove | SQL atomic audit/version/concurrency and capability tests; actual queue browser components | Authenticated active/MFA staff UI and unrelated-tenant denial on deployed revision |

Component tests mock I/O and local SQL identities are synthetic. Passing the
rows above is not a claim of one complete authenticated Mobile-to-Admin device
session or production provider acceptance.

## Mandatory gates before scheduling production

1. Complete the remaining [policy implementation and disclosure decisions](community-safety-policy-assessment.md),
   name staff/backup/escalation coverage and confirm monitored support/privacy.
   Resolve Safety ownership/barrier/disposition integration through canonical
   lifecycle governance; add its regression tests and rerun the rehearsal. No
   automatic purge or published response promise is approved by this source.
2. Resolve the installed-client boundary below and produce an approved exact
   supported-version/inventory and release sequence. No speculative fallback.
3. Validate production CDN/cache invalidation and retained-evidence containment
   with the storage owner/provider. A private bucket is not proof that previously
   cached public URLs have stopped serving bytes.
4. Agree authorised test accounts/content and acceptance operators. No account,
   report or production fixture may be created by this preparation task.

### Installed-client boundary — unresolved

082 atomically clears `cover_image_url` and makes `community-rides` private.
Old public-URL-only clients cannot display those covers afterward. They may also
assume immediate publication on create/edit. New source preserves current
production discovery without requiring undeployed moderation fields and signs
private paths, but **no deployed minimum-version/Community maintenance gate has
been established**. A store release being available does not prove old installs
have updated. Applying 082 first does not meet the installed-client requirement.

Prepare and accept the replacement Mobile release **before this boundary**, while
the public-cover backend still serves old clients. Record bundle/channel/version
identity and prove its current-backend discovery, cover, join/leave behavior. New
Safety RPC actions cannot pass until 082 exists; the approved delivery plan must
prevent exposing a nonfunctional Safety launch during that interval. No such
release gate is implemented or silently assumed here.

If this is a controlled prelaunch fleet, obtain affirmative inventory evidence
that every supported install is replaced before 082. If uncontrolled installed
clients remain, a separately approved canonical support-version/maintenance and
feature-release mechanism is needed and must be implemented/tested before cutover.
This is an unresolved coordinated release boundary, **not** permission to add
legacy APIs, public image fallbacks or disable moderation. Do not schedule an
unbounded mixed-contract rollout or claim zero downtime.

## Dependency-ordered production procedure (not executed)

1. **Final source freeze:** resolve all gates above; fetch/review combined Mobile
   and Admin diffs, pin signed-off commit IDs and 082 hash. Re-run relevant SQL,
   HTTP, Storage, lifecycle, UI and platform exports on those exact revisions.
   Keep Shop redemption Disabled. Obtain separate release/migration approval.
2. **Preflight and recovery:** named operator/incident lead records project,
   migrations and dependency definitions/grants/RLS/Storage policy diff; active
   deletion/restore barriers; row/participant/history/count and public/private
   ride inventory; every cover's path/object ownership/existence and URL-only
   records. A URL-only image cannot be silently replaced by a placeholder: resolve
   through an authorised data plan before cutover. Confirm no unexpected objects
   or moderation defaults. Resolve guarded URL updates through normal lifecycle
   authority. No barrier bypass. Check locks and five-second migration timeout.
   Take and restore-verify database recovery and **separate Storage object/version
   inventory/bytes backup**, plus object metadata, bucket/policy/config snapshots;
   record recovery point, retention, suppression and holds. Database recovery
   alone is insufficient to recreate missing object bytes.
3. **Replacement Mobile readiness:** complete the approved client boundary before
   changing publication/storage contracts. Do not activate the Safety launch
   until backend/Admin acceptance. Record authorised supported-client inventory.
4. **Migration 082:** execute the pinned canonical file once in its transaction
   using the approved privileged migration operator. A failure/timeout means
   rollback and investigation, not partial statements, an edited bypass, a second
   competing migration or continued deployment. Verify existing `is_public`,
   lifecycle, row IDs, participant rows/counts/history unchanged and existing
   rows approved; new default pending; private bucket and retained paths/bytes.
5. **Compatible Admin:** deploy the pinned reviewed Admin revision immediately
   within the same controlled boundary. Validate canonical active/MFA staff
   `community.manage` and separate account-action permissions. Until staff review
   works, leave new/edited content pending; do not restore automatic publication.
6. **PostgREST:** 082 emits `NOTIFY pgrst, 'reload schema'`. Confirm it was processed;
   use the approved schema-refresh procedure if necessary. Verify exact RPC
   signatures/grants and that PGRST202 is gone. An empty result is successful only
   from the authenticated working RPC, never a substituted response.
7. **Authenticated acceptance:** with separately authorised existing review
   accounts, execute discovery, creator policy, pending create/edit/replacement,
   approval, join/leave, reporting/replay, block/unblock and shared participation;
   compare an unrelated rider and non-capable staff denial. Verify no report read
   or reporter/block identity leakage, no block notification, account-switch and
   expired-session isolation, audit persistence/version conflicts. Do not perform
   account suspension or mutate unrelated data under a generic safety test grant.
8. **Private covers/cache gate:** verify denied anonymous/non-owner pending reads,
   approved visible authorised signing, actual byte delivery, immutable paths,
   replacements, protected evidence, revocation after restriction and old public
   URL cache behavior. Test warmed and cold requests through the actual CDN.
   Preserve evidence and do not reopen the bucket if a cache still serves bytes.
   Accept only after the approved containment/cache bound is demonstrated.
9. **Activate approved Mobile launch:** only after backend/Admin/storage acceptance
   and the client boundary gate. Native XR/S23 Ultra: first-time carousel and
   returning compact entry; uploaded covers; loading/cached/offline/recovery,
   empty/genuine error; report/organiser/block/unblock; Guidelines/support;
   EN/NL, light/dark, narrow/large text, safe area/keyboard, reduced motion,
   VoiceOver/TalkBack; flat/elevated cards and Rewards skeleton clipping. Record
   exact installed bundle/runtime/OS and evidence. No acceptance claim from exports.
10. **Watch and sign off:** named staff checks pending/report queues, age, review
    capacity, errors/signing/permission failures and unchanged participation.
    Record go/no-go against approved targets; pause launch on any P0/P1. Store
    review notes can then use the existing non-offensive demonstration checklist
    in `community-safety.md`. Apple approval is not implied.

## Rollback and incident containment

Before COMMIT, PostgreSQL transaction rollback preserves the pre-082 schema/data;
the rehearsal exercises both early barrier failure and later prerequisite drift.
Preserve the error and inspect state before retry. There is no approved automatic
down migration.

After COMMIT or live writes, old app/Admin rollback alone is unsafe: it cannot
undo private covers or reconstruct reports/decisions. Keep the bucket private and
publication pending/restricted. Stop the Safety launch/affected write exposure
using the **previously approved tested** release mechanism; none is assumed here.
Route support to monitored staff; do not send block-specific announcements.
Preserve audit/report/image evidence and unrelated rides/financial records.
Prefer a reviewed forward repair. Any DB restore is a separate incident-authorised
operation, first rehearsed in isolation and reconciled for post-backup Safety
reports, decisions, blocks, object bytes, deletion suppression and legal holds.
Do not blindly restore erased identities or discard intervening evidence.

Signed reads request 60 seconds (riders) / 300 seconds (staff), but that is **not a
proven revocation bound**. Supabase documents that token expiry does not purge a
warmed CDN entry and the cache lifetime can differ; browser/downloaded copies
cannot be recalled. See [Supabase Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
Do not delete retained evidence merely to invalidate a URL. Provider-supported
cache containment/invalidation and the acceptable residual exposure must be
resolved before launch, with a specific incident operator and procedure.

## Separate authorisations required

- Controller/operations decisions on disclosures, coverage and lawful lifecycle
  disposition; source remediation of that confirmed integration gap. Internal
  periods, queue ownership and review targets are already approved separately.
- The client-support/launch mechanism or verified controlled-fleet replacement
  plan, and the private-cover/CDN containment decision.
- Later explicit production backup/migration/Admin/cache operations, exact
  authorised acceptance accounts and permitted test mutations.
- Separately, Mobile build/delivery/store/OTA actions and physical-device tests.

This preparation grants none of those actions. No production migration,
deployment, data change, account/report creation, EAS build, OTA or store action
was performed. Shop redemption remains outside this rollout.
