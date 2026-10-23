# Community Safety privacy governance decision

## Final source-control addendum — 23 October 2026

The owner-authorized ordinary-data assessment and fixed periods below remain in
force. The final source narrows collection and supplies the previously missing
technical controls; no external legal opinion or production approval reference is
created. This addendum supersedes earlier source-gap/receipt statements below.

- Rider reports are structured category/target/revision only. Nonempty narrative
  is rejected; the UI collects no narrative or attachment. No blanket title/text,
  account, ride or location snapshot is copied. Report evidence keys are only
  moderation_version and, for an image report, the existing cover_image_path.
- Raw queue, image evidence, minimization and ordinary-evidence attestation require
  both community.manage and privacy.deletion.compliance.review. Other publication
  staff retain existing publication capability but receive no raw Safety queue.
  Incidental sensitive/offence material is restricted to Privacy triage; intentional
  collection/retention/use needing Article 9/10 authority remains withheld. The
  ordinary-data confirmation is version-bound and cannot confer that authority.
  New decisions invalidate it. Minimize/delete unnecessary material rather than
  copying it into reasons/logs. A hold cannot supply a missing legal condition.
- Additional permitted case fields: deletion_cleared_version and
  ordinary_evidence_reviewed_version, nullable version-bound Privacy review stamps.
  They are necessary concurrency safeguards, not identity/publication authorities;
  access, original closure deadline, export/redaction and disposal match the case.
- Receipt fields are operation_id, case_digest, policy_version, counts (reports,
  decisions, cases), created_at, completed_at and expires_at. No image bytes, path,
  narrative, names or account IDs enter receipts; the digest remains linkable data.
  This is necessary operation accountability/retry evidence within the existing
  moderation purpose and **original case closure +24-month deadline**, never a new
  post-disposal period. No-closure work has no extra post-completion horizon.
  Expired receipts remain only while confirmed cleanup is outstanding; purge as
  soon as completion is verified. Do not lose uncertain tasks on clock expiry.
  created_at marks preparation, completed_at only verified completion. The exact
  registry keys disposal.operation_id, disposal.case_digest, disposal.counts,
  disposal.timestamps belong to community_moderation/case_closure, not a separate
  community_disposal_receipt duration. No production registry rule is inserted.
- Exact source-supported personal.erase manifest is returned by the service-only
  community_safety_deletion_manifest(). It covers directional block links and
  cleared report/case/decision/event links and content; no Community ride, roster,
  history or financial table is in it. The canonical claimed worker requires an
  exact approved manifest, closed/unreopened current-version Privacy clearance,
  minimized evidence, no active case/job hold and confirmed unreferenced Storage
  cleanup. Missing approval/clearance is canonical Privacy review, never completion.
  The existing destructive-execution gate still denies writes. Review after an
  account fence must use canonical deletion governance; the ordinary staff command
  cannot bypass that fence. No automatic sensitive or unresolved-case erasure is
  introduced. Self-service export stays the narrow own report/block projection;
  wider evidence/hold access requires reviewed third-party redaction.

These technical conditions are tested in isolated canonical SQL/HTTP/Storage,
including exact-manifest failure, held-case denial, disabled execution, cleared
disposition retry, preserved participation and financial rows. Production policy
registration, retained evidence and disposal execution remain inactive. No new
retention period or invented legal duty is approved by this change.

## Internal decision and scope — 23 October 2026

**Finalized under the owner's instruction “MOVRR — Finalize Community Safety Privacy Governance”.**
The authorization is the owner's instruction to finalize the internal package and
operational choices. This document records MOVRR's internal controller assessment;
it is not an external legal opinion, regulator determination or production approval.
No separately issued approval identifier exists: do not invent one. The existing
[decision register](../../../movrr-mobile/docs/implementation/account-deletion-production-decision-register.json)
records this source and scope. No production policy/manifest version, registry
approval, retained-evidence processing or disposal job is activated here.

The ordinary-data purpose assessment, minimum-field inventory, lifecycle rules and
EN/NL publication copy below are adopted as the internal governance package. Only
the explicitly identified dependent processing remains withheld. Earlier proposed
matrices and historical gap inventories do not override this decision.

