# Organisations — Enterprise UI/UX Design Specification

**Audience:** product designers, engineers, product managers, QA, and operations leads implementing this Admin page  
**Status:** Canonical implementation contract for Organisations  
**Authority:** Subordinate to the Product Constitution — must never redefine product responsibilities  
**Product constitution:** `docs/product/partner-operations-and-organisations.md`  
**Companion specs:** `docs/design/partner-operations-uiux-specification.md` · `docs/design/partner-operations-vs-organisations-design-rationale.md`  
**Related:** `docs/product/reward-fulfilment-engine.md`

This document defines **how Organisations must communicate its unique product mission**.  
It does **not** prescribe pixels, components, frameworks, visual tokens, or code.

**Design authority rule:** If a proposed UI makes Organisations feel interchangeable with Partner Operations, or relocates a capability against the Product Decision Framework, the design is invalid until revised — or until the Product Constitution is formally updated first.

---

## How to use this document

| Role | Use this document to… |
|------|------------------------|
| Designer | Structure hierarchy, drawers, empty states, and navigation so directory/tenancy mission is obvious |
| Engineer | Implement information architecture and workflows without inventing product meaning |
| Product | Review designs against mission, primary question, and design invariants |
| QA | Validate that the page answers its primary question and never absorbs foreign jobs |

**Implementation constraint:** A designer or engineer should be able to build Organisations from this specification **without making new product ownership decisions**. Ambiguity of ownership is resolved only by the Product Constitution. Divergence rationale vs Partner Operations lives in the companion rationale document.

---

## Design philosophy (this page)

Design must communicate product responsibility: **platform identity, institution directory, membership, and tenancy administration**.

| Principle | Implication for Organisations |
|-----------|-------------------------------|
| Mission before layout | Every region advances “who is the institution?” |
| Decision support over data density | Prefer signals that change find / classify / status / membership decisions |
| Context before detail | Directory → row → identity & membership drawer → type-specific consoles |
| Platform directory | Feels like tenancy administration, not a fulfilment command centre |
| Reuse components, not meaning | Shared primitives with Partner Operations are fine; identical framing is not |

**Forbidden pattern:** An Organisations page that is Partner Operations with a wider type filter and the same readiness hierarchy, copy, KPIs, and drawer story.

---

## Page mission

**Provide a trustworthy platform directory of institutions — identity, type, status, and membership — across all Organisation types.**

---

## Primary question

> **Who is the institution on MOVRR?**

All hierarchy, KPIs, cards, table columns, drawer sections, and primary actions must help answer that question — and administer the answer — without becoming a fulfilment console.

---

## Primary decisions

| Decision | Administrator outcome |
|----------|------------------------|
| Find | Locate the correct Organisation among types |
| Classify | Confirm / assign Organisation type |
| Administer status | Active / inactive / suspended at tenancy level |
| Administer membership | Who belongs to this institution, with which role |
| Provision | Create Organisation of the appropriate type |
| Route | Send specialised work to the correct operating console (e.g. Partner Operations for reward partners) |

---

## Target users

| User | When | Why |
|------|------|-----|
| Platform / Admin administrators | Ongoing tenancy hygiene | Maintain the institution map |
| Identity / access admins | Access changes | Membership and roles as platform concern |
| Product / ops expanding beyond partners | New type provisioning | Create and inspect non-partner tenants |
| Support (tenancy questions) | “Which org is this user in?” | Cross-type identity lookup |

**Usage cadence:** Administrative / directory — opened to find and administer institutions, not to run fulfilment readiness as the primary job.

---

## Information hierarchy

### Primary information

- Organisation name (canonical identity)
- Organisation type
- Platform status
- Membership summary (member count / has members)

**Why:** These answer who the institution is and whether the tenant is in good standing.

### Secondary information

- Created / updated timestamps
- Type-specific identity hints (e.g. linked partner profile exists — as identification only)
- Member role distribution summary

**Why:** Aid administration and routing without turning the page into Partner Operations.

### Supporting information

- Organisation id
- Links to type-specific consoles
- Optional audit entry points when available

**Why:** Precision and handoff; must not dominate.

### Progressive disclosure

1. **Directory:** who exists, by type  
2. **Row:** identity snapshot  
3. **Drawer:** identity + membership administration  
4. **Handoff:** Partner Operations / Advertiser surfaces / future type consoles for operational missions  

**Why:** Directory first; specialised ops elsewhere.

---

## Above-the-fold experience

Without prescribing pixels, the first viewport must communicate:

### Must immediately communicate

- This is the **platform Organisation directory** (tenancy / identity framing).
- Institutions of **multiple types** are in scope.
- How to **find** and **create** Organisations (create framing is institutional, not “Create Partner” as the only story).
- Type distribution or type filter affordance so multi-type reality is visible.

