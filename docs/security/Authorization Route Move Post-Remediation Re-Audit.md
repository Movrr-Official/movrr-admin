# Authorization Route Move — Post-Remediation Re-Audit

| | |
|--|--|
| **Date** | 2026-07-30 |
| **Scope** | Re-verify route move + chrome path-prefix remediation |
| **Prior report** | [Authorization Route Move Verification Report.md](./Authorization%20Route%20Move%20Verification%20Report.md) |
| **Standard** | Enterprise post-implementation verification — code evidence required |
| **Verdict** | **Fully resolved** for in-scope route-move criteria |

## Summary

Sidebar disappearance on `/authorization` was **not intentional**. It was a false prefix match: `pathname.startsWith("/auth")` also matched `/authorization`, so chrome hide logic treated the diagnostics page as an auth screen.

Remediation introduced segment-safe path matching and wired all three affected call sites. Regression tests lock the `/auth` vs `/authorization` boundary.

---

## Finding disposition (re-audit)

| # | Criterion | Status | Code evidence |
|---|-----------|--------|---------------|
| 1 | Page at `/authorization` | **Fully Resolved** | `app/authorization/page.tsx` |
| 2 | Registry href `/authorization` | **Fully Resolved** | `features/authorization/dashboardRegistry.ts` (`authz.inspect` nav + pages) |
| 3 | Legacy redirect | **Fully Resolved** | `next.config.mjs` permanent redirect |
| 4 | Old settings route removed | **Fully Resolved** | No `app/settings/authorization` |
| 5 | Docs updated | **Fully Resolved** | product / architecture / implementation / operations / prior re-audit |
| 6 | Settings not active on AuthZ | **Fully Resolved** | `isPathActive("/authorization","/settings") === false` (`sidebarNavigation.test.ts`) |
| 7 | Sidebar / chrome visible | **Fully Resolved** | `hooks/useShouldHideComponent.ts` → `matchesAnyPathPrefix`; `pathMatch.test.ts` asserts `/authorization` not hidden |
| 8 | Breadcrumb not suppressed | **Fully Resolved** | `Breadcrumb.tsx` uses `matchesPathPrefix`; label map includes `authorization` |
| 9 | Auth redirect target includes `/authorization` | **Fully Resolved** | `lib/admin.ts` `shouldResolveRoleForPath` uses `matchesAnyPathPrefix` |
| 10 | Regression tests | **Fully Resolved** | `__tests__/security/pathMatch.test.ts` (4 cases) + existing AuthZ / sidebar suites |
| 11 | Capability gate | **Fully Resolved** | Unchanged `AuthWrapper` capabilities |
| 12 | Page capability alignment | **Fully Resolved** | `employeeAuthorization.test.ts` |

**Open / partial remaining in this scope:** none.

**Deferred (programme-level, unchanged):** ABAC enforcement, persisted break-glass / delegation.

---

## Remediation artefacts

| Artefact | Role |
|----------|------|
| `lib/pathMatch.ts` | Segment-safe prefix matcher |
| `hooks/useShouldHideComponent.ts` | Chrome hide uses matcher |
| `lib/admin.ts` | Excluded auth paths use matcher |
| `components/layout/Breadcrumb.tsx` | Auth hide + Authorization label |
| `__tests__/security/pathMatch.test.ts` | Boundary regression tests |

## Test evidence

```text
npx vitest run __tests__/security/pathMatch.test.ts \
  __tests__/features/authorization/employeeAuthorization.test.ts \
  __tests__/ui/sidebarNavigation.test.ts
→ 3 files, 32 tests passed
```

## Operator check

After refresh on `/authorization`: Sidebar, Navbar, and Footer should render; only **Authorization** (not Settings) should be the active nav item. Legacy `/settings/authorization` should 308/301 to `/authorization`.