Fixed operating policy: reports **12 months from resolution**; necessary moderation
decisions/evidence **24 months from case closure**; blocks **while active**. Authorized
internal MOVRR administrators own moderation. Urgent initial review targets **24
hours**, routine initial review **3 business days**. These are internal objectives,
not public guarantees. Documented holds restrict disposal until authorized release;
they do not create another routine retention period.

## Purpose, necessity and balancing record

| Processing / basis | Present purpose and necessary data | Less intrusive alternatives considered | Rider impact, proportionality and outcome |
| --- | --- | --- | --- |
| Reporting and investigation — Article 6(1)(f) | Receive a concrete concern about a ride, its text/image or organizer; identify the affected revision, prevent repeated submissions and investigate it. Use report metadata, opaque reporter reference, relevant organizer reference and only the explanation/extract needed to understand it. | Doing nothing leaves abuse unaddressed. External email alone moves the same data into an unstructured duplicate archive. Fully anonymous reports would prevent the implemented requester-only follow-up/export and same-revision deduplication. A separate hashed identity adds another linkable identifier without eliminating those needs. | Allegations can harm reputation; reporter identity can enable retaliation. Limit staff access, show allegations as unverified, separate findings from allegations, keep reporter identity out of rider/staff queue projections and routine disclosures, and allow reviewed correction/objection. The limited, human-reviewed ordinary-data processing is proportionate; a general dossier is not. |
| Publication review and moderation accountability — Article 6(1)(f) | Inspect submitted Community content and explain a specific publication/restriction/removal decision. Keep the decision/operation reference, authorized reviewer, original closure clock and concise necessary reason. Exact content/revision evidence is conditional. | Review only after publication would expose riders first. A decision code alone can be insufficient to review an error; a complete ride/account snapshot is unnecessary. Prefer an extract or existing immutable object reference over copying the ride or whole image. | Incorrect restrictions affect creators' expression and participation. Human review, version/conflict checks, a recorded reason, Privacy/support review and independent case closure limit that impact. No automated moderation or scoring is authorized. Ordinary decision metadata is justified; blanket content retention is rejected. |
| User blocking — Article 6(1)(f) | Honor the rider's safety choice through directional canonical rider IDs, creation time and, only for usable unblock controls, a bounded known display label. | Hiding a card locally cannot enforce new joining/invitation restrictions across devices. A block-history archive or recipient notification is unnecessary. | Blocks limit discovery/new joining/invitations; they do not silently cancel existing shared participation or remove authorized shared-ride access. No block-specific notification, advertising use or access to who blocked the requester. Unblock removes the relationship. This limited processing respects both riders' interests. |
| Necessary closed-case records — Article 6(1)(f) | Explain or contest an actual past decision and investigate recurrence within the fixed 12/24-month windows. Keep only the entity-specific fields below; closure requires a case-specific reason for any retained content. | Retaining every submission/full image is rejected. Immediate erasure of all decision metadata would prevent meaningful review; anonymous aggregates cannot resolve an individual disputed decision. | Time limits, separate report/decision expiry, identity minimization on deletion, restricted evidence, recorded necessity and objection review limit continuing linkage. Approved periods are ceilings; unnecessary conditional data must be removed sooner. No new period or automatic retained-deletion archive is approved. |
| Rights handling — Article 6(1)(c) | Fulfil the applicable GDPR Articles 12/15/16/17/18/21 request duties through existing Privacy governance. Identify the requester, inspect relevant records, redact third parties and explain any lawful limitation. | Raw staff-queue export would disclose other people; an unexplained empty export would conceal outstanding review. Use narrow self-service metadata plus reviewed disclosure. | The identified duty supports necessary request handling, not general Safety retention. Keep credentials/contact handling in existing request systems; do not copy them into Safety records. |
| Case-specific hold — Article 6(1)(f), or 6(1)(c) only for an identified duty | Preserve specified existing fields/objects for an actual safety investigation or legal claim. Record purpose, necessity, basis, scope, authorized owner, actual authority reference and review/release. For 6(1)(c), cite the applicable law/order and the obligation imposed on MOVRR. | Blanket holds, speculative future claims and retaining entire accounts are rejected. Preserve a narrower extract/reference where sufficient. | A hold may delay erasure and requires heightened review/restricted use. Article 17(3)(e) is an erasure exception for necessary claims, not an Article 6 basis. Review-date expiry never silently releases a hold. No generic statutory Safety-retention duty is asserted. |

