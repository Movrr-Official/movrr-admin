# Partner Operations & Organisations — Implementation Verification Report

**Date:** 2026-07-29  
**Scope:** Admin Fulfilment pages — Partner Operations & Organisations  
**Authoritative contracts:**  
- `docs/product/partner-operations-and-organisations.md`  
- `docs/design/partner-operations-uiux-specification.md`  
- `docs/design/organisations-uiux-specification.md`  
- `docs/design/partner-operations-vs-organisations-design-rationale.md`

---

## Summary

Partner Operations and Organisations have been redesigned in-place to express distinct product missions while preserving the shared Organisation domain model, Platform API clients, membership/RBAC, and create/update infrastructure.

| Page | Mission expressed |
|------|-------------------|
| Partner Operations | Operational command centre — *Is this reward partner ready to fulfil?* |
| Organisations | Platform directory — *Who is the institution on MOVRR?* |

Typecheck: **pass** (`npm run typecheck`)  
Unit tests (readiness + authorisation): **pass** (20 tests)

---

## Implemented features

### Partner Operations

- Readiness KPI grid (ready / at risk / not ready / missing staff / active / suspended / profile incomplete / total)
- Needs-attention exceptions list
- Reward-partner-only roster with readiness, status, staffing, contact columns
- Search (name, contact, id)
- Filters: readiness, status, staffing, profile completeness
- Default sort by operational attention (not ready → at risk → ready)
- Bulk suspend / inactive / activate / CSV export
- Create Partner primary CTA (existing create flow)
- Drawer `mode="partner"`: readiness-first story, staff access framing, related handoffs (Organisations, Queue, Pools, Analytics, Business Workspace)
- Mission-aligned empty / error / loading / retry states
- Deep link `?id=` preserved via `useDrawerQueryId`

### Organisations

- Directory KPI grid (total, counts by type, active, suspended, without members)
- Multi-type directory table (name, type, status, members, partner-readiness handoff action)
- Search by name/id
- Filters: type, status, membership
- Default sort by findability (name)
- **Create Organisation** dialog with type selection (reward_partner / advertiser / government / movrr) — no longer Create Partner as sole CTA
- Drawer `mode="organisation"`: identity/type-first story, membership framing, handoff to Partner Operations for reward partners
- Mission-aligned empty / error / loading / retry states
- Deep link `?id=` preserved

### Shared infrastructure (reused, not forked)

- `useOrganisations` / `useOrganisation` / staff / create / update hooks
- Platform `/api/v1/organisations*` endpoints and authz (`rewards.manage`, `staff.manage`)
- `PartnerStaffPanel` for membership invite/role change
- Organisation dual-write to `reward_partner` on reward partner create/update

### List enrichment (supports approved KPIs without parallel systems)

- `listOrganisations` / `findOrganisationById` now include `memberCount`, `activeMemberCount`, and partner profiles for reward partners
- Presentation helpers: `assessPartnerReadiness`, fleet/directory KPI computers

---

## Architectural decisions

1. **Same aggregate, different pages** — No second partner entity; readiness is a presentation assessment over Organisation + membership + profile.
2. **Drawer specialization via `mode`** — One drawer component, divergent leading story and cross-nav (design rationale: reuse components, not product meaning).
3. **Client-side filter/search/sort** — Specs require these behaviours; dataset is admin-scale; no new list query API invented.
4. **Bulk status uses existing PATCH update** — No new bulk endpoint.
5. **Business Workspace link** — Uses `https://app.movrr.nl` (existing product app URL convention in `lib/env.ts`).

---

## Reusable components introduced

| Component | Path |
|-----------|------|
| OpsKpiGrid | `components/ops/OpsKpiGrid.tsx` |
| OpsFilterToolbar | `components/ops/OpsFilterToolbar.tsx` |
| OpsBulkActionBar | `components/ops/OpsBulkActionBar.tsx` |
| OpsEmptyState / OpsErrorState | `components/ops/OpsEmptyState.tsx` |
| PartnerOperationsTable | `components/rewards/partners/PartnerOperationsTable.tsx` |
| OrganisationsDirectoryTable | `components/rewards/organisations/OrganisationsDirectoryTable.tsx` |
| CreateOrganisationDialog | `components/rewards/organisations/CreateOrganisationDialog.tsx` |

Presentation: `partnerReadiness.ts`, `organisationDirectory.ts`

---

## Behavioural compliance

| Spec area | Status |
|-----------|--------|
| Distinct missions / mental models | Implemented |
| Partner readiness KPIs & attention | Implemented |
| Org directory KPIs & type-first table | Implemented |
| Differentiated drawers | Implemented |
| Search / filter philosophies | Implemented |
| Bulk readiness fleet actions (Partner Ops) | Implemented |
| Create Partner vs Create Organisation | Implemented |
| Cross-navigation handoffs | Implemented |
| Empty / loading / error / retry | Implemented |
| Deep linking | Preserved |
| No parallel Organisation/RBAC systems | Preserved |

---

## Accessibility compliance

- Semantic tables, labels on search/filters, `role="status"` / `role="alert"` on empty/error
- Checkbox select-all with indeterminate state and aria-labels
- Keyboard-focusable controls via existing Button/Input/Select/Dialog/Drawer primitives
- Status communicated with text labels + badges (not colour alone)
- WCAG 2.2 AA full audit suite / axe CI not added in this pass (see limitations)

---

## Performance considerations

- Single organisations list fetch per page; membership/profile enrichment batched in store list query (not N+1 from UI)
- Memoised KPI / filter / attention computations
- No virtualisation (admin list volume; revisit if directories grow large)
- No optimistic updates (not approved in design contracts; mutations wait on Platform API)

---

## Testing completed

- `partnerReadiness.test.ts` — readiness assessment, fleet/directory KPIs, sort rank
- Existing `authorisation.test.ts` — still passing
- `tsc --noEmit` — clean

Not yet automated in this pass: full component/integration/a11y/responsive suites for the new page clients (manual QA recommended before staged rollout).

---

## Known limitations / ambiguities (not invented)

1. **Functional Specification file** — Referenced as approved in the implementation brief, but **not present** in `docs/`. Implementation followed Product Constitution + UI/UX Design Specs + Design Rationale only.
2. **Member removal / revoke** — Domain has `revoked` status, but Platform Admin API exposes add staff + role update only. UI does not invent revoke.
3. **Archive** — Not in Organisation status model (`active` / `inactive` / `suspended` only). Not implemented.
4. **Optimistic updates / advanced keyboard matrix / virtualisation** — Mentioned in the implementation brief generically; not specified with concrete behaviour in the approved design contracts. Standard mutation + native control keyboard behaviour used.
5. **Dedicated observability events** — Actions use existing toast + Platform API audit path; no second telemetry system invented. Page-level analytics events not specified in design contracts.
6. **Advertiser type console** — Organisations handoff for advertisers points only where surfaces exist; no new advertiser console invented.
7. **Business Workspace deep-link** — Links to app root; partner-context deep routes in movrr-app were not specified for Admin.

---

## Confirmation

Implementation matches the approved Product Constitution and Enterprise UI/UX Design Specifications for the surfaces in scope: the two pages now communicate clearly different missions while sharing the Organisation domain model. Remaining gaps are documented above rather than filled with unauthorised behaviour.

**Recommended next step:** Internal QA against the interchangeability test in `docs/design/partner-operations-vs-organisations-design-rationale.md`, then staged rollout.
