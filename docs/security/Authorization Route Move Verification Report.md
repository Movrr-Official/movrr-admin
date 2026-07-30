# Authorization Route Move — Implementation Verification Report

| | |
|--|--|
| **Date** | 2026-07-30 |
| **Scope** | Move diagnostics from `/settings/authorization` → `/authorization`; chrome/sidebar regression |
| **Standard** | Enterprise post-implementation verification — code evidence required |
| **Status** | Remediated — see [Post-Remediation Re-Audit](./Authorization%20Route%20Move%20Post-Remediation%20Re-Audit.md) |

## Verdict (pre-remediation)

**Not launch-clean at audit time.** Route move and registry updates were correct, but a **latent path-prefix bug** made Admin chrome hide on `/authorization`. **Remediated** — re-audit marks findings 6–10 Fully Resolved.

---

## Original acceptance criteria (route move)

| # | Criterion | Pre-remediation status | Evidence |
|---|-----------|------------------------|----------|
| 1 | Diagnostics page lives at `/authorization` | **Fully Resolved** | `app/authorization/page.tsx`, `AuthorizationDiagnosticsPage.tsx` |
| 2 | Registry nav href + pages use `/authorization` | **Fully Resolved** | `dashboardRegistry.ts` `authz.inspect` / `authz.manage` |
| 3 | Legacy URL redirects permanently | **Fully Resolved** | `next.config.mjs` `/settings/authorization` → `/authorization` |
| 4 | Old `app/settings/authorization` removed | **Fully Resolved** | Directory deleted |
| 5 | Docs updated (product/arch/impl/ops/re-audit) | **Fully Resolved** | Path references updated to `/authorization` |
| 6 | Settings no longer double-highlights on AuthZ page | **Partially Resolved** | Path separation fixes `isPathActive("/authorization","/settings")`, but chrome was fully hidden so criterion could not be UX-verified |
| 7 | Sidebar remains visible on Authorization | **Still Open** | `useShouldHideComponent` used `pathname.startsWith("/auth")` → matched `/authorization` (`constant/path.ts`, `hooks/useShouldHideComponent.ts`) |
| 8 | Breadcrumb visible / correct on Authorization | **Still Open** | Same `startsWith("/auth")` in `Breadcrumb.tsx` |
| 9 | Session redirect target resolves for `/authorization` | **Still Open** | `lib/admin.ts` `EXCLUDED_PATHS` used same unsafe prefix match — `/authorization` incorrectly treated like auth chrome routes |
| 10 | Regression tests for `/auth` vs `/authorization` | **Still Open** | No tests before remediation |
| 11 | Capability gate unchanged (`authz.inspect` / `authz.manage`) | **Fully Resolved** | `AuthWrapper capabilities={["authz.inspect","authz.manage"]}` |
| 12 | Unit tests for registry page access | **Fully Resolved** | `employeeAuthorization.test.ts` gates `/authorization` |

---

## Root cause (Finding 7–9)

```ts
// UNSAFE — matches any string beginning with "/auth"
pathname.startsWith("/auth")
// "/authorization".startsWith("/auth") === true
```

Affected call sites:

| Location | Effect on `/authorization` |
|----------|----------------------------|
| `hooks/useShouldHideComponent.ts` | Sidebar, Navbar, Footer, MaintenanceBanner return null; CountProvider disables |
| `components/layout/Breadcrumb.tsx` | Breadcrumb suppressed |
| `lib/admin.ts` `shouldResolveRoleForPath` | Path incorrectly excluded from auth redirect-target resolution |

**Not intentional.** Auth chrome hide is only for `/auth/*` and `/unauthorized`.

---

## Non-findings / out of scope

| Item | Status |
|------|--------|
| ABAC record filtering | **Deferred** (pre-existing AuthZ programme) |
| Persisted break-glass | **Deferred** (pre-existing) |
| Expanding `user_role` enum | **Not Actionable** (prior decision) |

---

## Remediation plan

1. Introduce segment-safe `matchesPathPrefix` / `matchesAnyPathPrefix` in `lib/pathMatch.ts`.
2. Wire chrome hide, breadcrumb, and admin excluded paths through it.
3. Add unit tests proving `/authorization` is not under `/auth`.
4. Re-audit with code evidence.