The positive balancing conclusion is limited to these concrete purposes and the
inventory below, with the stated safeguards implemented before activation. Riders
can reasonably expect handling of Community abuse and their block choice; they
would not reasonably expect unrelated tracking, public allegations or indefinite
evidence archives. Objections require an individual documented assessment, not an
automatic rejection. Reassess for a changed purpose, population, scale or intrusive
processing; this ordinary-data assessment does not pre-clear high-risk processing.

**Sensitive-data limitation:** a category such as harassment or spam does not by
itself establish an offence or reveal special-category data. Actual narratives or
images may reveal health, sex life/orientation, ethnicity, beliefs or substantiated
offence allegations. Article 6(1)(f) alone is insufficient for that material.
No Article 9 condition or Article 10/UAVG authority is established by this package.
Stop deliberate collection/retention/use of that dependent material until its
specific authority, restricted handling and minimization are assessed. Unsolicited
material needs restricted Privacy triage; do not circulate it, copy it to support
logs. The source now limits the raw queue to dual-authorized Privacy reviewers;
that restriction does not supply the missing legal condition.
An ordinary non-sensitive extract may be used where sufficient and lawfully
produced. A legal hold does not cure a missing sensitive-data authorization.

Sources for the legal framework: [AP lawful bases and criminal-data rules](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/grondslagen-avg-uitgelegd),
[EDPB lawful processing and sensitive data](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en).
The balancing outcomes and field choices above are MOVRR's internal assessment of
its implemented purposes, not findings made by those authorities.

## Adopted minimum-field inventory

“Core” means necessary while the entity serves its purpose, not permission to keep
it indefinitely. “Conditional” means a reviewer records the specific necessity in
the existing case reason/event and minimizes it when that necessity ends. A global
allowlist is a ceiling, never proof that every allowed field is necessary in every
case. Unlisted JSON keys, identity/contact snapshots, meeting addresses/coordinates,
GPS histories, Wallet/Rewards/financial data and bearer image URLs are prohibited.
Canonical Community/Rider records remain the only identity/participation authority;
evidence references and display labels cannot authorize access or reconstruct a rider.

