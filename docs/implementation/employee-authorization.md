# Employee Authorization — Implementation

| | |
|--|--|
| **Purpose** | How capability-first employee AuthZ is realised in movrr-admin |
| **Audience** | Engineers |
| **Status** | Shipped |
| **Last updated** | 2026-07-30 |
| **Owner** | Admin Engineering |
| **Slug** | `employee-authorization` |

## Related documents

| Perspective | Document |
|-------------|----------|
| Product | [product/employee-authorization.md](../product/employee-authorization.md) |
| Architecture | [architecture/employee-authorization.md](../architecture/employee-authorization.md) |
| Operations | [operations/employee-authorization.md](../operations/employee-authorization.md) |
| ADR | [ADR-0001](../adr/ADR-0001-capability-first-employee-authorization.md) |
| Verification | [security/Authorization Implementation Verification Report.md](../security/Authorization%20Implementation%20Verification%20Report.md) |
| Re-audit | [security/Authorization Post-Implementation Re-Audit.md](../security/Authorization%20Post-Implementation%20Re-Audit.md) |

## Table of contents

- [Summary](#summary)
- [Module map](#module-map)
- [Integration strategy](#integration-strategy)
- [Migration](#migration)
- [Testing strategy](#testing-strategy)
- [Production readiness](#production-readiness)
- [Engineer checklist — new module](#engineer-checklist--new-module)
- [Future evolution](#future-evolution)
- [References](#references)

---

## Summary

Admin authorization is **capability-first**. Employee roles in `admin_users.role` map to capability bundles. A dashboard registry links capabilities to navigation, pages, search, commands, exports, and SoD metadata. Pages use `AuthWrapper` capability props; mutations and cookie APIs use `requireCapability` / `requireAnyCapability`. Platform `/api/v1` continues to use `authorisationService` with the same capability strings via `mapAdminRoleToCapabilities`.

---

## Module map

| Area | Path | Role |
|------|------|------|
| Capability vocabulary | `features/organisations/domain/CapabilityCatalog.ts` | Product + employee `KnownCapability` |
| Employee templates | `features/organisations/domain/employeeRoleTemplates.ts` | Roles, bundles, aliases, SoD assignable sets |
| Admin → caps mapper | `features/organisations/application/adminCapabilityMapper.ts` | Platform principal grants |
| Authorisation service | `features/organisations/application/commands/authorisationService.ts` | Platform assert / resolve |
| Dashboard registry | `features/authorization/dashboardRegistry.ts` | Surfaces matrix |
| Nav generation | `features/authorization/navigation.ts` | Sidebar tree from registry |
| SoD rules | `features/authorization/sod.ts` | Workflow definitions |
| SoD enforcement | `features/authorization/sodEnforcement.ts` | Initiator audit + same-actor check |
| Data scope foundation | `features/authorization/dataScope.ts` | ABAC presets (allow-all today) |
| Elevations | `features/authorization/securityElevations.ts` | Temp / break-glass / delegation contracts |
| Diagnostics | `features/authorization/diagnostics.ts` | Role simulator |
| Role UI labels | `features/authorization/roleOptions.ts` | Canonical options for Users UI |
| Dashboard assert | `lib/admin.ts` | `requireCapability*`, `requirePageAccess` |
| Legacy bridges | `lib/authPermissions.ts` | Deprecated role arrays; permission→capability map |
| Page gate | `components/auth/AuthWrapper.tsx` | Capability-only |
| Sidebar | `components/layout/Sidebar.tsx` + `sidebarNavigation.ts` | Capability filter |
| Search | `lib/search/{registry,access,types}.ts` | Capability access |
| Exports | `lib/export.ts` + `app/actions/exportAudit.ts` | Serialize → audit → download |
| Diagnostics UI | `app/settings/authorization/` | Simulator |
| Edge login | `proxy.ts` | Next 16 proxy; employee role set |
| Schema | `schemas/user.ts`, `types/auth.ts` | Role enums include canonical + legacy |

---

## Integration strategy

| Surface | Strategy |
|---------|----------|
| Login | `proxy.ts` requires `admin_users.role ∈ EMPLOYEE_ROLES` |
| Layout role | `getAdminRoleForLayout` → Sidebar capabilities |
| Pages | `AuthWrapper capability=…` / `capabilities={[…]}` |
| Actions | `await requireCapability("…", { mutation: true })` |
| Cookie APIs | Same helpers as actions |
| Platform APIs | Unchanged `platformRoute` + capability config |
| Search | `access: { capability: "…" }` on registry entities |
| Quick actions | Filter by capability / `canSeeNavHref` |
| Exports | `serializeExportData` → `executeAuditedExport` → `downloadSerializedExport` |
| Approvals | Capability gate + `enforceApprovalSod` where initiator known |
| Users roles | Canonical options in create/edit; privileged assign uses `users.role.approve` |
| Workboard invites | `employeeHasCapability(role, "workboard.access")` |

---

## Migration

| Concern | Behaviour |
|---------|-----------|
| Existing `admin` / `moderator` / `support` / `compliance_officer` / `government` | Alias → canonical template; no DB rewrite required |
| `admin_users.role` | Text — stores canonical or legacy strings |
| `public.user.role` | Remains product enum; employee sync collapses staff to `admin` / `super_admin` where needed |
| SQL migration | **Not required** for AuthZ day-1 |
| Deprecated helpers | `requireAdminRoles`, role arrays in `authPermissions` kept as shims; **no live feature callers** |
| Enum expansion | **Not recommended now** — see product FAQ / ADR |

---

## Testing strategy

| Layer | Location | Covers |
|-------|----------|--------|
| Employee bundles / SoD / page alignment | `__tests__/features/authorization/employeeAuthorization.test.ts` | Templates, SoD, simulator, Platform assert |
| Sidebar capability filter | `__tests__/ui/sidebarNavigation.test.ts` | Generated nav per role |
| Platform org AuthZ | `__tests__/features/organisations/authorisation.test.ts` | Org/rider bundles unchanged |
| Search access | `__tests__/features/search/providersAndGlobalSearch.test.ts` | Capability filtering |

Run:

```bash
npx vitest run __tests__/features/authorization __tests__/ui/sidebarNavigation.test.ts __tests__/features/organisations/authorisation.test.ts
```

---

## Production readiness

| Check | Status |
|-------|--------|
| Capability-first pages + actions | Done |
| Cookie API capability gates | Done |
| Sidebar / search / quick actions aligned | Done |
| SoD call sites (campaign, reward, route, advertiser) | Done |
| Audited exports (dashboard + dialogs) | Done |
| Fraud disposition in workbench | Done |
| Privileged role assignment guard | Done |
| Diagnostics UI | Done |
| ABAC enforcement | Deferred (foundation only) |
| Persisted break-glass / delegation | Deferred (runtime merge ready) |
| DB migration | Not required |

Verification artefacts: Implementation Verification Report + Post-Implementation Re-Audit under `docs/security/`.

---

## Engineer checklist — new module

1. Add capability string(s) to `EMPLOYEE_CAPABILITIES` (and product list if shared).
2. Add / extend role bundles in `EMPLOYEE_BUNDLE_CAPABILITIES` for roles that need it.
3. Register `DASHBOARD_CAPABILITY_SURFACES` (nav, pages, actions, search, export, SoD as needed).
4. Gate page: `<AuthWrapper capability="…">`.
5. Gate mutations: `requireCapability("…", { mutation: true })`.
6. If approval workflow: `recordEntityInitiator` on create; `enforceApprovalSod` on approve.
7. If searchable: set `access.capability` on search registry entity.
8. Add/adjust unit tests for the new capability’s role visibility.
9. Do **not** add `roles: ["admin", …]` arrays to Sidebar or pages.

---

## Future evolution

- Persist elevations; keep `mergeTemporaryCapabilities` as the single merge point in `requireCapability`
- Repository-level `canAccessRecord` filters by `dataScope`
- Optional shared package for `KnownCapability` across admin/app/mobile
- Remove deprecated `requireAdminRoles` once confidence window closes

---

## References

- Commit `7ac51ba` — capability-first employee authorization
- `docs/security/Authorization Post-Implementation Re-Audit.md`
- Platform `authorisationService` + `CapabilityCatalog`
