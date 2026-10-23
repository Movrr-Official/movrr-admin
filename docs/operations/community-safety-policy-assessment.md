# Community Safety policy approval and implementation assessment

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