| Entity / exact permitted fields | Necessity and purpose | Access | Trigger, expiry and disposal | Export / account deletion |
| --- | --- | --- | --- | --- |
| `community_report`: `id, ride_id, content_version, target, reason, created_at, status, version, resolved_at` | Core: report/revision identity, category, outcome, concurrency and original resolution clock. `resolved_at` is null until final outcome. | Existing `community.manage` staff via authorized service projection; no rider table access. | First committed dismissed/actioned outcome starts 12 months. Delete expired report independently of decision retention. Open reports require necessity review; no extra open-case term is invented. | Own metadata projection only; reviewed additional access below. Remove on deletion unless an exact necessary exception applies. |
| Report `reporter_user_id` | Core opaque linkage for implemented same-revision deduplication, own export and deletion inventory during ordinary report handling. No email/name/contact copy. On account deletion deduplication no longer justifies keeping this link; erase it with the report or approved canonical transformation. | Narrow RPC/service operations; excluded from moderation queue and other riders. | No longer than the report's original 12-month deadline; earlier removal when purpose ends. | No reporter identity in another person's routine export. Never invent a replacement identity authority. |
| Report `subject_rider_id` | Conditional: the rider organizer actually implicated by the reported content/organizer and necessary follow-up. Null where not applicable; not a general association register. | Authorized staff/Privacy review. | Report deadline; remove earlier if the allegation no longer needs the link. | Individual reviewed disclosure; deletion removes linkage unless a justified exact exception remains. |
| Report `description, evidence` | Narrative is disabled and remains empty. Evidence contains only moderation_version and, for an image target, the necessary immutable cover_image_path; no copied title/text. | Dual-authorized moderation/Privacy reviewers; incidental sensitive material restricted to triage, with dependent processing withheld. | Report original resolution +12 months; minimize unnecessary references sooner. | Reviewed own records and third-party redaction; no automatic content archive on deletion. |
| `community_safety_case`: `id, report_id, ride_id, created_at, first_review_at, urgency, closed_at, closed_by, reopened_at, deletion_cleared_version, ordinary_evidence_reviewed_version, version` | Core lifecycle identity/review/concurrency. `report_id` conditional and cleared when report expires; timestamps/reviewer nullable until events occur. Original `closed_at/closed_by` establish closure accountability; reopening is a state event, not an extension. | Existing `community.manage`; Privacy for rights/holds. | 24 months from original case closure. Explicit closure also applies to standalone publication cases. Case/event metadata is removed on due unheld disposal. | Reviewed own information, not raw staff-wide case rows. Canonical deletion inventory includes reviewer/event references; detach unnecessary identity under an exact manifest. |
| `community_moderation_audit`: `id, operation_id, case_id, report_id, ride_id, actor_user_id, action, reason, created_at, evidence` | Core decision identity, idempotence, reviewer and concise necessary decision reason; `report_id` conditional until report expiry. `evidence` is conditional under the four-key allowlist above, never a universal snapshot. | Existing `community.manage`; restricted Privacy review. | 24 months from linked original case closure. Default closure drops content snapshots; explicit necessary retention must pass the approved field gate. | Redact third-party/reporter identity. Retain a reviewer link after account deletion only if necessary to the actual decision/claim and covered by the canonical exception. |
| `community_safety_event`: `operation_id, case_id, actor_user_id, action, reason, payload, created_at` | Core command accountability and retry. `reason` is concise decision/necessity text, not a duplicate report. `payload` allows only `hold, authority, review, policy, retain`, with values only for the command that needs them; otherwise null/empty. | Authorized case staff; hold/release requires additional `privacy.deletion.compliance.review`. | Same original case deadline; holds suspend disposal of their scope. No separate event archive. | Reviewed disclosure only; actor linkage follows the same necessity/deletion rule as decisions. |
| `community_block`: `blocker_rider_id, blocked_rider_id, created_at, display_name` | Directional IDs/time are core enforcement. `display_name` is conditional, at most the existing 200-character known label needed to identify an unblock choice; generic label where sufficient. It is a non-authoritative display copy, never identity evidence. | Requester-owned block RPC; enforcement internally. No inverse “who blocked me” projection. | While active; canonical unblock deletes it. No separate unblock history/audit retention is authorized. | Own directional choices only. Delete relationships involving the deleted account through canonical dispositions; preserve shared rides/rosters. |
| Existing `account_deletion_hold`: `id, job_id, community_case_id, category, authority_reference, owner_capability, review_due_at, released_at` | One job OR case link, never both. Core scoped authorization/owner/review/release metadata. Case event records authorizer, actual purpose/basis, scope and release reason/time without duplicating evidence. | Both existing moderation and Privacy compliance capabilities for Safety commands. | Until explicitly released; then original deadlines apply. Released case holds expire with their case; deletion-job holds retain canonical governance. | Reviewed rights response; account deletion cannot bypass a hold. No blanket indefinite retention. |
| `community_cover_disposal`: `path, case_id, operation_id, lease_until, confirmed_at, attempts` | Core minimal retry/reference/confirmation state. Path can contain account linkage: treat it as personal data. No image bytes/narrative in task rows. | Controlled internal disposal service only. | Pending work remains pending until confirmed byte removal; confirmed rows are eligible with approved receipt cleanup. No independent task-retention period. | Operational status may be reviewed; no path/token disclosure in routine export. A new hold or surviving reference prevents deletion. |
| `community_safety_disposal_receipt`: `operation_id, case_digest, policy_version, counts, created_at, completed_at, expires_at` | Necessary operation retry/accountability only. Counts are reports/decisions/cases; digest is linkable personal data. No bytes, paths, narrative or account IDs. | Controlled disposal service and authorized Privacy audit. | Original case closure +24 months; no separate post-disposal period. Expired pending work survives only until confirmed completion, then is eligible for immediate purge. | Reviewed status only; approved exact registry fields required before execution. |

