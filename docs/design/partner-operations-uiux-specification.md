# Partner Operations — Enterprise UI/UX Design Specification

**Audience:** product designers, engineers, product managers, QA, and operations leads implementing this Admin page  
**Status:** Canonical implementation contract for Partner Operations  
**Authority:** Subordinate to the Product Constitution — must never redefine product responsibilities  
**Product constitution:** `docs/product/partner-operations-and-organisations.md`  
**Companion specs:** `docs/design/organisations-uiux-specification.md` · `docs/design/partner-operations-vs-organisations-design-rationale.md`  
**Related:** `docs/product/reward-fulfilment-engine.md`

This document defines **how Partner Operations must communicate its unique product mission**.  
It does **not** prescribe pixels, components, frameworks, visual tokens, or code.

**Design authority rule:** If a proposed UI makes Partner Operations feel interchangeable with Organisations, or relocates a capability against the Product Decision Framework, the design is invalid until revised — or until the Product Constitution is formally updated first.

---

## How to use this document

| Role | Use this document to… |
|------|------------------------|
| Designer | Structure hierarchy, drawers, empty states, and navigation so readiness mission is obvious |
| Engineer | Implement information architecture and workflows without inventing product meaning |
| Product | Review designs against mission, primary question, and design invariants |
| QA | Validate that the page answers its primary question and never absorbs foreign jobs |

**Implementation constraint:** A designer or engineer should be able to build Partner Operations from this specification **without making new product ownership decisions**. Ambiguity of ownership is resolved only by the Product Constitution. Divergence rationale vs Organisations lives in the companion rationale document.

---

## Design philosophy (this page)

Design must communicate product responsibility: **Reward Partner fulfilment readiness**.

| Principle | Implication for Partner Operations |
|-----------|-------------------------------------|
| Mission before layout | Every region advances readiness |
| Decision support over data density | Prefer signals that change enable / staff / suspend decisions |
| Context before detail | Fleet posture → partner row → drawer → foreign systems |
| Operational command centre | Feels like capacity ops, not a tenancy browser |
| Reuse components, not meaning | Shared primitives with Organisations are fine; identical framing is not |

**Forbidden pattern:** A partners list that is only Organisations with `type=reward_partner` and the same hierarchy, copy, KPIs, and drawer story.

---

## Page mission

**Ensure every Reward Partner is fulfilment-ready — staffed, contactable, and safe to participate in collection and validation.**

---

## Primary question

> **Is this reward partner ready to fulfil?**

All hierarchy, KPIs, cards, table columns, drawer sections, and primary actions must help answer that question faster.

---

## Primary decisions

| Decision | Operator outcome |
|----------|------------------|
| Onboard | Create a new Reward Partner for fulfilment participation |
| Enable | Mark / keep a partner active for participation |
| Pause / suspend | Stop unsafe or non-ready partners from participating |
| Staff | Ensure capable membership exists for Business Workspace work |
| Correct profile | Keep partner-facing contact and catalog identity usable |
| Escalate context | Move to Queue / Pools / Analytics when readiness alone is insufficient |

---

## Target users

| User | When | Why |
|------|------|-----|
| Fulfilment / rewards operators | Daily / during launch | Maintain partner capacity for live rewards |
| Partner success / ops leads | Go-live and incident response | Confirm staffing and contacts before and during live collection |
| Support (escalation) | When partner-side fulfilment fails | Identify the partner, verify access, decide suspend vs investigate elsewhere |

**Usage cadence:** Operational — opened to act on readiness, not to browse the platform’s institutions.

---

## Information hierarchy

### Primary information

- Partner readiness posture (ready / at risk / not ready — product concept, not a prescribed control)
- Participation status (active / inactive / suspended)
- Staffing signal (has capable staff vs missing staff)
- Partner identity as recognised in fulfilment/catalog (display name, profile linkage)

**Why:** These directly answer the primary question.

