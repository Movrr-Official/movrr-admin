# Community Safety policy approval and implementation assessment

## Current decision package — 23 October 2026

**Decision required; production remains no-go.** The owner's latest clarification
confirms that only the durations and internal ownership/review targets are
approved. No Safety lawful-basis/necessity reference or final field inventory
exists. The recommendations here are not approvals or executable retention rules.
This section supersedes the historical implementation inventory below where the
account write-fence correction is concerned. No retained deletion evidence,
disclosure publication, migration, deployment or release was activated.

### Existing authority and exact approval route

Use Mobile `docs/implementation/account-deletion-production-decision-register.json`
and `docs/legal/OPERATING-DECISIONS.md`, alongside Admin
`docs/operations/account-deletion-policy-decisions.md`. The authoritative runtime
records are `account_deletion_policy_version`, `account_deletion_retention_rule`,
the existing action rules, active-policy pointer, operating gates, case review,
holds and audit. The captured policy review and intake/execution separation
receipts establish that policy v2 approves receipt delivery/access only; it does
not approve Safety, erasure, financial retention or holds. The genuine
`MOVRR-owner-2026-10-20-receipt-access-30d` reference must not be reused for Safety.

Owner/Privacy must document the purposes, necessity and balancing, exact field
allowlists, evidence exceptions, account/export handling and real approval record.
Use qualified privacy/legal review for sensitive allegations and contested legal
grounds. Then prepare an additive policy version through the established controlled
migration process, preserving immutable prior versions and pending unrelated rules.
The current active version is 2: do not assume the next number without checking
the authoritative pointer at preparation time. Job-scoped proposal approval is
not approval of immutable policy rules. Keep irreversible execution Disabled.
Intake remains independently available under its already approved contract.

### Proposed purposes, bases and minimum data — all require approval

| Purpose | Recommended basis assessment | Proposed minimum, subject to necessity review |
| --- | --- | --- |
| Review Community text/covers before publication | Article 6(1)(f): protect participants and prevent harmful publication; record interest, necessity, less intrusive alternatives, impact and safeguards | Ride/revision reference, material submitted for review, state, submission/review timestamps, authorised reviewer, decision/reason and operation/version reference |
| Receive, investigate and resolve reports | Article 6(1)(f) for proportionate Community safety and dispute handling, conditional on the documented balancing assessment | Case/report ID, target and revision, reason category, created/resolved timestamps, status; reporter/subject references only where needed for deduplication, investigation, follow-up or defensible decision; necessary explanation/extract only |
| Honour a rider's active block | Assess Article 6(1)(b) only if this user-requested function is objectively necessary to provide the agreed service; alternatively assess 6(1)(f) for safety. Choose/document the applicable basis by purpose, not both as unspecified alternatives | Directional rider references and active relationship; creation time for ordering. Stored display label only if necessary; prefer a current authorised projection and avoid an independent identity archive |
| Demonstrate moderation decisions and deal with complaints | Separately assess 6(1)(f), including necessity for each retained item throughout the approved period; no blanket claims archive | Case/revision ID, necessary subject reference, action, specific reason, authorised reviewer reference, decision/closure timestamps and version/operation audit; do not copy reporter identity or every report narrative into this record |
| Process rights/deletion requests and demonstrate their handling | Assess 6(1)(c) against the specific applicable GDPR rights/accountability duty; use existing request governance | Existing verified subject/request, disposition and minimal receipt/exception metadata; Safety additions only where required to locate and decide relevant records |
| Preserve evidence under a specific legal/safety hold | Use the actual documented obligation or justified claim/safety purpose: 6(1)(c) only for an identified duty, otherwise assess 6(1)(f). Article 17(3)(e) is an erasure exception, not a standalone Article 6 basis | Exact case/objects/fields, authorising person and authority reference, purpose, owner/capability, review due date, creation/release time and release authorisation |