Registry mapping remains `community_reports` / `report_resolution` (12 months),
`community_moderation` / `case_closure` (24 months, including minimal receipts).
There is no separate receipt-period category. Logical keys in 082 map to the
exact columns above: `case_id` covers entity/revision/operation links, `category`
target/reason, `timestamps` lifecycle clocks, `outcome` status/version, `decision`
action/necessary reason, `reviewer` actor/closure references. Conditional report
keys are `reporter_reference, subject_reference, description` and actual
`evidence.<key>`; moderation evidence checks actual keys too. Approval of the
logical key never authorizes more columns than this inventory.

## Lifecycle, rights and execution rules

1. Resolve a report atomically with its final outcome/audit. Close the case
   explicitly after resolution; publication approval alone is not closure. Retries
   are idempotent; reopening preserves the original deadline. A new case must
   represent a new issue, not copy expired evidence to extend retention.
2. Record content necessity and use the smallest relevant extract. Keep an
   immutable image only when its relevant features/context are needed to review
   the decision and a narrower record is insufficient. Prefer an existing private
   reference; never duplicate full images by default. An expired report cannot
   extend its reporter/narrative fields through the 24-month decision window.
3. Holds require actual purpose/basis, field/object scope, authority, authorized
   owner and review date. The case reason must identify these, with a controlled
   reference for detail if needed. Case-level locks/holds must conservatively
   protect all scoped evidence; field-specific minimization needs reviewed
   controls, not an inferred exemption. Release requires both capabilities,
   reason/actor/time and audit; then overdue unheld data is due without a new clock.
4. Disposal rechecks eligibility, active holds and every live/case reference.
   Serialize hold/release/expiry with canonical locks. Delete bytes through Storage,
   then confirm; metadata deletion alone is not proof. Lost responses, live leases,
   new holds and failed confirmations remain retryable/pending under the same
   operation. Confirmed receipts/tasks must also expire under applicable governance.
5. Account deletion uses existing restrictions, exact canonical manifests and
   residual verification. Default is erasure of Safety links/records whose purpose
   has ended, and both directional block relationships. An actual ongoing case,
   necessary closed-case decision or hold needs a recorded exception: preserve only
   the inventory's necessary fields and original deadline, restrict access, and
   erase unrelated identity/contact links. No automatic retained-deletion archive.
   If a canonical move into deletion evidence is necessary, approve the exact
   source/target/action, avoid a duplicate active copy and preserve original clocks.
   Missing exact transformations stay in existing Privacy review, never “completed”.
   Shared rides, rosters/history and unrelated financial obligations remain intact.
6. Existing self-service export permits own report `id,target,category,createdAt,
   status,resolvedAt` and own block `riderId,createdAt`; retain the explicit Privacy
   review notice. Review requester-authored narrative, relevant decisions, evidence
   and hold information individually. Redact other reporters, private block choices,
   third parties and credentials; record the specific reason for any limitation.
   An unavailable Safety contract is pending review, not an empty completed export.

**Specific activation dependencies:** actual additional authority for Article 9/10
material remains unestablished; that processing stays withheld. Exact ordinary-data
registry rules and personal.erase manifest must be approved/registered through the
existing governance before dependent execution. The finite receipt design and
conditional minimization/deletion source controls are now implemented and verified
as described above; no new duration or production approval reference was invented.
Retained-evidence/disposal and irreversible account execution remain inactive.

## Final EN/NL Privacy Policy copy

