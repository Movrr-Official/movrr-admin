# Partner Operations & Organisations — QA Test Matrix

**Surfaces:** Partner Operations (`/fulfilment/partners`), Organisations (`/fulfilment/organisations`)  
**Purpose:** Manual verification for staged production rollout  
**Related:** `docs/release/partner-operations-production-readiness.md`  

**Instructions:** Execute in staging with a dashboard admin that has Platform organisation capabilities. Fill **Actual Result**, **Pass / Fail**, and **Notes** for each row. Do not change product behaviour to “make tests pass.”

**Sign-off**

| Role | Name | Date | Result |
|------|------|------|--------|
| QA | | | |
| Engineering | | | |
| Product (optional) | | | |

---

## A. Partner Operations

| ID | Scenario | Steps | Expected Result | Actual Result | Pass / Fail | Notes |
|----|----------|-------|-----------------|---------------|-------------|-------|
| PO-01 | Create partner | Fulfilment → Partner Operations → Create Partner → complete wizard | Partner created; redirect to Partner Ops with drawer/deep link; appears in roster as Reward Partner | | | |
| PO-02 | Update partner profile | Open partner drawer → Edit → change contact/website → Save | Toast success; contact fields updated; readiness may move Ready↔At risk | | | |
| PO-03 | Suspend partner | Drawer Edit → status Suspended → Save **or** bulk Suspend with confirm | Status Suspended; readiness Not ready; confirmation shown for bulk | | | |
| PO-04 | Activate partner | Suspended partner → set Active (drawer or bulk confirm) | Status Active; readiness recalculates from staff/profile | | | |
| PO-05 | Mark inactive | Active partner → Inactive (drawer or bulk confirm) | Status Inactive; readiness Not ready | | | |
| PO-06 | Search | Type partner name / email / id fragment | List filters to matches; no full-page reload | | | |
| PO-07 | Filter readiness | Select Ready / At risk / Not ready | Only matching readiness cohort shown | | | |
| PO-08 | Filter staffing / profile | Missing staff; Incomplete profile | Cohort matches assessment rules | | | |
| PO-09 | Sorting | Clear filters; view default order | Not ready / at risk appear before ready (attention-first) | | | |
| PO-10 | Bulk suspend | Select ≥2 → Suspend → confirm | All selected suspended; selection cleared; toast | | | |
| PO-11 | Bulk export | Select rows → Export CSV | CSV downloads with id/name/status/readiness | | | |
| PO-12 | Bulk cancel | Select → Suspend → Cancel on dialog | No status change | | | |
| PO-13 | Drawer story | Open reward partner | Leads with Fulfilment readiness; staff framed as access; Related work links present | | | |
| PO-14 | Deep link | Open `/fulfilment/partners?id=<uuid>` | Drawer opens for that partner | | | |
| PO-15 | Close deep link | Close drawer | `id` removed from URL; list remains | | | |
| PO-16 | Permissions denied | Call update without capability (or revoke server-side) | Error toast / failure; no silent success | | | |
| PO-17 | Loading | Throttle network; refresh page | KPI skeletons / loading indicator visible | | | |
| PO-18 | Errors | Break organisations API temporarily | Error state + Retry recovers when API restored | | | |
| PO-19 | Empty (no partners) | Empty env or filter impossible | Mission empty copy + Create Partner CTA | | | |
| PO-20 | Empty (filters) | Filters with no matches | “No partners match these filters” copy | | | |
| PO-21 | Needs attention | Have at-risk/not-ready partners | Attention card lists them; click opens drawer | | | |
| PO-22 | Cross-nav Queue | Drawer → Fulfilment Queue | Navigates to Queue (handoff) | | | |
| PO-23 | Cross-nav Organisations | Drawer → Organisation directory | Opens Organisations with same id when linked | | | |
| PO-24 | Keyboard | Tab through KPIs, filters, table, bulk, drawer | Logical order; visible focus; Esc closes dialogs/drawer per primitive | | | |
| PO-25 | Screen reader smoke | VO/NVDA: open drawer, read readiness | Title/description announced; table caption available | | | |

---

## B. Organisations

| ID | Scenario | Steps | Expected Result | Actual Result | Pass / Fail | Notes |
|----|----------|-------|-----------------|---------------|-------------|-------|
| ORG-01 | Create Organisation | Create Organisation → name + type → submit | Appears in directory with correct type; drawer can open | | | |
| ORG-02 | Create reward_partner type | Type = Reward Partner | Org created; dual-write profile expected; Partner readiness handoff available | | | |
| ORG-03 | Create advertiser | Type = Advertiser | Listed as Advertiser; no partner readiness CTA required | | | |
| ORG-04 | Create government | Type = Government | Listed correctly | | | |
| ORG-05 | Create movrr | Type = MOVRR | Listed correctly | | | |
| ORG-06 | Membership add | Drawer → invite user id + role | Member appears; toast success | | | |
| ORG-07 | Membership role change | Change member role | Role updates via API; toast | | | |
| ORG-08 | Organisation status | Edit → Suspended / Active / Inactive | Platform status updates; directory badge updates | | | |
| ORG-09 | Search | Search by name or id | Directory filters | | | |
| ORG-10 | Filter type | Filter each type | Only that type shown | | | |
| ORG-11 | Filter membership | No members | Only orgs without members | | | |
| ORG-12 | Navigation handoff | Reward partner row → Partner readiness | Opens Partner Operations deep link for that id | | | |
| ORG-13 | Drawer story | Open any org | Leads with identity/type; Membership framing; Related work handoffs | | | |
| ORG-14 | Deep link | `/fulfilment/organisations?id=<uuid>` | Drawer opens | | | |
| ORG-15 | Interchangeability | Side-by-side with Partner Ops | Pages do not feel like the same job with a filter | | | |
| ORG-16 | Loading / error / empty | Same patterns as PO-17–PO-20 | Distinct directory empty copy; Create Organisation CTA | | | |
| ORG-17 | Permissions | Unauthorized mutate | Failure visible; no silent write | | | |
| ORG-18 | Keyboard / SR | Tab + VO/NVDA on directory + dialog | Accessible create dialog; table caption | | | |

---

## C. Cross-cutting / launch gates

| ID | Scenario | Expected Result | Actual Result | Pass / Fail | Notes |
|----|----------|-----------------|---------------|-------------|-------|
| X-01 | Chrome latest | Full matrix critical paths | | | |
| X-02 | Edge latest | Critical paths | | | |
| X-03 | Firefox latest | Critical paths + drawer | | | |
| X-04 | Safari latest | Critical paths + drawer | | | |
| X-05 | Mobile viewport | Usable filters/table/drawer | | | |
| X-06 | Reduced motion OS setting | No jarring slide animations | | | |
| X-07 | Analytics events | Create/update/filter/search/bulk emit in Vercel Analytics | | | |
| X-08 | No product drift | Missions still match Product Constitution one-liners | | | |
| X-09 | No duplicate systems | Network tab shows only Platform org/staff APIs | | | |

---

## Defect log

| ID | Severity | Surface | Description | Status |
|----|----------|---------|-------------|--------|
| | | | | |

---

## Exit criteria

Staged production is approved when:

- All **Critical** scenarios (create, status, membership, deep links, errors, interchangeability) are **Pass**
- No open Sev-1 / Sev-2 defects
- Analytics spot-check confirms events
- Engineering + QA sign-off rows completed above
