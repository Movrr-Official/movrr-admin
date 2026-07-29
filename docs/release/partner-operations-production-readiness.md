# Partner Operations & Organisations — Production Readiness Report

**Feature surfaces:** `/fulfilment/partners` (Partner Operations), `/fulfilment/organisations` (Organisations)  
**Date:** 2026-07-29  
**Audience:** engineering leads, QA, release managers  
**Contracts honoured:** Product Constitution · Partner Operations UI/UX Spec · Organisations UI/UX Spec · Design Rationale  

---

## Executive Summary

### Overall assessment

The Partner Operations and Organisations Admin surfaces are **ready for staged production rollout** after implementation and a launch-hardening pass (accessibility, destructive confirmations, telemetry, deferred search, table semantics).

Product missions remain distinct and specification-aligned:

| Surface | Operator question answered |
|---------|----------------------------|
| Partner Operations | Is this reward partner ready to fulfil? |
| Organisations | Who is the institution on MOVRR? |

### Go / No-Go recommendation

**GO — staged rollout** (internal QA → limited Admin operators → full Admin).

Not a blanket “unlimited Go” until the QA matrix in `docs/qa/partner-operations-test-matrix.md` is executed and signed off in the target environments.

### Outstanding risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Manual QA matrix not yet executed in staging | Medium | Required gate before full production |
| Automated axe/component a11y suite not in CI | Low–Medium | Manual WCAG checklist in this report + matrix; add CI later |
| Membership revoke not available via Platform API | Low | Documented limitation; no invented revoke UX |
| Functional Specification file absent from repo | Low | Implementation followed Product + Design contracts |
| Client-side filter/sort over full list | Low | Acceptable for Admin scale; monitor list growth |
| Vercel Analytics custom events require project config | Low | Confirm Analytics enabled for Admin deployment |

---

## Architecture Review

| Check | Result |
|-------|--------|
| Organisation aggregate preserved | **Pass** — single `Organisation` domain; partner profile composition unchanged |
| No duplicate partner systems | **Pass** — no parallel partner entity or API client |
| No duplicate RBAC | **Pass** — Platform `rewards.manage` / `staff.manage` unchanged |
| No duplicate membership | **Pass** — `PartnerStaffPanel` + existing staff endpoints |
| Reusable components | **Pass** — `components/ops/*`, shared drawer with `mode` |
| No architectural drift | **Pass** — pages diverge by mission framing, not by forked domain |

List enrichment (`memberCount`, `activeMemberCount`, partner profiles on list) is an approved-read-model extension for readiness/directory KPIs — not a second system of record.

---

## Performance Review

### Findings

| Area | Finding |
|------|---------|
| Query behaviour | One `GET /api/v1/organisations` (typed or all); store batches membership + partner profile enrichment server-side |
| Filtering / sorting / search | Client-side over fetched list; `useDeferredValue` on search input to reduce recompute pressure while typing |
| Memoisation | KPI, attention, and filtered-row memos in both page clients |
| Unnecessary renders | Deferred search + memoised derived data; no redundant list polling |
| Bundle impact | Shared ops primitives; Vercel `track` already in dependency tree via `@vercel/analytics` |
| Loading behaviour | Skeleton KPI grid; table loading status; retryable error states |
| Virtualisation | Not applied (Admin-scale lists). Revisit if org counts exceed ~1–2k visible rows |

### Safe optimisations applied (no behaviour change)

- `useDeferredValue` for search-driven filtering on both pages  
- Destructive/status bulk actions gated behind confirmation dialog (prevents accidental mass mutations; same final API calls)

---

## Security Review

| Check | Result |
|-------|--------|
| RBAC | Mutations still go through Platform API capability checks (`rewards.manage`, `staff.manage`) |
| Permission enforcement | Server remains authoritative; UI does not invent client-side authz bypass |
| Privilege escalation | No elevation paths added; Admin session model unchanged |
| Client/server trust | Status/membership writes only via Platform PATCH/POST |
| Destructive confirmation | Bulk suspend / inactive / activate require `OpsConfirmDialog` confirmation |
| XSS | React text escaping; CSV export uses `JSON.stringify` for fields; no `dangerouslySetInnerHTML` introduced |
| Injection | No raw SQL from UI; IDs passed as path/body params to Platform API |
| Audit coverage | Platform organisation update/create remain server-side sources of truth; Admin ops events via Vercel Analytics + logger |

**Residual:** Fine-grained “hide Create if capability missing” UI gating depends on Admin principal capability exposure in the client session. Server still denies unauthorized calls.

---

## Accessibility Review (WCAG 2.2 AA)

### Implemented / verified in code

| Criterion | Status |
|-----------|--------|
| Keyboard operable controls | Buttons, inputs, selects, checkboxes, dialogs, drawer close use focusable primitives |
| Visible focus | Attention rows and drawer close use `focus-visible:ring`; shared UI focus styles |
| Screen reader labels | Search/filter `aria-label`s; select-all / row checkboxes labelled; KPI `role="group"`; bulk bar region |
| Semantic HTML | Tables with `<caption class="sr-only">`; headings via PageHeader / CardTitle |
| Dialog accessibility | Radix `AlertDialog` for confirmations; Vaul drawer with `DrawerTitle` + `DrawerDescription` (sr-only) |
| Status not colour-only | Readiness/status badges include text labels; reasons as text |
| Reduced motion | Global `prefers-reduced-motion` collapses animations including `animate-slide-up` |
| Loading / errors | `role="status"` / `role="alert"` with retry |