Internally finalized for the Community Safety activation. **Not published now.**
Apply through Mobile `lib/legal/documents.json` and its existing Website sync only
when the described behavior and approved governance are operational. Keep existing
controller, recipient/provider/transfer and general rights sections; this additive
copy creates no new provider or transfer claim. Public profile photos remain a
separate purpose. Internal review targets are deliberately omitted.

**EN**

You can report a Community Ride, its text or cover image, or its organizer for
harassment, hate, sexual or violent content, spam, impersonation or another safety
concern. Blocking limits discovery and new joining or invitations between you and
that rider. It does not automatically end existing shared-ride participation;
authorized shared-ride access can remain. We do not send block-specific notifications.

MOVRR processes account/rider references, the relevant ride and content version,
report category, necessary evidence references, blocking choices and moderation
decisions/timestamps. Authorized internal MOVRR administrators review reports and
content. We use this information for our legitimate interests in protecting
participants, investigating abuse, honoring blocking choices and reviewing our
decisions. We use a legal-obligation basis only for an applicable identified duty,
including handling privacy-rights requests. We do not use automated moderation.

Reports are retained for 12 months after resolution; necessary moderation decisions
and evidence for 24 months after case closure. Active blocks remain until unblocked.
We minimize unnecessary information sooner. Separately authorized, documented
legal or safety holds can delay disposal of necessary evidence. Community covers
use authorized private delivery; independently saved copies cannot be recalled.
Rider-facing features do not disclose reporter identities or who blocked you.

You may request access, correction, erasure or restriction and object to processing
based on legitimate interests. We review requests individually, including other
people's rights and applicable lawful limitations. Contact privacy@movrr.nl for
privacy rights or support@movrr.nl for Community Safety help. You can complain to
the Autoriteit Persoonsgegevens. Reports use structured categories; please do not send unnecessary personal or
sensitive information through support channels.

**NL**

Je kunt een communityrit, de tekst of omslagfoto, of de organisator melden vanwege
intimidatie, haat, seksuele of gewelddadige inhoud, spam, identiteitsmisbruik of een
ander veiligheidsprobleem. Blokkeren beperkt het ontdekken van ritten en nieuwe
deelname of uitnodigingen tussen jou en die fietser. Bestaande deelname aan een
gedeelde rit eindigt niet automatisch; toegestane toegang tot die rit kan blijven
bestaan. We sturen geen afzonderlijke melding over een blokkering.

MOVRR verwerkt account- en fietsersverwijzingen, de betreffende rit en inhoudsversie,
de meldingscategorie, noodzakelijke bewijsverwijzingen, blokkeerkeuzes en
moderatiebesluiten met tijdstippen. Bevoegde interne MOVRR-beheerders beoordelen
meldingen en inhoud. We verwerken deze gegevens voor onze gerechtvaardigde belangen:
deelnemers beschermen, misbruik onderzoeken, blokkeerkeuzes uitvoeren en onze
besluiten kunnen beoordelen. Een wettelijke verplichting gebruiken we alleen als
grondslag voor een concrete toepasselijke plicht, waaronder de behandeling van
privacyverzoeken. We gebruiken geen geautomatiseerde moderatie.

Meldingen bewaren we 12 maanden na afhandeling; noodzakelijke moderatiebesluiten en
bewijsstukken 24 maanden na sluiting van de zaak. Actieve blokkeringen blijven tot
ze worden opgeheven. Onnodige gegevens beperken of verwijderen we eerder.
Afzonderlijk bevoegde en vastgelegde juridische of veiligheidsbewaring kan de
verwijdering van noodzakelijk bewijs uitstellen. Omslagfoto's van communityritten
worden privé en na autorisatie aangeboden; onafhankelijk opgeslagen kopieën kunnen
we niet terughalen. Fietsersfuncties tonen niet wie een melding heeft gedaan of wie
jou heeft geblokkeerd.

Je kunt inzage, correctie, verwijdering of beperking vragen en bezwaar maken tegen
verwerking op basis van gerechtvaardigde belangen. We beoordelen verzoeken
individueel, met aandacht voor de rechten van anderen en toepasselijke wettelijke
beperkingen. Mail privacy@movrr.nl voor privacyrechten of support@movrr.nl voor hulp
bij communityveiligheid. Je kunt een klacht indienen bij de Autoriteit Persoonsgegevens.
Vermeld in een melding geen onnodige persoonlijke of gevoelige details.