### Secondary information

- Contact email, website, logo presence
- Role coverage (owner / manager / staff / viewer presence as readiness signal)
- Profile completeness cues
- Recent readiness-relevant changes (e.g. status or staff updated) when available

**Why:** These explain *why* a partner is or is not ready and support enable/suspend/staff decisions.

### Supporting information

- Organisation identifier and canonical Organisation name
- Timestamps (created / updated)
- Optional consumed health hints from Queue / Pools / Analytics (counts or “needs attention” cues — never system-of-record ownership)

**Why:** Identity and deep investigation context; must not dominate the page.

### Progressive disclosure

1. **Page:** readiness landscape across partners  
2. **Row / summary:** individual partner posture  
3. **Drawer:** readiness story + staff + profile + actions  
4. **Cross-nav:** Organisation tenancy record, Queue cases, Pools inventory, Analytics, Business Workspace guidance  

**Why:** Operators decide from posture first; details and foreign systems appear only when the decision requires them.

---

## Above-the-fold experience

Without prescribing pixels, the first viewport must communicate:

### Must immediately communicate

- This is a **fulfilment partner readiness** console (mission framing in page chrome / title / description).
- How many partners are ready vs blocked / at risk (operational snapshot).
- The primary path to **Create Partner** / onboard.
- A scannable list of partners ordered for operational attention (attention before alphabet, by default philosophy).

### Must immediately draw attention

- Partners that are **not ready** or **suspended** but still relevant
- Partners **missing staff**
- Partners with **incomplete profile** when that blocks ops
- Any consumed “attention” cue tied to partner participation (if shown)

### Must never appear above the fold

- Multi-type Organisation directory browsing (advertiser / government / movrr as primary population)
- Fulfilment case tables (individual redemptions)
- Resource pool stock grids or import tools
- Campaign / advertiser management
- Dense legal / contract administration
- Analytics charts as the hero of the page

**Why:** Above-the-fold leakage of foreign jobs recreates the converged twin-page failure mode.

---

## Operational KPIs

Define product responsibility for metrics — not chart types or calculations.

| KPI / signal | Belongs because… |
|--------------|------------------|
| Partners active | Participation capacity |
| Partners ready (or equivalent readiness count) | Direct answer to primary question at fleet level |
| Partners at risk / not ready | Draws operational attention |
| Partners missing staff | Blocks Business Workspace operation |
| Partners suspended | Safety / quality control visibility |
| Profile incomplete count | Contact/catalog readiness gaps |
| Time-to-go-live (optional maturity metric) | Onboarding effectiveness |

### Explicitly not Partner Operations KPI ownership

| Signal | Correct home |
|--------|----------------|
| Stuck fulfilments / aging cases | Queue / Timeline |
| Pool exhaustion / available codes | Resource Pools |
| Redeem success rate system-wide | Fulfilment Analytics |
| Campaign performance | Advertiser surfaces |

Partner Operations may **consume** a compact attention cue from those systems; it must not become their dashboard.

---

## Cards

Cards are conceptual content regions. Names describe purpose, not required component titles.

### A. Readiness overview card(s)

| | |
|--|--|
| **Why it exists** | Answer fleet-level “are we covered?” before row scanning |
| **Question** | How healthy is partner capacity right now? |
| **Decision** | Whether to onboard, staff, or suspend before diving into individuals |

### B. Attention / exceptions card (optional but recommended)

| | |
|--|--|
| **Why it exists** | Surface partners needing action |
| **Question** | Who is blocking fulfilment readiness? |
| **Decision** | Which partner to open first |

### C. Partners operational list card

| | |
|--|--|
| **Why it exists** | Working inventory of Reward Partners only |
| **Question** | Which partner am I acting on? |
| **Decision** | Open detail; create; filter to a readiness cohort |

### D. Detail regions (inside drawer — conceptual cards)

