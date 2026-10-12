# Support role authorization remediation — 2026-10-12

## Policy and root cause

ADR-0001 is Accepted: capabilities, not role-name allow-lists, govern features (docs/adr/ADR-0001-capability-first-employee-authorization.md:16). The shipped product specification explicitly allows Support Agent Users/Riders/Rides reads (docs/product/employee-authorization.md:139). Legacy support maps to support_agent (features/organisations/domain/employeeRoleTemplates.ts:72). SUPPORT_BASE contains users.read and riders.read (:113); Support Lead separately adds riders.manage and exports.execute (:321).

The Users search denial assertion predated this approved capability-first policy. The production role bundle and search capability check were correct. No role capability assignments changed.

## Authorization chain and scope

admin_users.role → canonical employee template → shared capability mapper → Global Search dashboard.read gate → entity-specific users.read/riders.read gate → explicit bounded search projection → registry drawer URL → Users/Riders page AuthWrapper → server-action capability assertion before database operations. JWT Platform handlers resolve the same employee bundles through authorisationService.

Search exposes identifier, display name, email, avatar, status and rider city; it does not return passwords, MFA secrets, account notes, emergency contacts or arbitrary database fields. Users operational reads retain existing contact/activity/account-note projections. Support may open read/detail drawers and see that existing operational projection. This is entity/operation least privilege, not a newly introduced field-level privacy policy.

Users/Riders registry dataScope is global. The architecture explicitly preserves global visibility while ABAC filtering is deferred (docs/architecture/employee-authorization.md:176; security re-audit finding 18). No assignment-, tenant-, or case-limited record filtering is claimed or invented.

Legacy support and support_agent cannot create/update/delete/suspend users, reset passwords, manage riders, assign or approve employee roles, manage security settings, erase accounts, or export comprehensive account data. They retain unrelated approved notifications.send and incidents.create capabilities, so they are not globally read-only employees. Support Lead's separately approved rider management and export grants remain intact; it still lacks users.manage and role assignment/approval.

## Focused corrections

1. Updated the outdated Users search assertion and covered canonical/legacy Support plus denied roles.
2. Added search DTO leakage checks, bounded projections, drawer destinations, unauthorized direct-search checks, employee/page alignment, and actual direct Users/Riders action calls.
3. Corrected getPageRequiredCapabilities to use the most specific registered page rule. Parent Users read access no longer overrides the explicit Users create management rule; equal-specificity alternatives remain valid.
4. Corrected app/users/create/page.tsx to require users.manage, matching the registry and server createUser gate.
5. Corrected exportUserData to require users.read AND exports.execute with mutation checks before obtaining account data. Read-only account visibility does not imply permission to obtain the full account export. Export serialization and existing audit infrastructure were not redesigned or certified here.
6. Added direct Platform handler tests for allowed Support catalog/wallet/fulfilment reads and HTTP 403 on cancellation, refund and partner validation. These run actual handlers with injected authentication/test ports, not a deployed HTTP service.

Existing action buttons may remain visible in module UIs; invoking them without the necessary capability is denied server-side. Mounted browser presentation and live Supabase authorization were not tested. No permission was granted to make a button or navigation target work.

## Exact changes

- __tests__/features/search/searchableEntityRegistry.test.ts
- __tests__/features/search/providersAndGlobalSearch.test.ts
- __tests__/features/authorization/employeeAuthorization.test.ts
- __tests__/features/authorization/supportUserActions.test.ts (new)
- __tests__/features/api/v1.authz.matrix.test.ts
- app/actions/users.ts
- app/users/create/page.tsx
- features/authorization/dashboardRegistry.ts
- docs/security/support-role-authorization-remediation.md (new)

The requested legacy lib/employeeRoleTemplates.ts does not exist; its authoritative current implementation is features/organisations/domain/employeeRoleTemplates.ts. Partner locations, mobile runtime, role templates, capabilities, database schema and production configuration were not changed.

## Executed verification

- Focused Vitest: 9 files, 100 tests PASS, including the formerly failing registry test, all Global Search tests, employee RBAC, Users/Riders direct actions, identity, organisation authorization and Platform HTTP handler matrix.
- Full backend Vitest: 47 files, 551 tests PASS, zero failed. The prior support-role search failure is resolved.
- npm run typecheck: PASS.
- npm run lint: PASS (repository aliases TypeScript typecheck).
- git diff --check: PASS; LF/CRLF warnings only.

Commands: npm test -- __tests__/features/search __tests__/features/authorization __tests__/features/organisations/authorisation.test.ts __tests__/features/identity/authenticateRequest.test.ts __tests__/features/api/v1.authz.matrix.test.ts; npm test; npm run typecheck; npm run lint; git diff --check. Tests use isolated synthetic fixtures/mocks and real domain/handler logic, not production data. No staging, commits, push, deployment, production configuration or database changes occurred.

## Verdict

PASS for this focused Support authorization remediation and backend regression suite. This clears the prior test blocker. It is not a certification of deployed IAM, complete field-level privacy, export-audit durability, browser controls, or overall production readiness. Previously recorded evidence remains historical and is not rewritten as current execution.