---

## Historical assessment before the focused decision package

23 October 2026. The owner confirmed in this acceptance task that the periods,
ownership and internal review targets below were **approved separately**. Record
that approval without treating it as approval of the remaining lawful-basis,
disclosure, lifecycle/disposal implementation or production release decisions.
The canonical operating policy is `community-safety.md`; this assessment adds
the implementation/disclosure inventory. It is not a public service promise or
instruction to run deletion jobs.
See [release gates and rollout](community-safety-rollout.md). No production
records, account permissions, privacy documents or scheduled jobs were changed.

## Approved internal policy and remaining implementation decisions

| Category | Approved internal duration and start | Scope and decision needed |
| --- | --- | --- |
| Safety reports | 12 months after resolution | Report reason, optional narrative, reporter/subject identifiers, ride/revision reference, status and necessary snapshot. Resolution means the committed `dismissed`/`actioned` transition and its matching audit timestamp. Approve necessity, lawful basis, minimum fields and disposal authority. |
| Moderation decisions/evidence | 24 months after closure | Decision, staff actor, reason, revision/operation reference and necessary text/image evidence. Define closure for standalone publication decisions and appeals; the schema has no appeal/closure field. Do not assume every approval closes a continuing case. |
| Active blocks | Until unblocked | Directional rider IDs and stored display label. Unblocking removes the relationship through the canonical RPC. Account deletion/cascade handling and any justified separate exception require explicit lifecycle disposition. |
| Legal holds | Separately authorised scope and review date | Named authority, purpose/basis, minimum fields/objects, owner, review/release process; no blanket indefinite hold. Use existing governance, not an independent Safety hold authority. |

The same snapshot can exist in a report, an audit and a retained image. Removing
one copy does not dispose of the others. Each copy needs its own approved purpose,
start event and end date. A 24-month decision record must not silently justify
keeping every 12-month report field. Decide whether report and decision evidence
can be minimised separately. Open cases need periodic necessity review; these
periods do not authorise perpetual retention while a case remains open.

