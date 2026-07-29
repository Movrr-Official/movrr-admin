# Partner Operations vs Organisations — Design Rationale

**Audience:** product, design, and engineering reviewing whether the two Admin pages remain correctly differentiated  
**Status:** Companion rationale — not a page implementation contract  
**Product constitution:** `docs/product/partner-operations-and-organisations.md`  
**Implementation contracts:**  
- `docs/design/partner-operations-uiux-specification.md`  
- `docs/design/organisations-uiux-specification.md`

This short document explains **why the two pages intentionally diverge** despite sharing the same Organisation domain model. Page-level IA, KPIs, tables, and drawers are specified in the implementation contracts above — not here.

---

## Why the same domain is not the same product job

| Domain truth | Product consequence |
|--------------|---------------------|
| Organisation is the platform tenancy root | There must be a directory that administers institutions of every type |
| A Reward Partner is always an Organisation | Partner records appear in that directory *and* in a specialised fulfilment surface |
| Fulfilment needs partner readiness | Operators need a command centre that answers “ready to fulfil?” without browsing advertisers or government tenants |

**Conclusion:** Sharing an aggregate justifies shared *components*. It does **not** justify shared *product meaning*, identical hierarchy, or interchangeable screens.

The failure mode to prevent: two pages that differ only by a type filter and a title.

---

## One-sentence contracts

- **Organisations:** *Who is the institution on MOVRR?*  
- **Partner Operations:** *Is this reward partner ready to fulfil?*

If a design cannot be traced to one of these questions, it does not belong on that page.

---

## Comparative summary

| UI area | Partner Operations | Organisations |
|---------|--------------------|---------------|
| **Mission** | Make Reward Partners fulfilment-ready | Administer platform institutions |
| **Primary question** | Is this reward partner ready to fulfil? | Who is the institution on MOVRR? |
| **Primary user** | Fulfilment / partner ops | Platform / identity administrators |
| **Primary decisions** | Onboard, staff, enable/suspend, correct partner profile | Find, classify, status, membership, route to consoles |
| **KPIs** | Ready / at risk / missing staff / suspended partners | Totals by type / tenant status / membership gaps |
| **Cards** | Readiness overview + attention + partner roster | Directory overview + type mix + all-orgs roster |
| **Tables** | Reward partners only; readiness columns first | All types; type + identity columns first |
| **Drawer** | Readiness → profile → staff → handoffs | Identity → membership → type handoffs |
| **Actions** | Create Partner; readiness edits; staff for fulfilment access | Create Organisation (by type); identity/status; membership |
| **Search** | Find a partner to assess readiness | Find a tenant across the platform |
| **Filters** | Readiness cohorts + partner status | Type + tenancy status + membership |
| **Navigation** | Out to Org / Queue / Pools / Analytics / Workspace | Out to Partner Ops / type consoles |
| **Mental model** | Operational command for partner capacity | Platform directory of institutions |
| **Success** | Partners can operate safely | Tenants are correct, findable, and administered |

---

## What may be shared vs what must diverge

| Aspect | Shared (allowed) | Divergent (required) |
|--------|------------------|----------------------|
| Domain object | Organisation (+ partner profile when type applies) | Job to be done |
| Components | Table, drawer, badges, form primitives | Leading metrics, column priority, copy, empty states, CTA framing |
| Status values | May reuse active / inactive / suspended | Framing: participation readiness vs tenancy hygiene |
| Membership UI | May reuse controls | Framing: staff readiness vs tenancy administration |
| Create flow | May share infrastructure | Entry narrative and default type behaviour per page mission |

**Rule:** Reuse components. Do not reuse product meaning unless the Product Constitution explicitly defines intentional dual ownership.

---

## Enterprise UX principles (both pages)

1. One primary responsibility per page.  
2. Information hierarchy before visual hierarchy.  
3. Progressive disclosure.  
4. Operational clarity.  
5. Decision support over data density.  
6. Context before detail.  
7. Actions close to decisions.  
8. No duplicate mental models.  
9. No duplicate workflows unless explicitly intentional in the Product Constitution.  
10. Reuse components; do not reuse product meaning.  
11. Future organisation types integrate without redesigning Organisations’ directory IA; Partner Operations stays reward-partner fulfilment.  
12. Handoffs are first-class.  
13. Empty states teach the mission.  
14. Above-the-fold must pass the interchangeability test.  
15. Conform to the Product Decision Framework for any new capability.

---

## Design invariants (cross-page)

1. Partner Operations must always feel like an operational command centre for Reward Partner readiness.  
2. Organisations must always feel like a platform institution directory.  
3. Operators should immediately know which page they need from mission framing alone.  
4. The same Organisation should feel different in operational versus tenancy context.  
5. Visual and component reuse is encouraged; responsibility reuse is not (unless the Product Constitution says otherwise).  
6. Every screen element should reinforce that page’s primary mission.  
7. Partner Operations’ primary population is Reward Partners only; Organisations’ is all Organisation types.  
8. Type is first-class on Organisations; readiness is first-class on Partner Operations.  
9. Create Partner is the primary create narrative on Partner Operations; Create Organisation (with type) is primary on Organisations.  
10. Drawers may share structure primitives but must not share the same leading story.  
11. Foreign systems (Queue, Pools, Analytics, Business Workspace, Advertiser surfaces) are handoffs, not embedded full jobs.  
12. **If a future design causes the two pages to feel interchangeable, it violates the design contracts.**  
13. Any design that violates these invariants requires the relevant page specification (and, if ownership shifts, the Product Constitution) to be updated before implementation proceeds.

---

## Interchangeability test

Before shipping or approving a design change to either page, ask:

> If we swapped the page titles and removed the route, would an operator still know which job they were doing?

- **Fail:** Yes, or only after reading a type filter.  
- **Pass:** No — readiness command centre vs institution directory remains obvious from hierarchy, KPIs, columns, CTAs, and drawer lead story.

---

## Document control

| Field | Value |
|-------|-------|
| Title | Partner Operations vs Organisations — Design Rationale |
| Location | `docs/design/partner-operations-vs-organisations-design-rationale.md` |
| Maintains | Divergence rationale, comparison, shared principles and invariants |
| Does not replace | Page implementation contracts or the Product Constitution |
