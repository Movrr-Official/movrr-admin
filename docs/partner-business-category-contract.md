# Partner business categories — 2026-10-17

The source implementation now carries one authoritative classification from `reward_partner.business_category` through `/api/v1/partners/locations` (`/partners/locations` on Mobile's platform client) to the existing bundled marker renderer. **It is not active in production. Migration 052, backend/Admin deployment and eventual Mobile release remain pending. Existing discovery gates stay disabled.** No production records were read or changed for this implementation.

## Architecture and contract

Inspection covered Mobile's discovery schema/service/renderer and the adjacent movrr-admin backend's partner and organisation domains, durable stores, location projection, HTTP composition, RBAC, partner creation flow, profile drawer, migrations 045/051 and reward schemas. Searches in the adjacent movrr, movrr-app and movrr-dashboard sources found no existing `business_category`, `businessCategory` or `partner_category` contract. Advertiser industry and reward catalog categories are unrelated classifications and are not reused.

The existing identity is `organisation` (type `reward_partner`) linked to the catalog-facing `reward_partner` profile through `organisation_id`; verified physical branches are `reward_partner_location`. Admin already manages profiles in the Partners/Organisations detail drawer and persists them through `save_organisation_with_partner`. The backend is implemented in movrr-admin; no separate new service is introduced.

The new authoritative source is nullable `reward_partner.business_category`, referencing `partner_business_category.code`. It describes the verified primary business type for that partner and is inherited by its branches. Mixed-purpose or uncertain businesses can remain uncategorized; there is no branch override or inference from names, logos, rewards or campaigns. Existing records receive no fabricated assignments or backfill.

| Stable code | Admin label | Existing marker |
| --- | --- | --- |
| restaurant | Restaurant | restaurant |
| cafe | Café | cafe |
| bicycle-shop | Bicycle shop | bicycle-shop |
| bookstore | Bookstore | bookstore |
| retail | Retail | retail |
| fitness | Fitness | fitness |
| experiences | Experiences | experiences |
| accommodation | Accommodation | accommodation |
| null / absent / unknown | Uncategorized / future code | general M |

The reference table permits future codes through controlled data changes rather than DDL/enum changes. Admin validation/UI must be updated to assign new codes; older clients accept unknown read codes and display the M. `contracts/partnerBusinessCategory.ts` is mirrored in both independent repositories because there is no shared package build. The cross-checkout verifier enforces exact source parity and database seed/code/label consistency. Business codes require exact matching; artwork-key normalization is not used to interpret backend categories.

Public DTO adds optional nullable string `businessCategory`. Older servers can omit it; old clients ignore the additive field. Backend read schemas accept future codes; mutation validation permits only known codes or explicit null. Omitted mutation field preserves the stored category; explicit null clears it.

## Backend, Admin and security

- Migration `movrr-admin/scripts/052_partner_business_categories.sql` adds the reference table, nullable foreign key column, column write guard and additive extension of the existing atomic save RPC. Existing identity, relinking restrictions, lifecycle and transaction semantics are preserved.
- The reference table has RLS enabled, no client policies, no anonymous/authenticated grants and service-role SELECT only. Existing partner/location policies and visibility logic are not widened. The save RPC stays `SECURITY INVOKER`, has a fixed public search path, and remains executable only by service_role (and database owners).
- Category writes require an authenticated Admin principal with `rewards.manage` at the application boundary. Organisation owners/managers also possess this capability, so the additional principal check is essential. Riders, partner principals, unauthenticated callers and read-only Admin roles cannot classify partners.
- The column trigger independently rejects changes from database roles outside service_role membership, even under legacy table-wide UPDATE grants. The FK rejects unsupported codes and preserves atomic rollback. Non-partner organisation classification is rejected by the service and RPC.
- The discovery join projects only `business_category` alongside its existing public partner fields. Published/verified branch, active partner, active reward-partner organisation, viewport, pagination and reward-association filters remain unchanged. Contact details and other private profile fields are not added to the public DTO.
- Admin's existing profile edit form has a labeled Business category select, an explicit Uncategorized option and verification guidance. Creation still defaults to null; assign the verified category by editing the new partner's profile. Detail readback shows the saved label. Untouched categories are omitted from profile saves, preventing incidental overwrites. Unknown future codes remain visible and preserved, and can deliberately be replaced or cleared.
- Mobile parses the additive field and maps exact supported codes to the existing assets. Missing, null, malformed taxonomy strings and future codes resolve to M. Both themes/states use existing static Metro assets. All clusters remain generic, including mixed-category clusters; presses, selected state, anchor, count badges and discovery gates are unchanged. No artwork was regenerated or redesigned.

## Executed verification

- Mobile TypeScript and focused ESLint passed.
- Admin TypeScript passed; its `lint` script is TypeScript checking, with no separate ESLint configuration/toolchain.
- Mobile focused partner/discovery/native-renderer tests: 7 suites / 79 tests passed, including all eight codes in both themes and selection states, strict fallback, singleton forwarding and mixed-category selection/press behavior.
- Admin focused partner/organisation/editor tests: 8 suites / 86 tests passed, including category round trips, invalid values, omitted/null handling, public projection and unchanged query predicates. Real HTTP handlers verify 200 assignment/clear, 400 invalid values, 401 unauthenticated requests and 403 support/owner/rider writes without persistence calls.
- `node scripts/verify-partner-location-contract.cjs`: 24 cross-repository schema checks passed, including legacy payloads, all codes, null and future codes, plus mirrored contract parity.
- `node scripts/verify-partner-business-categories.cjs`: isolated PGlite PostgreSQL executes migration 051 then 052, verifies forced-migration rollback restores the original RPC and removes partial DDL, preserves a pre-existing null-classified record, executes the SQL security/persistence suite, and verifies all 32 storage → discovery infrastructure → public DTO → marker state combinations. Its test-only Supabase transport executes the infrastructure's filter chain against PostgreSQL; it also excludes draft branches, inactive partners, suspended organisations and out-of-bounds branches. It uses local disposable fixtures only, no credentials or network.

This is layered local contract/integration evidence, **not live Supabase/PostgREST, browser UI or physical-device certification**. Native Android/iOS map screenshots, small-screen/outdoor readability, runtime density selection, anchor/selection behavior and many-marker performance remain physical-device checks; existing native-compatible PNG assets and rendering were not changed.

## Reproduction and approved deployment sequence

From movrr-mobile with the adjacent movrr-admin checkout (or pass its path to either verifier):

```powershell
node scripts/verify-partner-location-contract.cjs
node scripts/verify-partner-business-categories.cjs
npm.cmd run type-check
npx.cmd jest --runInBand features/maps/__tests__/partnerMarkerCategories.test.ts features/maps/__tests__/approvedMarkerRendering.test.tsx features/maps/__tests__/partnerOverlayRendering.test.tsx
```

From movrr-admin:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npx.cmd vitest run __tests__/features/partners __tests__/features/organisations __tests__/ui/partnerLocationEditor.test.ts
```

For approved native PostgreSQL/Supabase staging verification, apply migration 052 once after the already verified/ledgered 051 prerequisite, then run `scripts/tests/052_partner_business_categories.integration.sql` with an appropriate migration-owner connection and ON_ERROR_STOP. That test is transactional and rolls back its test records and grants. Do not run either against production without approval.

Before production activation:

1. Separately approve and verify the target database, migration ledger/prerequisites and recovery plan; apply **052_partner_business_categories.sql**. No migration was applied remotely by this task.
2. Verify schema and ACLs in staging, then approve and deploy the backend/Admin source. Schema must precede this deployment because the projection explicitly selects the new column. Refresh PostgREST schema cache if required by the existing deployment workflow.
3. Authorized Admin users assign verified primary categories through existing profile editing. Do not mass-classify existing partners from names/rewards. Validate safe real-record readback in staging.
4. Release Mobile through its separately approved release workflow and perform end-to-end native acceptance with the real staging API. Missing categories continue to use M.
5. Keep production partner discovery disabled until its existing backend-readiness and product-release approvals are satisfied. This implementation does not grant or change those approvals.

Rolling application code back to the previous version can leave the additive column/table in place; old clients ignore the field. Do not drop classification data or alter existing migration history as an automatic rollback. No backend deployment, production migration, OTA, EAS build or app-store submission was performed.
