# Task 3 Report: Organisations schema + membership + AuthorisationService

**Status:** DONE  
**Branch:** `feat/fulfilment-engine-plan-1`  
**Commit:** _(filled after commit)_

---

## Summary

Implemented multi-tenant Organisations RBAC for the Fulfilment Engine foundation:

- SQL `scripts/040_organisations_rbac.sql` — organisations, memberships, permission bundles, bundle capabilities, `reward_partner.organisation_id` + backfill
- Domain capability catalog + role→bundle mapping (owner/manager/staff/viewer)
- `AuthorisationService`: `resolvePermissions`, `assertCapability` (default-deny), `withPermissions`
- Admin role → capability mapper (independent of org bundle store)
- Rider default bundle: `rewards.redeem`, `rewards.catalog.read`, `fulfilment.read`, `wallet.read`
- Commands: `createOrganisation`, `addMember`, `assignBundle` + in-memory repository for tests
- Real `findOrganisationMembership` adapter wired for Identity (replaces Task 2 stub)

---

## TDD workflow

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Wrote `__tests__/features/organisations/authorisation.test.ts` | Authz matrix tests created |
| 2 | `npx vitest run __tests__/features/organisations/authorisation.test.ts` | FAIL — modules not found |
| 3 | Implemented domain, AuthorisationService, SQL, commands, adapters | Minimal green implementation |
| 4 | Re-ran vitest | PASS — 13/13 authz tests |
| 5 | Committed | see Commit section |

---

## Files created / modified

| File | Purpose |
|------|---------|
| `scripts/040_organisations_rbac.sql` | Schema, seed bundles, reward_partner backfill, RLS |
| `features/organisations/domain/CapabilityCatalog.ts` | Capabilities, role→bundle keys, bundle grants |
| `features/organisations/domain/Organisation.ts` | Organisation aggregate type |
| `features/organisations/domain/Membership.ts` | Membership type |
| `features/organisations/application/contracts/AuthorisationService.ts` | AuthZ contract |
| `features/organisations/application/contracts/OrganisationRepository.ts` | Org/membership ports |
| `features/organisations/application/commands/authorisationService.ts` | resolve / assert / withPermissions |
| `features/organisations/application/commands/createOrganisation.ts` | Create org command |
| `features/organisations/application/commands/addMember.ts` | Add member command |
| `features/organisations/application/commands/assignBundle.ts` | Assign bundle command |
| `features/organisations/application/adminCapabilityMapper.ts` | Admin role → capabilities |
| `features/organisations/infrastructure/inMemoryOrganisationRepository.ts` | Test repository |
| `features/organisations/infrastructure/supabaseOrganisationMembershipLookup.ts` | Identity port adapter |
| `features/identity/infrastructure/supabaseJwtVerifier.ts` | Re-exports real membership lookup |
| `features/identity/application/contracts/AuthenticateRequest.ts` | Port comment update |
| `__tests__/features/organisations/authorisation.test.ts` | Authz matrix unit tests |

---

## Implementation notes

### Permission bundles (not embedded on role enum)

| Role | Bundle key | Notable grants / denies |
|------|------------|-------------------------|
| owner | `org.owner` | includes `staff.manage`, `resources.manage`, fulfilment ops |
| manager | `org.manager` | `resources.manage` yes; `staff.manage` no |
| staff | `org.staff` | `fulfilment.validate` / `confirm` yes |
| viewer | `org.viewer` | read-only; cannot `resources.manage` / `confirm` |
| rider | `rider.default` | redeem / catalog.read / fulfilment.read / wallet.read |

### Default-deny

`assertCapability` allows only capabilities present on `RequestContext.permissions`. Unknown or missing ⇒ `permission_denied`. Call `withPermissions(ctx)` (or `resolvePermissions`) after AuthN to hydrate grants.

### Admin mapping

Uses `normalizeAdminRole` from `lib/authPermissions.ts`; maps to the same domain capability strings. Org `permission_bundles` store is not used for AdminPrincipal.

### reward_partner backfill

Migration creates one `organisation` (`type = reward_partner`) per existing `reward_partner` missing `organisation_id`, then links `reward_partner.organisation_id`.

### Out of scope

- Fulfilment engine code
- Hydrating `authenticateRequest` permissions automatically (AuthZ stays separate via `withPermissions`)
- Live DB tests (in-memory + pure AuthZ unit tests only)

---

## Test summary

`npx vitest run __tests__/features/organisations/authorisation.test.ts` → **13 passed**

Covered: staff validate/confirm; viewer denied resources/confirm; owner staff.manage; manager resources without staff.manage; unresolved capability deny; empty permissions deny; rider + admin capability mapping; `withPermissions` hydration.

Identity suite still green: 11 passed.

---

## Commit

```
feat(organisations): add multi-tenant org membership and capability RBAC
```
