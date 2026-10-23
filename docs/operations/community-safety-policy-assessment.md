# Community Safety policy approval and implementation assessment

## Final approval matrix — 23 October 2026

**Recommendation for Owner/Privacy approval; not a recorded legal approval.**
The approved 12-month report / 24-month closed-case evidence periods, blocks until
unblock, internal MOVRR moderation ownership and 24-hour urgent / 3-business-day
routine initial-review targets remain fixed. No retained-evidence rule or disposal
behaviour is activated by this document.

| Decision requiring approval | Exact recommendation |
| --- | --- |
| Lawful basis: pre-publication review, reports/investigation, active blocks, decision accountability | Article 6(1)(f), with a documented purpose-specific legitimate-interest, necessity and balancing assessment: protect Community participants, honour safety choices, investigate abuse and support proportionate review of decisions. Use this explicit recommendation for blocks as well; no unspecified alternative basis or consent assumption. |
| Rights and deletion handling | Article 6(1)(c) for the specific applicable GDPR duties, including Articles 12, 15 and 17; apply existing request governance. This does not authorise general Safety-evidence retention. |
| Legal/safety holds | Article 6(1)(f) for an actual justified safety purpose or legal claim; 6(1)(c) only where the authoriser identifies a specific applicable legal duty. Article 17(3)(e) may limit erasure for necessary claims; it is not an Article 6 basis. |
| Special-category / alleged-offence material | Do not add structured sensitive fields. Privacy must determine any applicable Article 9 condition / Article 10 and Dutch-law authority before retaining such material. Segregate access to unsolicited allegations for authorised review; do not treat ordinary Article 6 approval as permission for a sensitive-data archive. |
| Open-report minimum | Report/case ID, ride/revision reference, target, reason category, created_at, status/version and operation reference; reporter reference for deduplication/follow-up, subject reference when applicable. Optional explanation limited to the relevant allegation. Initial-review timestamp/urgency and reviewer reference only for triage/accountability. No contact details, GPS, Wallet or rewards data. |
| Resolved-report minimum, 12 months from resolution | ID, target/revision, reason category, outcome, resolved_at, version and necessary case link. Keep reporter/subject references or an explanation/extract only under a recorded case-specific necessity decision within the approved allowlist; otherwise remove them at resolution. Do not retain a complete ride snapshot by default. |
| Moderation minimum, 24 months from case closure | Case/revision ID, decision/action, concise necessary reason, authorised reviewer reference, decision time, closed_at/closure actor, operation/version audit. Subject reference and exact text/image evidence only where needed to explain or defend that decision, with necessity recorded. Exclude reporter identity by default. |
| Active blocks | Directional rider IDs and created_at; obtain the display label from the existing authorised projection where possible. Remove the relationship on unblock; do not create a separate block-history archive or invent an audit TTL. |
| Evidence minimisation | Keep the reported field/extract, or necessary immutable image plus integrity/reference metadata. Full description, organiser display name, meeting address and image are not a universal snapshot. No duplicate bearer URLs or image copies in logs/notifications/general support. Record why an original is needed before preserving it; redact irrelevant third parties without compromising necessary evidence. |
| Report resolution / case closure | Commit resolved_at atomically with final dismissed/actioned outcome and audit. Authorised staff explicitly close the case separately and record actor/time/reason; publication approval alone does not close it. Reopening/retry must not reset the original retention deadline. A new issue requires its own necessity assessment, not a copy made to extend old evidence. |
| Holds and release | Reuse canonical lifecycle governance/capabilities; extend its linkage to ordinary Safety cases without creating deletion jobs or another approval authority. Require case/field/object scope, actual authority reference, purpose, authoriser, owner and review date. Release requires authorised reason/time/audit; review-date expiry alone does not release. Original retention deadlines remain; overdue unheld data becomes due immediately after release. |
| Secure disposal | Serialize expiry, hold and release on the same case/job lock. Separately expire report fields and decision evidence. Recheck live ride/case/hold references before object disposal; use Storage API byte deletion, durable operation IDs and confirmed receipts. Uncertain failures remain retryable/pending; never claim completed disposal from metadata deletion alone. Minimal disposal receipts need the existing approved governance rule; no new indefinite audit archive. |
| Account deletion | Use existing Safety principal bindings and account fence. Add exact approved manifest actions, nested-evidence/object handling, permitted minimum retained fields, holds and residual verification. Remove identity/contact linkage unless necessary under the approved exception; a keyed reference remains personal data. Preserve shared rides/rosters and unrelated financial history. Missing disposition stays in review, never completed or silently retained forever. |
| Export | Add a narrow requester-owned projection through the existing export service after approval. Include appropriate own reports/block choices and reviewed information about them; redact third-party identity/evidence. Never expose another reporter, who blocked the requester, staff-wide snapshots or cover tokens. Preserve manual Privacy review for restricted material and explain any lawful limitation. |