| Region | Why | Question | Decision |
|--------|-----|----------|----------|
| Readiness summary | Lead with posture | Ready or not, and why? | Enable / suspend / staff |
| Partner profile / contact | Fulfilment-facing identity | Can ops reach / recognise them? | Edit profile fields |
| Staff access | Business Workspace capability | Who can validate/confirm? | Invite / change role |
| Organisation linkage | Tenancy truth without becoming directory | Which Organisation is this? | Navigate to Organisations |
| Related ops (links) | Consumed context | Is the issue inventory or cases? | Cross-nav to Queue / Pools |

**Forbidden card purposes on this page:** “All Organisations”, type mix breakdown as primary story, campaign cards, pool import cards.

---

## Table

### Purpose

Operational roster of **Reward Partners** for readiness decisions — not a multi-type tenancy directory.

### Essential columns

| Column concept | Why essential |
|----------------|---------------|
| Partner display name | Recognition |
| Readiness posture | Primary question per row |
| Participation status | Enable / suspend decision |
| Staffing signal | Go-live / access decision |
| Contact cue (email or “missing”) | Reachability |

### Secondary columns

| Column concept | Why secondary |
|----------------|---------------|
| Profile completeness | Supporting readiness |
| Updated at | Recency of ops change |
| Organisation id (compact) | Support / deep link |
| Created at | Onboarding archaeology |

**Type column:** Not required as a primary column — population is reward partners by definition. Showing “Reward Partner” on every row adds noise unless needed for cross-product consistency in a shared component with different framing.

### Row actions

- Open readiness detail (primary)
- Quick readiness actions when safe (e.g. view staff, edit status) — only if they reinforce readiness
- Navigate to Organisation record (secondary)

### Bulk actions

Allowed only when they are **readiness fleet actions**, for example:

- Suspend selected partners
- Mark inactive
- Export readiness roster for ops

Not allowed as bulk tenancy admin for mixed org types (population is partners only).

### Sorting philosophy

Default sort should favour **operational attention** (not-ready / at-risk / missing staff before alphabetical comfort). Secondary sorts: name, updated, status.

### Filtering philosophy

Filters express readiness cohorts, for example:

- Ready / at risk / not ready
- Status (active / inactive / suspended)
- Missing staff
- Profile incomplete

Do **not** frame filters as Organisation-type directory filters.

### Search philosophy

Search by partner name, contact, and identifiers operators use in incidents. Search is “find this partner to assess readiness,” not “browse all institutions.”

---

## Detail drawer

### Story the drawer must tell

1. **Who** is this partner (fulfilment-facing identity)?  
2. **Are they ready** to fulfil, and what gaps remain?  
3. **Who can operate** in the Business Workspace?  
4. **How do I act** (edit profile, status, staff)?  
5. **Where else** do I go if the problem is tenancy-wide, a case, or inventory?

### What an operator should learn

- Readiness posture and contributing factors
- Participation status
- Staff list and role coverage
- Contact / profile completeness
- Organisation linkage (that this partner is an Organisation)
- Whether investigation should continue outside this page

### Actions that belong

- Edit partner profile fields (contact, website, logo, profile-facing attributes)
- Change participation status
- Invite staff / change roles (partner readiness framing)
- Navigate to Organisation (tenancy)
- Navigate to Queue / Pools / Analytics with partner context when available
- Guidance toward Business Workspace for partner staff day-to-day work (Admin does not replace it)

### Progressive disclosure in the drawer

1. Header: name + readiness + status  
2. Readiness factors (staff / profile / status)  
3. Profile & contact  
4. Staff management  
5. Organisation identity (supporting)  
6. Related operational links  

### How it must differ from Organisations