Article 6(1)(f) requires a documented three-part assessment before processing;
it is not automatically established by a safety purpose. See the
[AP basis guidance](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/grondslagen-avg-uitgelegd).
Contract wording alone does not establish objective necessity under 6(1)(b);
see [EDPB contractual necessity](https://www.edpb.europa.eu/system/files/2026-03/edpb-summary-guidelines2-2019-contractual-necessity-online-services_en.pdf).
Do not treat a report button or acceptance of Terms as consent for allegations
about another person. Do not infer a statutory moderation-retention duty.

Descriptions/images can reveal health, sexuality, ethnicity or alleged offences.
Privacy review must assess whether Articles 9/10 and applicable Dutch rules apply
and identify any additional permissible condition; an ordinary Article 6 basis
does not settle that question. No special-category or criminal-allegation archive
is approved here. See [EDPB sensitive-data balancing guidance](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf).

### Evidence and lifecycle design for approval before implementation

The current 082 snapshots copy title, full description, organiser display name,
meeting point/address and cover path for every report target and decision. That
is broader than a justified target-specific minimum. Recommend retaining only
the reported text/extract or necessary image; an organiser complaint does not
automatically require a meeting address or full ride description. Decide whether
any full original is necessary, restrict it to the case, and minimise/redact
irrelevant faces, third-party names and location detail without destroying
evidence needed for a genuine dispute. Do not duplicate bytes or unrestricted
bearer URLs into logs, notifications, analytics or general support tickets.
Never retain GPS, Wallet or reward data just because the case involves a ride.

Implement after approval:

- **Reports:** authoritative `resolved_at` committed atomically with the final
  `dismissed`/`actioned` decision and audit; expire the report's identifiers,
  explanation, snapshots and obsolete links at resolution + 12 months, unless a
  separately authorised scoped hold applies. A retained moderation decision does
  not extend the whole report's lifetime.
- **Decisions/evidence:** explicit authorised case closure, separate from a
  publication approval or report resolution; record closure actor/time/reason and
  conflict-safe operation. Start the 24-month clock at that closure. Reopening
  must have recorded reasoning and approved clock semantics; never reset expiry
  merely on read/retry. Open cases need necessity review rather than indefinite
  retention. No new review/retention interval is assigned here.
- **Blocks:** remove the relationship on unblock; do not preserve a block-history
  archive. If an exceptional audit is necessary, Privacy must approve its exact
  purpose/fields/end criterion. No separate audit TTL has been approved.
- **Holds:** existing deletion holds are job/category scoped and require the
  existing governance capabilities. They cannot silently stand in for ordinary
  Safety cases without deletion jobs. Prepare a reviewed linkage/extension to
  that authority for non-deletion cases after scope approval; do not manufacture
  deletion jobs or create a competing hold-authorisation system. Release requires
  an authorised decision, reason and audit. Passing a review date is not release.
- **Disposal:** use the same physical case/job lock for hold, release and expiry.
  Check every live ride, open/retained case and hold reference before deleting an
  object. Dispose eligible record fields independently from shared image bytes.
  Storage API byte deletion needs a durable claim/recheck/confirmation workflow;
  deleting a `storage.objects` row alone is not verified byte disposal. Retry the
  same operation after uncertain failures; retain a minimal approved receipt,
  never mark success before bytes and references are reconciled. Bound worker
  batches and report safe failure codes without retaining narratives in logs.
- **Deletion:** register Safety principals with the canonical barrier (now done
  in candidate 082), but do not equate inventory with erase/retain authority.
  Extend approved manifests and residual verification for reporter, subject,
  reviewer, nested evidence, image copies and holds. Preserve legitimate shared
  rides/participants independently. Only approved minimum evidence may enter the
  existing retained-evidence allowlist. Missing approval keeps the case in review;
  it must not be completed, silently retained forever or broadly cascaded.
- **Export:** extend `features/profile/services/dataExport.ts` through a narrow
  authenticated projection after approval; currently it covers account, routes,
  sessions, ledger and preferences, not Safety. Include the requester's own
  appropriate report/block data; separately review/redact allegations about them.
  Never expose another reporter's identity, who blocked them, private cover bearer
  tokens or an unrestricted staff evidence snapshot. Preserve the existing manual
  privacy-rights route for case-specific review and explain any lawful limits.
- **Copies:** include private object versions, exports/backups, browser/device
  copies and restoration suppression in the approved disposition. No recoverable
  copy horizon is established here; do not invent an additional retention period.

The approved durations are controller choices, not universal statutory periods;
see [AP retention guidance](https://autoriteitpersoonsgegevens.nl/nl/over-privacy/persoonsgegevens/bewaren-van-persoonsgegevens).

### EN/NL disclosure recommendation — draft, not published

Update Privacy `community`, `retention`, basis and rights sections in Mobile's
`lib/legal/documents.json`; publish its Website mirror only through
`scripts/sync-legal-documents.cjs`. Distinguish public profile assets from private
Community covers, approved public ride visibility from restricted pending covers,
authorised signed access from confidentiality guarantees, and server controls
from independently saved copies. Add the final approved purposes/bases, exact
data categories, restricted internal recipients, confidentiality limits, rights,
objection/complaint routes and hold criteria. Coordinate the effective version
with actual activation; the current public-cover notice describes current production.
No new provider or unverified international-transfer claim is proposed.

**EN draft:** “MOVRR reviews Community Ride text and cover images before
publication. We process report categories, necessary explanations and evidence,
involved account references and authorised moderation decisions for Community
safety. Reports are kept for 12 months after resolution; necessary moderation
decisions and evidence for 24 months after case closure. Active blocks are kept
until you unblock. Separately authorised, documented legal or safety holds may
delay disposal of the relevant data. We restrict access to authorised MOVRR
administrators and do not show another rider your report identity or blocking
choice through rider features. Privacy requests require review of other people's
rights and confidentiality. Contact privacy@movrr.nl for rights requests or
support@movrr.nl for Safety help.” Add the approved basis/interest and signed-cover
explanation before publication; do not claim these clocks are already enforced.

**NL concept:** “MOVRR beoordeelt teksten en omslagfoto’s van communityritten
vóór publicatie. Voor de veiligheid binnen de community verwerken we
meldingscategorieën, noodzakelijke toelichtingen en bewijsstukken, verwijzingen
naar betrokken accounts en bevoegde moderatiebesluiten. Meldingen bewaren we
12 maanden na afhandeling; noodzakelijke moderatiebesluiten en bewijsstukken
24 maanden na sluiting van de zaak. Actieve blokkeringen bewaren we totdat je
de blokkering opheft. Afzonderlijk bevoegde en vastgelegde juridische of
veiligheidsbewaring kan verwijdering van de betreffende gegevens uitstellen.
Alleen bevoegde MOVRR-beheerders krijgen toegang. Via fietsersfuncties tonen we
de andere fietser niet wie de melding heeft gedaan of wie je hebt geblokkeerd.
Bij privacyverzoeken beoordelen we ook de rechten van anderen en vertrouwelijkheid.
Mail privacy@movrr.nl voor privacyrechten of support@movrr.nl voor veiligheidshulp.”
Voeg vóór publicatie de goedgekeurde grondslag/het belang en uitleg over
ondertekende toegang tot omslagfoto’s toe; beweer niet dat deze termijnen al
technisch worden afgedwongen.

### Decision to record

Owner/Privacy must approve or revise the purpose/basis matrix, exact allowlists
and necessity exceptions, closure/reopen semantics, hold authorisation/linkage,
export/redaction and auditable byte disposal. Record the genuine reference only
when that decision exists. Durations, internal administrator ownership and
24-hour urgent / 3-business-day routine initial-review targets are already
approved and are not reopened. Named coverage/escalation remains operational
acceptance; these targets are not a public SLA. Stop at these decisions.

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
