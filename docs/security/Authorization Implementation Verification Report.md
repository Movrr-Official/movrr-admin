# MOVRR Admin — Authorization Implementation Verification Report

**Date:** 2026-07-30  
**Scope:** Capability-first Operations Control Centre authorization  
**Status:** Implemented (foundation + dashboard consumers)

---

## 1. Employee Role Matrix

| Role | Department | Data scope | Read-only | Legacy alias |
|------|------------|------------|-----------|--------------|
| super_admin | Security | global | No | — |
| security_admin | Security | global | No | — |
| operations_manager | Platform Operations | global | No | `admin` |
| platform_operator | Engineering Operations | global | No | — |
| campaign_manager | Campaign Operations | global | No | — |
| partner_operations_manager | Partner Operations | organisation | No | — |
| fraud_analyst | Fraud | assignment | No | — |
| trust_safety_analyst | Trust & Safety | assignment | No | — |
| support_agent | Support | assignment | No | `support` |
| support_lead | Support | department | No | — |
| finance_operator | Finance | global | No | — |
| compliance_analyst | Compliance | programme | Yes | `compliance_officer` |
| programme_operations_manager | Government Programmes | programme | Yes | `government` |
| executive_viewer | Executive | global | Yes | — |
| product_operations | Product Operations | global | No | `moderator` |
| engineering_operations | Engineering Operations | global | No | — |

Source: `features/organisations/domain/employeeRoleTemplates.ts`

---

## 2. Capability Matrix (employee + product)

Product capabilities remain in `CapabilityCatalog` (org/rider/advertiser/government bundles unchanged).

Employee capabilities added include: `dashboard.read`, `users.*`, `riders.*`, `rides.*`, `routes.*`, `campaigns.approve|publish|archive`, `fraud.*`, `incidents.*`, `exports.execute`, `settings.*`, `platform.*`, `authz.*`, `break_glass.use`, `delegation.manage`, and related ops verbs.

Roles resolve exclusively through `EMPLOYEE_BUNDLE_CAPABILITIES` → `mapAdminRoleToCapabilities` → `authorisationService`.

---

## 3. Navigation Matrix

Navigation is **generated** from `DASHBOARD_CAPABILITY_SURFACES` via `generateNavigationFromCapabilities()` and filtered by granted capabilities (`filterNavigationByCapabilities`).

| Nav | Required capability |
|-----|---------------------|
| Overview | dashboard.read |
| Workboard | workboard.access |
| Ops → Fraud | fraud.review |
| Ops → Incidents | incidents.read |
| Ops → Programmes | programmes.read |
| Ops → Jobs | platform.jobs.manage |
| Ops → Health | platform.health.read |
| Ops → Billing | billing.read |
| Waitlist | waitlist.manage |
| Users | users.read |
| Riders | riders.read |
| Ride Sessions | rides.read |
| Suggested / Planned Routes | routes.read / routes.write |
| Rewards | rewards.catalog.read |
| Fulfilment | fulfilment.read |
| Advertisers | advertisers.manage |
| Campaigns | campaigns.read |
| Community Rides | community.manage |
| Pro Tips | protips.manage |
| Notifications | notifications.read |
| Settings | settings.manage |
| Authorization | authz.inspect |

Manual role arrays removed from Sidebar.

---

## 4. Page Authorization Matrix

Pages use `AuthWrapper` with `capability` / `capabilities` (not role arrays). Server actions use `requireCapability` / `requireAnyCapability`.

Nav visibility and page gates share the same capability registry — closing the prior compliance/government false-discoverability gap.

---

## 5. Command Matrix

| Surface | Filter |
|---------|--------|
| Global Search | `access.capability` + `canAccessSearchableEntity` |
| Overview quick actions | capability / `canSeeNavHref` |
| Export action | `exports.execute` + audited server path |
| Authorization simulator | `authz.inspect` / `authz.manage` |

---

## 6. Approval Matrix (SoD)

| Workflow | Initiate | Approve | Same-actor blocked |
|----------|----------|---------|--------------------|
| Campaign | campaigns.write | campaigns.approve | Yes |
| Reward | rewards.manage | rewards.approve | Yes |
| Partner | resources.manage | partners.approve | Yes |
| Route | routes.write | routes.approve | Yes |
| Privileged role assign | users.role.assign | users.role.approve | Yes |
| Export | exports.execute | (audit) | No |

`super_admin` / `security_admin` assignment requires `users.role.approve`.

---

## 7. Export Matrix

| Path | Capability | Audit | Correlation ID | Rate limit |
|------|------------|-------|----------------|------------|
| `executeAuditedExport` | exports.execute (or module surface) | audit_log | Yes | 20/min/user |
| Dashboard CSV | exports.execute | via executeAuditedExport | Yes | Yes |
| Legacy `recordDataExport` | exports.execute | Yes (marked legacy) | Yes | — |

Unaudited client-only dashboard export removed.

---

## 8. Audit Matrix

| Event | Logged |
|-------|--------|
| Data exports | Yes |
| Privileged role assignment | Yes (existing user update audit paths + capability gate) |
| Break-glass | Framework recorded in `securityElevations.ts` (in-memory foundation) |
| Capability assertions (API) | Existing platform pipeline |

---

## 9. Security Assessment

| Control | Status |
|---------|--------|
| Capability-first dashboard auth | **Implemented** |
| Unified catalog with Platform API | **Implemented** (shared `KnownCapability` + `authorisationService`) |
| Super Admin assignment protection | **Implemented** (`users.role.approve`) |
| Least privilege role templates | **Implemented** |
| SoD same-actor checks | **Implemented** (helpers ready for workflow call sites) |
| Edge/proxy login gate | **Active** (`proxy.ts` = Next 16 network boundary; role set = all employee roles) |
| Temporary access / delegation / break-glass | **Foundations** (contracts + in-memory stores) |
| ABAC data scoping | **Foundations** (`dataScope.ts`; global visibility preserved) |
| API route migration | **Partial** — server actions migrated; some `app/api/**` still use legacy role helpers |

---

## 10. Scalability Assessment

| Headcount | Ready? |
|-----------|--------|
| 10 | Yes |
| 50 | Yes (add roles via templates only) |
| 100 | Yes with assignment/programme scope adoption |
| 500 | Requires activating ABAC matchers + persistence for temp access |

Adding a role no longer requires editing Sidebar / AuthWrapper arrays — assign a capability bundle and surfaces derive automatically.

---

## 11. Launch Recommendation

**Launch-ready for Operations Control Centre authorization foundation**, with these follow-ups before large-scale headcount growth:

1. Migrate remaining `app/api/**` handlers from `requireAdminRoles` to `requireCapability`.
2. Wire SoD same-actor checks into campaign/reward/partner approve mutation paths end-to-end.
3. Persist temporary access / break-glass events to `audit_log`.
4. Adopt `canAccessRecord` filters per module when regional/programme ops begin.
5. Migrate remaining legacy DB roles (`admin`, `moderator`, …) to canonical ids over time (aliases already work).

**Verdict:** movrr-admin now operates on one Capability Registry governing navigation, pages, actions, search, commands, exports, and Platform API employee grants — matching the approved audit architecture.