| Partner Operations drawer | Organisations drawer |
|---------------------------|----------------------|
| Leads with **readiness** | Leads with **identity & type** |
| Staff framed as **fulfilment access** | Membership framed as **tenancy administration** |
| Profile is **partner catalog / business face** | Profile appears only as type-specific supporting identity |
| Cross-nav to Queue/Pools is natural | Cross-nav to type console (e.g. Partner Ops) is natural |
| Mission: make them operable | Mission: administer the institution |

Same Organisation id may open on both pages; **the story and leading sections must differ**. See the design rationale document for the full divergence contract.

---

## Empty states

Empty states must be success-oriented and mission-aligned.

| State | Communication |
|-------|----------------|
| No partners yet | Fulfilment needs Reward Partners — create the first partner to enable collection/validation capacity |
| No partners match filters | No partners in this readiness cohort — adjust filters or review active partners |
| Partner missing staff | This partner cannot operate until staff are invited |
| Profile incomplete | Add contact/profile so ops and catalog can recognise the partner |

Never imply “no Organisations exist on the platform” as the Partner Operations empty story.

---

## Cross navigation

| Destination | Intent | Why |
|-------------|--------|-----|
| **Organisations** | View / administer tenancy identity for this partner Organisation | Partner Ops consumes Organisation; tenancy edits beyond readiness belong there |
| **Fulfilment Queue** | Investigate cases involving this partner | Readiness ≠ case resolution |
| **Resource Pools** | Inventory affecting partner-capable rewards | Capacity inventory is not partner roster |
| **Analytics** | Performance context | Measurement home is Analytics |
| **Business Workspace** | Partner staff daily validate/confirm | Admin enables; partners operate there |

Cross-nav must feel like **handoffs between jobs**, not duplicate homes for the same job.

---

## Success criteria

The page fulfils its mission when:

1. A new operator can state the page mission after one glance at the first viewport.  
2. The primary question “ready to fulfil?” is answerable per partner without opening Organisations.  
3. Create Partner, staff, status, and profile actions are obviously readiness tools.  
4. Non-partner org types never appear as primary population.  
5. Queue / Pools / Analytics are reachable but not replicated.  
6. Side-by-side with Organisations, the two pages do not feel interchangeable.

---

## Design invariants (Partner Operations)

These must remain true for this page unless this specification and, where needed, the Product Constitution are formally revised.

1. Partner Operations must always feel like an **operational command centre** for Reward Partner readiness.  
2. Primary population is **Reward Partners only**.  
3. **Readiness is first-class**; Organisation type is not the organising idea of the list.  
4. **Create Partner** is the primary create narrative.  
5. The drawer leads with **readiness**, then profile and staff, then Organisation linkage.  
6. Queue, Pools, Analytics, and Business Workspace are **handoffs**, not embedded full jobs.  
7. Every screen element should reinforce: *Is this reward partner ready to fulfil?*  
8. If a future design makes this page interchangeable with Organisations, it violates this specification.

Shared cross-page invariants and the interchangeability test are recorded in `docs/design/partner-operations-vs-organisations-design-rationale.md`.

---

## Mapping to Product Constitution

| Design topic | Constitution anchor |
|--------------|---------------------|
| Mission & primary question | §2.1 Purpose/Mission; one-sentence contract for Partner Operations |
| Users & decisions | §2.1 users/workflows; §6 Partner Operations mental model |
| KPI ownership | §2.1 KPIs; §4 responsibility matrix |
| Drawer & boundaries | §2.1 ownership; §5 “What Partner Operations is NOT” |
| Cross-nav | §4 Neither/Both; Product Decision Framework |
| Non-negotiables | Product Invariants |

---

## Document control

| Field | Value |
|-------|-------|
| Title | Partner Operations — Enterprise UI/UX Design Specification |
| Location | `docs/design/partner-operations-uiux-specification.md` |
| Product authority | `docs/product/partner-operations-and-organisations.md` |
| Scope | Information architecture and UX communication design for Partner Operations — not visual mockups or code |
| Next authorised step | Implementation planning and UI build that **conform** to this contract and the Product Constitution |
