# Employee Authorization — Product Intent & Functional Behaviour

| | |
|--|--|
| **Purpose** | Why MOVRR Admin uses capability-first employee authorization and how operators experience it |
| **Audience** | Product, Ops leadership, Support, Security, Engineering, QA |
| **Status** | Shipped |
| **Last updated** | 2026-07-30 |
| **Owner** | Platform Operations + Admin Engineering |
| **Slug** | `employee-authorization` |

## Related documents

| Perspective | Document |
|-------------|----------|
| Architecture | [architecture/employee-authorization.md](../architecture/employee-authorization.md) |
| Implementation | [implementation/employee-authorization.md](../implementation/employee-authorization.md) |
| Operations | [operations/employee-authorization.md](../operations/employee-authorization.md) |
| ADR | [ADR-0001 Capability-first AuthZ](../adr/ADR-0001-capability-first-employee-authorization.md) |
| Platform capability registry | [platform/capability-registry.md](../platform/capability-registry.md) |
| Verification | [security/Authorization Implementation Verification Report.md](../security/Authorization%20Implementation%20Verification%20Report.md) |
| Re-audit | [security/Authorization Post-Implementation Re-Audit.md](../security/Authorization%20Post-Implementation%20Re-Audit.md) |

## Table of contents

- [Overview](#overview)
- [Goals](#goals)
- [Operator experience](#operator-experience)
- [Employee roles](#employee-roles)
- [Capabilities (product language)](#capabilities-product-language)
- [Separation of duties](#separation-of-duties)
- [What operators see](#what-operators-see)
- [Edge cases](#edge-cases)
- [Non-goals](#non-goals)
- [Product principles](#product-principles)
- [FAQ](#faq)
- [QA behaviour checklist](#qa-behaviour-checklist)
- [Future evolution](#future-evolution)
- [Product summary](#product-summary)

---

## Overview

MOVRR Admin is the **Operations Control Centre** for MOVRR employees. As the organisation grows, different people perform different operational jobs — campaigns, fulfilment, fraud, support, finance, compliance, programmes, platform health.

Employee Authorization ensures each person sees and can do **only what their job requires**, without inventing a second permission system parallel to the Platform API.

**Roles are job titles. Capabilities are the contract.**

Operators should never need to understand Postgres enums or scattered allow-lists. They pick an employee role; the system derives sidebar, pages, search, commands, approvals, and exports automatically.

---

## Goals

### Problems it solves

| Problem | How authorization helps |
|---------|-------------------------|
| Everyone was effectively “admin” | Dedicated operational roles with least privilege |
| Sidebar showed pages people could not open | Navigation generated from the same capabilities as page gates |
| Exports happened without audit | All operational exports go through audited server paths |
| Privileged promotion was unchecked | `super_admin` / `security_admin` require security approval capability |
| Adding a module meant editing role arrays everywhere | Register a capability once; nav/pages/actions derive from it |
| Dashboard AuthZ drifted from Platform API | Shared capability vocabulary and employee → capability mapper |

### Success criteria

- An operator never discovers an action they cannot perform.
- An authorized capability is never hidden from a role that holds it.
- Adding a role does not require rewriting authorization logic — only a capability bundle.
- Legacy roles (`admin`, `moderator`, `support`, …) keep working via aliases during transition.

---

## Operator experience

### First login

1. Employee authenticates (Supabase + MFA policy as configured).
2. `admin_users.role` resolves to an employee role template.
3. Sidebar, search, and overview quick actions adapt to that role’s capabilities.
4. Opening a page without the required capability redirects to `/unauthorized`.

### Day-to-day

| Surface | Behaviour |
|---------|-----------|
| Sidebar | Only modules the role can use (including Ops drill-down children) |
| Global search | Only entity types the role can read |
| Quick actions | Only destinations / exports the role can perform |
| Fraud workbench | Analysts with resolve capability can Verify / Reject in-queue |
| Settings → Authorization | Security / ops leads inspect role simulations (capability required) |

### Assigning access

1. Create or edit the user in **Users**.
2. Choose a **canonical employee role** (prefer these over legacy aliases).
3. Non-privileged roles: assignable by operators with `users.role.assign`.
4. Privileged roles (`super_admin`, `security_admin`): require `users.role.approve` (Security Administrator / Super Administrator).

---

## Employee roles

| Role | Department | Intent |
|------|------------|--------|
| Super Administrator | Security | Unrestricted authority + break-glass |
| Security Administrator | Security | Privileged role approval, security settings, authz diagnostics |
| Operations Manager | Platform Operations | Broad day-to-day ops without security admin powers |
| Platform Operator | Engineering Operations | Jobs, health, incidents reliability |
| Campaign Manager | Campaign Operations | Campaign lifecycle; not user/settings admin |
| Partner Operations Manager | Partner Operations | Fulfilment, catalog, partner approvals |
| Fraud Analyst | Fraud | Fraud queue + ride verification disposition |
| Trust & Safety Analyst | Trust & Safety | Incidents and safety investigations |
| Support Agent | Support | Read / notify / incident intake |
| Support Lead | Support | Waitlist + escalations |
| Finance Operator | Finance | Billing ops + audited exports |
| Compliance Analyst | Compliance | Read-heavy programmes / compliance / exports |
| Programme Operations Manager | Government Programmes | Programme and impact visibility |
| Executive Viewer | Executive | Analytics / reports read-only |
| Product Operations | Product Operations | Routes, workboard, community |
| Engineering Operations | Engineering Operations | Platform reliability + feature flags |

**Legacy aliases (still valid):** `admin` → Operations Manager · `moderator` → Product Operations · `support` → Support Agent · `compliance_officer` → Compliance Analyst · `government` → Programme Operations Manager.

---

## Capabilities (product language)

Capabilities are named like `campaigns.read`, `fraud.resolve`, `exports.execute`. Operators do not assign raw capabilities daily — they assign **roles**, which are curated bundles.

Examples:

| Role | Typical capabilities | Explicitly not included |
|------|----------------------|-------------------------|
| Campaign Manager | Campaigns read/write/publish, advertisers | Users manage, settings, fraud resolve |
| Support Agent | Users/riders/rides read, notifications send, incidents create | Wallet adjust (N/A), campaigns publish, settings |
| Executive Viewer | Dashboard, analytics, reports, programmes read | Any write / export privilege unless separately granted |
| Fraud Analyst | Fraud review/resolve, rides verify | Settings manage, role assignment |

---

## Separation of duties

Privileged workflows separate **initiate** from **approve** where appropriate:

| Workflow | Initiate | Approve | Same person blocked? |
|----------|----------|---------|----------------------|
| Campaign confirmation | campaigns.write | campaigns.approve | Yes |
| Reward publish (active) | rewards.manage | rewards.approve | Yes |
| Partner / advertiser activation | advertisers.manage | partners.approve | Yes |
| Route approve / reject | routes.write | routes.approve | Yes |
| Privileged role assignment | users.role.assign | users.role.approve | Capability split |
| Data export | exports.execute | Audited automatically | N/A (audit required) |

If SoD blocks an action, another authorized colleague must approve — do not share Super Admin credentials to bypass.

---

## What operators see

Visibility is capability-driven. Examples:

- **Compliance Analyst** sees Programmes (and related reads) — not Fraud disposition tools or Settings.
- **Campaign Manager** sees Campaigns / Advertisers — not Users admin or Security settings.
- **Fraud Analyst** sees Fraud + Ride Sessions disposition — not platform Settings.

Diagnostics: **Settings → Authorization** (requires `authz.inspect`) simulates any role’s navigation, capabilities, and SoD conflicts.

---

## Edge cases

| Situation | Expected behaviour |
|-----------|-------------------|
| Legacy `admin` still in DB | Maps to Operations Manager capabilities |
| Role without Ops children | Ops group hidden |
| Export without `exports.execute` | Action hidden / server rejects |
| Creator tries to approve own campaign | SoD error; another approver required |
| Read-only roles (compliance, programmes, executive) | Mutations rejected even if UI is stale |
| Temporary elevated grants (future persistence) | Merged at assertion time when present |

---

## Non-goals

Employee Authorization does **not**:

- Replace organisation / partner / advertiser / rider Platform API principals
- Enforce regional ABAC filters yet (architecture ready; visibility remains global for granted capabilities)
- Expand `public.user.role` enum with every job title (ops truth lives on `admin_users.role`)
- Redesign Admin UI chrome beyond capability-driven visibility
- Persist break-glass / delegation records yet (runtime hooks exist; DB persistence deferred)

---

## Product principles

1. **Capabilities are the contract; roles are bundles.**
2. **One registry governs discovery and enforcement.**
3. **Least privilege by default; Super Admin is exceptional.**
4. **Same-actor SoD for privileged approvals.**
5. **Fail closed on missing capability; fail clearly with `/unauthorized`.**
6. **Audited exports are non-negotiable for operational data.**

---

## FAQ

**Q: Should we still assign `admin`?**  
Prefer `operations_manager`. `admin` remains as a legacy alias.

**Q: Why can’t I approve a campaign I created?**  
Separation of Duties. Ask a colleague with `campaigns.approve` who did not create it.

**Q: Why don’t I see Fraud?**  
Your role lacks `fraud.review`. Request Fraud Analyst or Operations Manager via your lead / Security.

**Q: Do we need a database migration?**  
Not for day-1 auth. `admin_users.role` is text; legacy aliases work. No enum expansion required to operate.

**Q: Where do product riders/advertisers fit?**  
They are not Admin employee roles. They use Platform API principals in movrr-app / mobile.

---

## QA behaviour checklist

- [ ] Each canonical role can open only its expected sidebar entries
- [ ] Deep-link to a forbidden page → `/unauthorized`
- [ ] Search results omit forbidden entity types
- [ ] Overview quick actions match role
- [ ] Export requires capability and writes audit
- [ ] Privileged role assignment blocked without `users.role.approve`
- [ ] Campaign/reward/route/partner SoD blocks same actor
- [ ] Fraud Verify/Reject visible only with resolve capability
- [ ] Authorization simulator matches live sidebar for sampled roles
- [ ] Legacy `admin` / `support` / `compliance_officer` still login

---

## Future evolution

- Activate ABAC scopes (department, programme, assignment, region) without changing the capability contract
- Persist temporary access / break-glass / delegation with audit history
- Optional product-principal cleanup on `public.user.role` (keep ops roles on `admin_users`)
- Role request workflow UI (request → security approve)

---

## Product summary

Employee Authorization makes MOVRR Admin safe to grow: every employee gets a real operational job, every surface respects the same capability contract, and privileged work is separated, audited, and diagnosable.