These approved internal periods are not legal defaults. The Dutch authority requires a
purpose-based retention assessment and recorded/disclosed criteria; it does not
set a universal retention period. The controller must choose and document the
lawful basis before processing. See [AP retention guidance](https://autoriteitpersoonsgegevens.nl/nl/over-privacy/persoonsgegevens/bewaren-van-persoonsgegevens)
and [AP lawful bases](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/grondslagen-avg-uitgelegd).

## Approved ownership and response targets

The approved queue owner is authorised **internal MOVRR administrators** with
the existing `community.manage` capability and required active/MFA session.
Approve a named primary, backup and escalation roster before enabling writes.
Do not broaden support/tenant roles or create another role authority.

Approved internal initial-review targets: urgent reports within **24 hours**, routine
reports within **3 business days**. These mean initial human triage, not guaranteed
resolution. Approve coverage outside office hours, Europe/Amsterdam business-day
calendar, absence cover and escalation contacts before publishing any promise.
Approve a monitoring cadence and capacity for both pending publication and reports.
The current queue displays the oldest 100 per status/reason; there is no automatic
urgency classifier, staffing scheduler or SLA alarm. Staff must review all reason
filters and avoid starvation when a queue exceeds that limit.

At triage, inspect the reported revision, current content and all cover bytes.
Do not approve an image that cannot load. Leave uncertainty pending, request an
operational review through approved internal channels, and record a specific
reason for dismissal/restriction/removal. Reports alone never establish guilt
or automatically suspend an account. Account actions retain their separate
canonical capabilities. Use the same operation ID after an uncertain command;
refresh after a version conflict. Do not repeat with a new ID to defeat concurrency.

Support remains `support@movrr.nl`; rights/account-deletion requests use the
existing `privacy@movrr.nl` process. Confirm monitoring and handover. Do not put
reporter identity, block choices, private images or report narratives into ordinary
rider notifications or unrelated tickets. Rider confirmations disclose submission,
not decisions. Review access/appeal requests with third-party confidentiality
and justified redaction; do not promise absolute anonymity against legal process.

## Account deletion and implementation gate

Existing governance requires approved category/purpose/basis/minimum fields,
start event, period, capability, disposal mechanism and approval reference.
Migration 082 does **not** populate those approvals. Its report/audit records have
no account/content cascade so evidence survives removal; blocks have rider FKs.
Retention is not implemented by those FK choices. Referenced images cannot be
deleted by ordinary service cleanup. No expiry job has been added.

The full-schema rehearsal additionally found that 035's catalogue-time ownership
registration does not automatically cover tables created later by 082. No Safety
bindings are present in `account_deletion_barrier_binding` after 082. Before
release, resolve and test registration/guard coverage through the existing
authority and approve a disposition for:

- `community_block.blocker_rider_id` and `blocked_rider_id` (rider identities).
- `community_report.reporter_user_id` (user), `subject_rider_id` (rider), and
  retained JSON/cover evidence, including identifiers when a subject row is gone.
- `community_moderation_audit.actor_user_id` (user), its report/ride references
  and retained JSON/cover evidence.

These are required inventory entries, **not approved erase/retain instructions**.
Parent relationships must not accidentally inherit authority to delete shared
rides or another rider's participation. The existing dynamic residual scan
includes later public tables, but detecting residuals is not an approved disposal
workflow. Review the canonical deletion manifests, subject resolution, barrier
and retained-exception verification together. Do not disable deletion intake,
drop barriers, silently retain everything, or call a request completed while
unresolved Safety data remains. This unresolved integration is a release gate.

082's existing-cover URL update also touches guarded Community rows. The isolated
test proves an active deletion barrier rejects that update and rolls back 082.
Preflight must identify these rows and resolve them through the existing authorised
lifecycle process. A service claim is not permission to bypass the barrier.

## Exact disclosure changes for approval

Update both languages of Mobile `lib/legal/documents.json`, Privacy `community`
and `retention` sections, and keep the existing account-deletion explanation
consistent. Do not edit unrelated Terms or claim all profile assets are private.
The current public-cover wording must distinguish public profile photos from
private Community covers, human publication review and authorised signed reads.

The approved disclosure needs: report reasons/narratives and reporter/subject
identifiers; content/revision snapshots and retained images; directional blocks
and display labels; staff decisions/reasons/audit metadata; safety purposes and
controller-selected lawful basis; restricted internal access; confidentiality
limits; retention clocks/criteria and lawful holds; rights/account-deletion and
support/appeal routes; applicable providers/transfers already in the provider
inventory. No new moderation provider is used by this implementation.

Draft product explanation, **not ready-to-publish legal text**:

> EN: We review Community Ride text and cover images before publication. When you
> report a ride or organiser, we process your reason, optional explanation and
> the relevant content so authorised MOVRR staff can investigate. Blocking stores
> your choice and limits future Community interactions. We do not show your
> report identity or block choices to the other rider through rider features.
> Contact support@movrr.nl for safety help and privacy@movrr.nl for privacy rights.

> NL: We beoordelen teksten en omslagfoto's van communityritten voordat ze
> worden gepubliceerd. Als je een rit of organisator meldt, verwerken we je
> reden, eventuele toelichting en de betreffende inhoud, zodat bevoegde MOVRR-
> medewerkers de melding kunnen onderzoeken. Bij blokkeren bewaren we je keuze
> en beperken we toekomstige interacties binnen de community. Via de
> fietsersfuncties tonen we de andere fietser niet wie de melding heeft gedaan
> of wie je hebt geblokkeerd. Mail support@movrr.nl voor hulp bij veiligheid en
> privacy@movrr.nl voor je privacyrechten.

Add the approved basis, periods/start events, holds and rights limitations to
that explanation before publication. Privacy/legal/version acknowledgement
requirements need the controller's approval; this draft does not invent them.
