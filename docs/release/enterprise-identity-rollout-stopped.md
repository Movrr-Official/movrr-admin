# Enterprise identity rollout stopped before production changes

The 21 October 2026 approval pinned migrations 071–077 from Admin `8d7320ea96325bbc9adbc67f7e4b820baba9c5e1`, with Admin/web deployments `8d7320e` / `5e44a6f`. Read-only production preflight found a material dependency failure. The instructed stop boundary was followed: **no migrations, deployments, firewall holds, membership grants, emails or financial mutations were executed**.

## Findings and exact corrections

**ID-23 — Critical: missing Advertiser organization column.** Production and the committed baseline have no `public.advertiser.organisation_id`. The approved migrations reference it in provisioning, backfill and RLS, but do not add it. The earlier SQL/Auth fixtures added the column independently, masking the installation defect. A local replay of the exact approved seven-file batch on production's exported schema reproduces PostgreSQL `42703` in migration 074 and rolls back the batch.

The revised [071](../../scripts/071_external_account_domains.sql) now adds the nullable organization link with a real foreign key and unique index before dependent contracts. Both real Auth/SQL fixtures now explicitly assert the column is absent before applying 071; their independent column additions are removed. The PostGIS harness executes this exact migration section rather than supplying the dependency itself. A regression verifies foreign-key denial and one Advertiser profile per organization.

**ID-24 — High: policy rewrite depends on search_path.** After correcting only 071, a full-schema local replay under an empty search_path causes migration 075 to turn qualified `public.is_admin()` into invalid `public.public.identity_has_capability(...)`, PostgreSQL `0A000`. The revised [075](../../scripts/075_identity_rls_capability_boundaries.sql) consumes an optional `public.` qualifier for both old dashboard predicates and the retired campaign-owner helper. The SQL integration suite now runs 075 with an empty search_path. It does not retain a legacy helper or permission fallback.

Only migrations **071 and 075** change. Migrations **072, 073, 074, 076 and 077 remain byte-identical** to the approved LF source. Application runtime sources are unchanged; the originally requested Admin/web deployment SHAs remain the deployment targets. Renewed approval is required for the changed SQL checksums, not for a new product policy or expanded role model.

## Ownership reconciliation

Read-only inspection found exactly **one active existing Advertiser profile**, explicitly linked by advertiser.user_id to matching public/Auth identities; exactly one active canonical super-administrator actor is available. There is **no canonical organization link and no matching existing Advertiser organization**. No ownership was inferred from user_role.

Consequently, the reviewed 074 backfill would create **one new canonical Advertiser organization**, update that one existing profile's organization link, add **one Owner membership** for its verified existing identity and record its authorization audit. It cannot be described as merely granting membership in an already linked organization. These exact affected counts and the new organization creation must be included in renewed release approval. No backfill record has changed in production.

## Verification and containment

- Production still ends at `20261021071500 / 070_employee_rbac_authority`, checksum `185617e57be2f3f33f926dc0c19380b793f3bd7aff4f079b406021d85d0f2728`; zero 071–077 journal entries exist.
- Functions, policies, schema, grants and operating gates match the reviewed baseline. Intake remains Enabled, irreversible execution Disabled and public Shop redemption Disabled.
- Both original failures are independently reproduced in an isolated local PostgreSQL instance using the actual production public/Auth schema and local-only identity fixtures. Production schema export uses read-only transactions and exports no production identity/financial rows. Reference bundle metadata comes from committed fixtures.
- The corrected full seven-migration batch passes on that schema, including all production policy definitions: one fixture Advertiser Owner backfill, zero unintended Riders, 380 resulting policies.
- All **793 Admin tests** pass, including real PostgreSQL and GoTrue; **82 PostGIS assertions**, catalog drift check and TypeScript/lint pass. The application runtime is unchanged from the already built approved deployment sources.
- No authenticated production browser journey or external mail/provider acceptance was executed. No candidate or production deployment was created; existing deployments remain in place. No insecure path was restored as recovery.

The exact schema-only input and prerequisite metadata are retained in ignored `.tmp/enterprise-identity-rollout-20261021/` as reproducible operational fixtures. Offline reproduction uses `node scripts/manual/enterprise-identity/rehearse-production-schema.cjs --schema-file=.tmp/enterprise-identity-rollout-20261021/production-schema-only.sql`; it checks the recorded fingerprint and does not read production credentials or connect to production. These fixtures contain schema definitions and reference metadata, not production identity or financial rows.

The exact original/revised migration checksums, source commit, unchanged production deployments and rehearsal evidence are in [rollout-blocked.json](../verification/enterprise-identity/rollout-blocked.json). The original [verification receipt](../verification/enterprise-identity/verification.json) remains historical evidence of the originally approved source; its migration checksums are not overwritten.

## Resume after explicit amended approval

Approve the corrected 071 and 075 at the recorded correction source revision, retain 072/073/074/076/077 unchanged, and explicitly authorize the one-new-organization / one-existing-profile / one-Owner-membership backfill above. Keep the requested Admin/web deployment targets unchanged.

Then repeat read-only preflight and the existing scoped-hold/candidate procedure. The prepared rollout tool accepts an explicit `--migration-revision=<correction source SHA>` bound to the correction receipt; omitting it verifies the original source and refuses its missing dependency. It does not treat the prior approval as authorization for revised SQL. The migration runner executes the seven exact reviewed bodies and journals in one explicit transaction, stripping only their outer BEGIN/COMMIT, so an installation failure rolls back the complete batch. After commit, use canonical forward repair under the hold, never retired authorities. Promotion and authenticated acceptance remain separate required steps.
