# Employee Authorization — Architecture

| | |
|--|--|
| **Purpose** | Boundaries, responsibilities, control flow, and invariants for capability-first Admin AuthZ |
| **Audience** | Engineering, Architecture, Security, Technical leadership |
| **Status** | Shipped |
| **Last updated** | 2026-07-30 |
| **Owner** | Admin Engineering |
| **Slug** | `employee-authorization` |

## Related documents

| Perspective | Document |
|-------------|----------|
| Product | [product/employee-authorization.md](../product/employee-authorization.md) |
| Implementation | [implementation/employee-authorization.md](../implementation/employee-authorization.md) |
| Operations | [operations/employee-authorization.md](../operations/employee-authorization.md) |
| ADR | [ADR-0001](../adr/ADR-0001-capability-first-employee-authorization.md) |
| Platform registry | [platform/capability-registry.md](../platform/capability-registry.md) |

## Table of contents

- [Context](#context)
- [Boundaries](#boundaries)
- [Components & responsibilities](#components--responsibilities)
- [Data & control flow](#data--control-flow)
- [Invariants](#invariants)
- [Integration points](#integration-points)
- [Design principles](#design-principles)
- [Non-goals](#non-goals)
- [Future evolution](#future-evolution)
- [References](#references)

---

## Context

Employee Authorization sits between **identity** (Supabase auth + `admin_users`) and **every Admin surface** (navigation, pages, server actions, cookie-auth API routes, search, commands, exports).

It extends — does not fork — the Platform API authorization model (`CapabilityCatalog`, `authorisationService`, capability assertions on `/api/v1/*`).

Product principals (rider, advertiser, partner org, government org) remain on the Platform path. This subsystem is the **employee** path into the Operations Control Centre.

---

## Boundaries

| Owns | Must not own |
|------|----------------|
| Employee role templates & capability bundles | Organisation membership RBAC |
| Dashboard capability surfaces (nav/pages/search/commands/exports/SoD metadata) | Product portal UX in movrr-app |
| Capability assertion for Admin cookie sessions | Rider GPS / mobile AuthN |
| SoD rules & initiator audit helpers | Full ABAC query filtering (foundation only) |
| Temporary grant merge at assertion time | Persisted elevation store (deferred) |
| Auth diagnostics / role simulation | Redesigning module UIs |

**In scope:** Admin dashboard + Admin cookie-authenticated APIs.

**Out of scope:** Expanding `public.user.role` enum with every job title; RLS row policies as primary AuthZ.

---

## Components & responsibilities

```text
Supabase Auth (+ MFA policy)
        ↓
admin_users.role  (employee role string)
        ↓
Employee Role Template  →  Capability Bundle
        ↓
Authorization Service path
  ├── Dashboard: requireCapability / requireAnyCapability / requirePageAccess
  ├── Platform API: authorisationService.assertCapability (admin principal)
  └── Temporary grants merged at assertion (in-memory foundation)
        ↓
Surfaces derived from Dashboard Capability Registry
  ├── Navigation generation
  ├── Page AuthWrapper
  ├── Server actions / cookie API routes
  ├── Search entity access
  ├── Commands / quick actions
  ├── Export governance
  └── SoD approval workflows
        ↓
Audit (exports, initiator records, existing admin_audit_log)
```

| Component | Responsibility |
|-----------|----------------|
| `CapabilityCatalog` | Canonical capability strings (product + employee) |
| `employeeRoleTemplates` | Role → bundle; legacy aliases; read-only flags |
| `adminCapabilityMapper` | Admin principal → capabilities for Platform AuthZ |
| `dashboardRegistry` | Capability → nav/pages/search/commands/exports/SoD/data scope |
| `navigation` | Generate + filter sidebar from registry |
| `sod` + `sodEnforcement` | SoD rules + same-actor enforcement via audit initiators |
| `lib/admin` `requireCapability*` | Dashboard assertion entry points |
| `AuthWrapper` | Page gate (capability-only) |
| `proxy.ts` | Next 16 network boundary login gate (employee role set) |
| `securityElevations` | Temp access / break-glass / delegation contracts |
| `diagnostics` | Role simulator for Settings → Authorization |

---

## Data & control flow

### Identity → authorization

1. Cookie session validated (`getAuthenticatedUser` / `proxy`).
2. `admin_users.role` normalized; must be an employee role (including legacy aliases).
3. Bundle resolved via `capabilitiesForEmployeeRole`.
4. Optional temporary capabilities merged.
5. Assertion: capability present ⇒ allow; else deny.

### Adding a module (architectural rule)

```text
Define KnownCapability
  → Register DASHBOARD_CAPABILITY_SURFACES entry
  → Gate page with AuthWrapper capability
  → Gate mutations with requireCapability
  → (Optional) search/commands/export modules
  → Bundle onto the roles that should hold it
```

No new role-name allow-lists in Sidebar, pages, or actions.

### Dual entry, single vocabulary

| Path | Entry | Vocabulary |
|------|-------|------------|
| Dashboard | `requireCapability` | `KnownCapability` |
| Platform `/api/v1` | `platformRoute` → `assertCapability` | `KnownCapability` |
| Admin JWT principal | `mapAdminRoleToCapabilities` | Same employee bundles |

---

## Invariants

1. **No surface authorizes on role name alone** for feature access (login gate may check membership in employee role set).
2. **Default deny** — missing capability is rejection.
3. **Nav ⊆ page ⊆ action** alignment — registry is single source for discoverability and gates.
4. **Super Admin assignment requires `users.role.approve`.**
5. **Same-actor SoD** for strict approval workflows when initiator is known.
6. **Exports mutate only after capability check + audit insert.**
7. **Read-only employee templates cannot pass `{ mutation: true }`.**
8. **Product/org capability bundles remain intact** — employee caps extend the catalog, they do not rewrite partner/rider grants.
9. **`public.user.role` is not the ops source of truth** — `admin_users.role` is.

---

## Integration points

| Integration | How |
|-------------|-----|
| Sidebar | Generated from capability surfaces; filtered by granted set |
| Pages | `AuthWrapper` `capability` / `capabilities` |
| Server actions | `requireCapability` / `requireAnyCapability` |
| Cookie APIs (`/api/optimize`, suggested-routes, health, …) | Same capability helpers |
| Platform APIs | Existing `authorisationService` |
| Search | Entity `access.capability` |
| Workboard invites | `workboard.access` eligibility |
| Users CRUD | Role sync to `admin_users`; privileged SoD |
| Fraud workbench | `fraud.resolve` / `rides.verify` disposition |
| Diagnostics UI | `/settings/authorization` |

---

## Design principles

1. **Capability-first** — roles are implementation constructs.
2. **Preserve Platform AuthZ** — extend catalog; do not introduce a second framework.
3. **Generate, don’t duplicate** — nav/search/commands derive from registry.
4. **Least privilege + SoD** for growth past small-team Admin.
5. **Foundations before ABAC** — scopes declared; global visibility preserved until activated.
6. **Fail closed for AuthZ; fail open only where product explicitly requires it** (not applicable to Admin gates).

---

## Non-goals

- Replacing Platform org RBAC
- Making RLS the primary Admin authorization layer
- Immediate persistence of break-glass / delegation
- Expanding `user_role` enum for every employee job title
- UI redesign of modules

---

## Future evolution

| Evolution | Safe approach |
|-----------|---------------|
| ABAC | Honour `dataScope` + `canAccessRecord` in repositories; keep capability check first |
| Persisted elevations | Store grants; keep `mergeTemporaryCapabilities` as the merge point |
| Cross-app shared registry package | Extract `KnownCapability` + templates; Admin/App/Mobile consume |
| Role request workflow | New initiate/approve capabilities; reuse SoD helpers |

---

## References

- `features/organisations/domain/CapabilityCatalog.ts`
- `features/organisations/domain/employeeRoleTemplates.ts`
- `features/authorization/*`
- `features/organisations/application/commands/authorisationService.ts`
- `docs/security/Authorization Post-Implementation Re-Audit.md`