### Must immediately draw attention

- Suspended / inactive tenants needing admin attention (tenancy hygiene)
- Organisations with **no members** where membership is expected
- Ambiguous or incomplete identity records
- Clear path to filter by type (including non-partner types)

### Must never appear above the fold

- Partner readiness KPI hero (ready / not ready fleet for fulfilment)
- Validation / collection readiness as the page mission
- Fulfilment queue snippets as primary content
- Resource pool stock as primary content
- “Create Partner” as the sole primary create narrative if the page claims multi-type directory responsibility
- Partner-only vocabulary that erases other types

**Why:** Partner-first chrome on Organisations recreates convergence.

---

## Operational KPIs

Define product responsibility for metrics — not chart types or calculations.

| KPI / signal | Belongs because… |
|--------------|------------------|
| Organisations total | Directory scale |
| Count by type | Multi-type reality and growth |
| Active / inactive / suspended tenants | Platform hygiene |
| Orgs without members | Access / tenancy gaps |
| Recently created | Provisioning activity |

### Explicitly not Organisations KPI ownership

| Signal | Correct home |
|--------|----------------|
| Partner readiness / missing staff for fulfilment | Partner Operations |
| Stuck fulfilments | Queue / Timeline |
| Pool stock | Resource Pools |
| Campaign metrics | Advertiser surfaces |

---

## Cards

Cards are conceptual content regions. Names describe purpose, not required component titles.

### A. Directory overview card(s)

| | |
|--|--|
| **Why it exists** | Establish platform scale and type mix |
| **Question** | What institutions exist? |
| **Decision** | Where to focus directory administration |

### B. Type breakdown / type filter card (conceptual)

| | |
|--|--|
| **Why it exists** | Make multi-type tenancy visible |
| **Question** | Which type am I administering? |
| **Decision** | Filter directory; choose correct create path |

### C. All Organisations list card

| | |
|--|--|
| **Why it exists** | Canonical directory working set |
| **Question** | Which institution am I opening? |
| **Decision** | Inspect identity; manage membership; hand off to type console |

### D. Detail regions (inside drawer — conceptual cards)

| Region | Why | Question | Decision |
|--------|-----|----------|----------|
| Identity | Canonical who/what | Name, type, status? | Edit identity / status |
| Membership | Tenancy access | Who belongs? | Add / change / revoke members |
| Type-specific identity hint | Recognition only | Is a partner profile linked? | Open Partner Operations if readiness work |
| Navigation to type console | Prevent ops dumping | Where does specialised work go? | Handoff |

**Forbidden card purposes:** Fulfilment readiness overview as page hero; partner-only roster framing; queue attention as primary Organisations story.

---

## Table

### Purpose

Platform directory of **all Organisation types** for identity and membership administration.

### Essential columns

| Column concept | Why essential |
|----------------|---------------|
| Organisation name | Identity |
| Type | Classification — critical differentiator from Partner Operations |
| Platform status | Tenancy standing |
| Membership signal (count / none) | Access administration |

### Secondary columns

| Column concept | Why secondary |
|----------------|---------------|
| Created at | Provisioning history |
| Updated at | Recency |
| Organisation id | Support precision |
| Type-specific badge/hint | Optional identification |

**Readiness posture column:** Must not be a primary Organisations column. If shown at all for reward partners, it is a supporting handoff cue — not the directory’s organising idea.

### Row actions

- Open Organisation detail (primary)
- Manage membership
- Navigate to type-specific console when applicable (Partner Operations for reward partners)
- Edit identity / status when appropriate

### Bulk actions

Allowed for **tenancy administration**, for example:

- Export directory
- Bulk status changes with care
- Type-filtered exports

Not framed as bulk partner readiness campaigns (that language belongs in Partner Operations).

### Sorting philosophy

Default: **findability** — typically name or recently updated — with type and status as first-class sorts. Not “not-ready partners first” as the default world-view.

### Filtering philosophy

Filters express **directory cohorts**:

- Type (reward partner / advertiser / government / movrr / future types)
- Platform status
- Has members / no members
- Created date ranges

Readiness filters may exist only as advanced handoff aids for reward partners — never as the default filter language of the page.

### Search philosophy

Search by institution name, id, and membership-related identifiers. Search is “find this tenant,” not “find who can validate today.”

---

## Detail drawer

### Story the drawer must tell

1. **Who** is this institution?  
2. **What type** are they?  
3. **What is their platform status?**  
4. **Who are the members?**  
5. **Where should specialised operational work happen?**

### What an administrator should learn

- Canonical identity and type
- Platform status and timestamps
- Full membership list and roles
- Whether a type-specific profile/console applies
- Clear next step for non-directory work