The exact field names above are the proposed logical allowlist, not a new deployed
schema. Privacy must approve which conditional identifiers/evidence may survive
resolution and the case-specific necessity recording. Unresolved cases require
necessity review; no extra retention or review interval is introduced.

Record the actual approval in the existing Mobile
`docs/implementation/account-deletion-production-decision-register.json` and
publish an additive version through the canonical policy/retention/action
registries only after approval and separate migration authorisation. Preserve
immutable prior versions and unrelated pending rules. The receipt-access approval
`MOVRR-owner-2026-10-20-receipt-access-30d` does not cover Safety.
Irreversible account deletion remains Disabled; approved intake stays independent.

### Privacy Policy text for approval, EN/NL

Publish at actual activation, after approving the basis, allowlist and implemented
clocks. Mobile `lib/legal/documents.json` remains the editable authority; use
`scripts/sync-legal-documents.cjs` for the Website mirror. Update Community,
lawful-basis, retention and rights/objection sections together. Public profile
photos remain distinct from private Community covers; add the existing provider
information by reference without inventing a provider/transfer change.

**EN:** “We review Community Ride text and covers before publication and process
necessary reports, blocking choices and moderation records to protect participants
and investigate abuse. Our proposed basis is legitimate interests in Community
safety and proportionate decision accountability, subject to the approved
assessment. We keep reports for 12 months after resolution and necessary moderation
decisions/evidence for 24 months after case closure. Active blocks remain until
unblocked. Only necessary case evidence is retained; separately authorised,
documented legal or safety holds may delay its disposal. Authorised internal MOVRR
administrators handle moderation. Community covers use private, authorised access;
we cannot recall copies already saved independently. Rider features do not reveal
the reporter or another person's blocking choice. Privacy access, erasure and
objection requests receive individual review, including other people's rights.
Contact privacy@movrr.nl for rights or support@movrr.nl for Safety help.”

**NL:** “We beoordelen teksten en omslagfoto's van communityritten vóór publicatie
en verwerken noodzakelijke meldingen, blokkeerkeuzes en moderatiegegevens om
deelnemers te beschermen en misbruik te onderzoeken. De voorgestelde grondslag
is ons gerechtvaardigd belang bij communityveiligheid en evenredige
verantwoording van besluiten, onder voorbehoud van de goedgekeurde afweging.
Meldingen bewaren we 12 maanden na afhandeling; noodzakelijke moderatiebesluiten
en bewijsstukken 24 maanden na sluiting van de zaak. Actieve blokkeringen blijven
totdat ze worden opgeheven. We bewaren alleen noodzakelijk bewijs. Afzonderlijk
bevoegde en vastgelegde juridische of veiligheidsbewaring kan verwijdering
uitstellen. Bevoegde interne MOVRR-beheerders verzorgen de moderatie. Omslagfoto's
zijn privé en alleen toegankelijk na autorisatie; onafhankelijk opgeslagen kopieën
kunnen we niet terughalen. Via fietsersfuncties tonen we niet wie de melding heeft
gedaan of wat een ander heeft geblokkeerd. Verzoeken om inzage, verwijdering of
bezwaar beoordelen we individueel, met aandacht voor de rechten van anderen.
Mail privacy@movrr.nl voor privacyrechten of support@movrr.nl voor veiligheidshulp.”

These are approval drafts: replace “proposed / voorgestelde” with the actual
approved basis wording only when that approval exists. Add the specific rights
handling legal duty to the existing rights section. Do not publish unimplemented
retention guarantees, anonymity guarantees or internal review targets as an SLA.

References: [AP lawful bases](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/grondslagen-avg-uitgelegd),
[AP retention](https://autoriteitpersoonsgegevens.nl/nl/over-privacy/persoonsgegevens/bewaren-van-persoonsgegevens),
[EDPB legitimate interests](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf).
The latter linked document is a consultation draft, used as explanatory guidance;
it does not certify MOVRR's basis. None of these sources substitutes for the
controller's necessity/field approval.

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
