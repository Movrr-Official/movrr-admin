# ADR-0001: Capability-first employee authorization

| | |
|--|--|
| **Status** | Accepted |
| **Date** | 2026-07-30 |
| **Deciders** | Admin Engineering / Platform Operations |
| **Slug** | `employee-authorization` |

## Context

MOVRR Admin outgrew coarse role allow-lists (`admin` / `moderator` / `support`). Sidebar, pages, server actions, search, and Platform API capabilities drifted. The organisation needs departmental roles, least privilege, and separation of duties without introducing a second authorization framework beside the Platform API.

## Decision

1. **Capabilities are the platform contract.** No Admin feature authorizes on employee role names for feature access.
2. **Roles are curated capability bundles** (`employeeRoleTemplates`), including legacy aliases for migration.
3. **Extend** `CapabilityCatalog` + `authorisationService` — do not replace them.
4. **Dashboard Capability Registry** is the single source for navigation, pages, search, commands, exports, and SoD metadata.
5. **`admin_users.role`** remains the employee role source of truth (text). Do **not** expand `public.user.role` enum with every job title at this stage.
6. **SoD** for privileged approvals; **audited exports** mandatory; ABAC scopes are foundational only until activated.

## Consequences

### Positive

- One vocabulary across Admin UI and Platform API admin principals
- New roles without rewriting auth conditionals
- Nav/page/action alignment by construction
- Clear ops runbooks and diagnostics

### Negative / trade-offs

- Creators who also hold approve capabilities must rely on same-actor checks (bundle design + enforcement)
- Temporary access / break-glass persistence deferred
- `public.user.role` remains a coarse product marker for staff (`admin` / `super_admin`)

### Rejected alternatives

| Alternative | Why rejected |
|-------------|--------------|
| Keep expanding role allow-lists per page | Drift and duplication (already failed audit) |
| New AuthZ framework (CASL, Oso, etc.) | Violates “preserve Platform capability model” |
| Put all job titles on `user_role` enum now | Mixes product principals with ops jobs; sticky Postgres enums |
| RLS-only Admin AuthZ | Service-role Admin client; app-layer AuthZ is intentional |

## References

- [product/employee-authorization.md](../product/employee-authorization.md)
- [architecture/employee-authorization.md](../architecture/employee-authorization.md)
- [implementation/employee-authorization.md](../implementation/employee-authorization.md)
- [operations/employee-authorization.md](../operations/employee-authorization.md)