### Manual verification still required

- Full keyboard pass of both pages in Chrome + Safari  
- VoiceOver / NVDA drawer and table traversal  
- Zoom 200% layout check  

These are captured as scenarios in the QA matrix.

### Fixes applied this pass (no product change)

- Drawer description for assistive tech  
- Table captions  
- Stronger focus rings on attention list items  
- Confirm dialog for bulk status changes  

---

## Browser Support

| Browser | Expectation | Notes |
|---------|-------------|-------|
| Chrome (latest) | Supported | Primary Admin browser |
| Edge (latest) | Supported | Chromium parity |
| Firefox (latest) | Supported | Verify drawer focus trap manually |
| Safari (latest) | Supported | Verify date locale strings and drawer gesture |

**Responsive:** Layouts use existing Admin grid/stack patterns (`sm`/`lg` breakpoints). Drawer is right-side on desktop; full-width behaviour follows shared Drawer primitive on smaller viewports.

**Limitation:** Pixel-perfect Safari/Firefox validation was not executed in an automated harness in this pass — required in QA matrix before full Go.

---

## Operational Readiness

| Concern | Status |
|---------|--------|
| Loading | KPI skeletons + table loading indicator |
| Empty | Mission-aligned empty copy + create CTAs |
| Error | Visible error + Retry (refetch) |
| Permission / API failure | Toast + error surfaces; Platform messages propagated |
| Network failure | Mutation catch → destructive toast; list error → retry |
| Validation failure | Form-level Zod messages on create/edit |
| Conflict / unexpected payloads | Surfaced as API error strings; no silent swallow |
| Offline messaging | Browser/network errors via fetch failure path; no dedicated offline banner (Admin always expected online) |
| Bulk recovery | Failed bulk leaves selection; operator can retry |
| No silent failures | Analytics `track` wrapped in try/catch so telemetry never hides UX errors |

---

## Analytics & Observability

### Infrastructure reused

- `@vercel/analytics` `track()` (root layout already mounts `<Analytics />`)  
- `lib/logger` structured info for non-prod visibility  
- Wrapper: `lib/opsTelemetry.ts` → `trackOpsEvent`

### Events instrumented

**Partner Operations**

| Event | When |
|-------|------|
| `partner_created` | Create Partner flow success |
| `partner_updated` | Drawer save / post-update callback |
| `partner_status_changed` | Drawer status change or bulk status |
| `readiness_filter_used` | Readiness filter ≠ all |
| `search_used` | Deferred non-empty search |
| `drawer_opened` | Deep link / row open |
| `bulk_action_executed` | Bulk status or CSV export |

**Organisations**

| Event | When |
|-------|------|
| `organisation_created` | Create Organisation dialog success |
| `organisation_type_selected` | Type filter or create dialog type |
| `organisation_updated` | Drawer save callback |
| `organisation_opened` / `drawer_opened` | Detail open |
| `membership_action` | Staff add / role change |
| `search_used` | Deferred non-empty search |
| `partner_created` | When directory creates `reward_partner` type |

No second telemetry platform was introduced.

---

## Visual verification (vs Design Specs)

| Spec expectation | Assessment |
|------------------|------------|
| Partner Ops feels like readiness command centre | KPIs + attention + readiness columns/filters — **aligned** |
| Organisations feels like multi-type directory | Type KPIs + type filter + Create Organisation — **aligned** |
| Drawers tell different stories | `mode="partner"` vs `mode="organisation"` — **aligned** |
| Hierarchy / spacing / badges | Uses existing Admin Card/Badge/Table language — **consistent** |
| Empty / loading / filters / tables | Implemented per contracts — **aligned** |

No intentional redesign; hardening only.

---

## Final verification vs contracts

| Contract | Drift? |
|----------|--------|
| Product Intent & Responsibility | **No** — missions, ownership, boundaries preserved |
| Partner Operations UI/UX Spec | **No** — readiness-first IA preserved |
| Organisations UI/UX Spec | **No** — directory/tenancy IA preserved |
| Design Rationale | **No** — shared components, divergent meaning preserved |

Duplicate workflows: only intentional dual-entry create of reward partners (Partner create flow + Organisations create with type) as allowed by Product Constitution.

---

## Launch recommendation

1. **Deploy to staging.**  
2. Execute `docs/qa/partner-operations-test-matrix.md` and record Actual/Pass-Fail.  
3. Confirm Vercel Analytics custom events appear for Admin project.  
4. **Staged rollout** to internal operators.  
5. Full Admin rollout after matrix sign-off with no Sev-1/2 defects.

**Staff-engineer verdict:** **GO for staged production**, contingent on QA matrix completion.