### Actions that belong

- Edit Organisation identity (canonical name) and platform status
- Add / change / revoke membership and roles (tenancy framing)
- Create-adjacent administration for this tenant
- Navigate to Partner Operations when type is reward partner and the job is readiness
- Navigate to other type consoles when they exist

### Progressive disclosure in the drawer

1. Header: name + type + status  
2. Identity fields  
3. Membership administration  
4. Type-specific supporting identity (if any)  
5. Handoff to specialised consoles  

### How it must differ from Partner Operations

| Organisations drawer | Partner Operations drawer |
|----------------------|---------------------------|
| Leads with **type + identity** | Leads with **readiness** |
| Membership = **tenancy RBAC** | Staff = **fulfilment access readiness** |
| Create/edit framed as **Organisation** | Create/edit framed as **Reward Partner** |
| Handoff *to* Partner Ops for readiness | Handoff *to* Organisations for tenancy |
| Comfortable with non-partner types | Does not host non-partner types |

Same Organisation id may open on both pages; **the story and leading sections must differ**. See the design rationale document for the full divergence contract.

---

## Empty states

Empty states must be success-oriented and mission-aligned.

| State | Communication |
|-------|----------------|
| No organisations yet | Provision the first platform institution to establish tenancy |
| No organisations match filters | No tenants in this type/status cohort — adjust filters |
| Organisation has no members | Add members so people can act for this institution |
| Type has no specialised console yet | Identity lives here; operational tools will attach later without changing tenancy |

Never imply that empty Organisations means “no fulfilment partners” as the only narrative — partners are one type among others.

---

## Cross navigation

| Destination | Intent | Why |
|-------------|--------|-----|
| **Partner Operations** | Readiness work for reward partners | Directory does not own fulfilment readiness |
| **Fulfilment Queue** | Rare; only when investigating identity↔case linkage | Cases are not directory work |
| **Resource Pools** | Rare; inventory is not tenancy | Keep ownership clear |
| **Analytics** | Rare; measurement elsewhere | Avoid dashboard creep |
| **Business Workspace** | Not an Admin replacement; may document that partner staff work there | Partners operate outside Admin |
| **Advertiser surfaces** | When type is advertiser | Type-specific ops |

Default handoff for reward-partner operational work: **Partner Operations**, not Queue.

---

## Success criteria

The page fulfils its mission when:

1. A new administrator sees a **multi-type institution directory**, not a partner ops console.  
2. The primary question “who is the institution?” is answerable without readiness vocabulary.  
3. Type is first-class in list and detail.  
4. Membership administration feels like tenancy access, not partner go-live alone.  
5. Reward partners are visible here *as Organisations*, with readiness work handed to Partner Operations.  
6. Side-by-side with Partner Operations, the pages are not interchangeable.

---

## Design invariants (Organisations)

These must remain true for this page unless this specification and, where needed, the Product Constitution are formally revised.

1. Organisations must always feel like a **platform institution directory**.  
2. Primary population is **all Organisation types**.  
3. **Type is first-class** in list and detail; readiness is not the organising idea.  
4. **Create Organisation (with type)** is the primary create narrative — not Create Partner alone.  
5. The drawer leads with **identity and type**, then membership, then type-console handoff.  
6. Partner Operations, Advertiser surfaces, Queue, and Pools are **handoffs**, not embedded full jobs.  
7. Every screen element should reinforce: *Who is the institution on MOVRR?*  
8. Future organisation types must integrate into this directory pattern without redesigning the page’s information architecture.  
9. If a future design makes this page interchangeable with Partner Operations, it violates this specification.

Shared cross-page invariants and the interchangeability test are recorded in `docs/design/partner-operations-vs-organisations-design-rationale.md`.

---

## Mapping to Product Constitution

| Design topic | Constitution anchor |
|--------------|---------------------|
| Mission & primary question | §2.2 Purpose/Mission; one-sentence contract for Organisations |
| Users & decisions | §2.2 users/workflows; §6 Organisations mental model |
| KPI ownership | §2.2 KPIs; §4 responsibility matrix |
| Drawer & boundaries | §2.2 ownership; §5 “What Organisations is NOT” |
| Cross-nav | §4 Neither/Both; Product Decision Framework |
| Future types | §3, §8 |
| Non-negotiables | Product Invariants |

---

## Document control

| Field | Value |
|-------|-------|
| Title | Organisations — Enterprise UI/UX Design Specification |
| Location | `docs/design/organisations-uiux-specification.md` |
| Product authority | `docs/product/partner-operations-and-organisations.md` |
| Scope | Information architecture and UX communication design for Organisations — not visual mockups or code |
| Next authorised step | Implementation planning and UI build that **conform** to this contract and the Product Constitution |
