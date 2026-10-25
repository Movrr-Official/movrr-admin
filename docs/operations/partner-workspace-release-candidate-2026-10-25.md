# Partner Workspace release candidate - 25 October 2026

Execution update: the authorized 085/Admin/Partner rollout is deployed. See the [production execution record](../verification/partner-production-20261025/README.md) for exact deployment IDs, integrity checks, completed targeted signed-in acceptance and the separately authorized/deployed phone-handoff follow-up. Shop remains Disabled. The reviewed candidate instructions below are retained as release history.

Status: **software gates passed; GO recommendation for controlled Admin/Partner/085 rollout, subject to explicit release authorization. Public redemption remains NO-GO and Disabled.** No production migration, deployment, account provisioning, inventory change or financial command was performed. This updates the existing candidate; completed financial architecture, Community Safety and Rider Mobile product scope remain closed.

## Candidate scope and verification

Reviewed baselines: Admin `93db0e7a422077064fb5a12a0b4bf2e25e2fd5c3`, Partner `2e544099e5a5e61376a24879f156a63c92212bd1`, Mobile evidence `35ad03fa63dc8363dc2a995f0d35bf31397c2da2`. Initially clean trees were preserved. Final Admin is the commit containing this runbook. Final Partner is `28e01614d3ec9d2ee75bf5a87c12be9bc8e369ee`; final Mobile fixture/evidence is `66014ca9fb270e592b49b48e63dca26d9c3713dc`. Mobile native runtime sources are unchanged. [Current source hashes and dependency evidence](../verification/partner-security-20261025/dependency-remediation.json) supplement the [accepted implementation report](partner-workspace-acceptance-2026-10-25.md).

| Gate | Result |
| --- | --- |
| Admin | TypeScript and production build passed; 89 suites / 960 tests passed; 8 opt-in suites / 105 tests skipped |
| Partner | TypeScript, changed/new TypeScript lint and production build passed; 22 suites / 131 tests passed; subsequent offline-document/cache change passed 2 focused suites / 5 tests |
| Isolated onboarding | 19 passed; 8 optional transport checks skipped |
| PostgreSQL lifecycle | 392 assertions, including 051 compatibility, authorization, independent-connection races, exactly-once refunds, audit and notification recovery |
| Actual clients -> localhost HTTP -> API composition -> PostgreSQL | 256 assertions, 126 HTTP requests, 20 checkpoints, 18 denial/error scenarios; all financial counters zero |
| Admin audits | Full and production-only npm audits: zero vulnerabilities at every severity |
| Partner visual | 36 desktop/tablet/mobile route combinations: HTTP 200, no overflow, visible fixture UUIDs, runtime/hydration errors or detected WCAG A/AA violations |
| Partner interactions | 20 checks; four dark/offline/scanner/menu state captures also clean; mobile WebKit navigation passed |
| Admin maps/email | Actual WebGL2 worker/shared-module render, feature, zoom/resize and malicious-attribution check passed; all 10 existing email templates exported locally |

[Final cross-app evidence](../../../movrr-mobile/docs/verification/partner-security-20261025/journeys.json) records actual source and dependency hashes. Session identity, external providers and isolated synthetic data boundaries are explicit. No real merchant/device/provider acceptance is claimed. [Partner before/after gallery](../../../movrr-app/docs/verification/partner-premium-20261025/index.html), [visual verification and reproduction](../../../movrr-app/docs/verification/partner-premium-20261025/README.md) and its source manifest preserve the accepted implementation evidence. Firefox automation failed before loading MOVRR and remains untested. Automated accessibility checks are not full assistive-technology sign-off.

## Canonical migration 085

File: `scripts/085_canonical_debit_refund_compatibility.sql`.

SHA-256 (UTF-8, LF, as committed):

`c45e511cc771382b34dec6d3306343e17a9e66a22f33c415299ccb961896fb24`

Rollback: `scripts/rollback/085_canonical_debit_refund_compatibility.sql`, SHA-256:

`895aa2f990b2d6c8440cf9f69e4a2da77db7b294734a134b379f16d347695cfd`

Only `wallet_settle_refund_entry(uuid,uuid,uuid,integer,text,text,text,uuid)` and `shop_redemption_financials(uuid)` are replaced. A transaction preflight requires both existing 083 functions and their restricted execution boundaries. Missing functions or unsafe privileges abort the transaction, preventing creation of a new SECURITY DEFINER primitive with default PUBLIC execution. CREATE OR REPLACE preserves the existing owner and ACL; there are no grants, ledger updates, flag changes or 083/084 rewrites.

The compatibility predicate accepts source=adjustment only for a bound canonical 051 debit: wallet_contract=2 on both rows, settlement_kind=debit, matching redemption_id, redemption ledger_transaction_id=debit.id, matching fulfilment_id and an existing corresponding fulfilment. Existing rider, amount, refundable-state, locking, historical binding, idempotency and remaining-refund checks remain. Historical unbound adjustments remain denied.

Evidence includes a real paid 051 claim, rollback to the original 083 definitions reproducing cancellation failure, reinstalling 085, rejecting a forged binding, and eight concurrent identical cancellations producing one compensating credit. Core historical/authorization regressions pass. New checks reject missing prerequisites and unsafe authenticated execution, compare function OIDs/owners/ACL/security settings before/after, and reapply 085 without changes. The two rollback function bodies match 083 exactly (apart from CREATE OR REPLACE syntax).

## Admin security remediation

The original findings were applicable and are corrected, without force upgrades, audit suppression or risk waivers. [Exact installed versions, dependency paths, checks and dispositions](../verification/partner-security-20261025/dependency-remediation.json) are retained. Both full and production-only audits return zero findings; no known actionable production dependency advisory remains in the tested lockfile.

| Original finding | Correction and compatibility evidence |
| --- | --- |
| maplibre-gl 5.17.0, critical GHSA-jrc7-96c5-q579 | Upgrade to first patched 6.4.1 and compatible react-map-gl 8.1.3. Third-party attributions reach enabled Admin controls. Actual renderer now loads the same-origin ESM worker and its required shared module. Browser regression verifies sanitized adjacent event attributes never execute, real features render, zoom and resize work. Generated assets are reproducible prebuild outputs. WebGL2-capable target devices still require operational acceptance. |
| Direct zod 3.25.67, high GHSA-mrhx-c7xc-m3w5 | Upgrade to 4.6.7 with resolver 5.2.2. Adapt issues/error APIs, input/output typing, preprocessing values and partial enum records. Bounded max(1) oversized array now visits zero of 100 elements; regression verifies resolver coercion/defaults and metadata semantics. |
| next-cloudinary 6.17.5 -> url-loader 5.10.4 -> Zod v3, inherited high | Remove wrapper/loader. Sole image preview uses Next Image plus existing official Cloudinary URL SDK 1.15.0. Public-ID transforms and persisted HTTPS URLs tested; upload endpoint, validation and secure_url storage unchanged. No vulnerable wrapper remains. |
| Development preview/test graph | Remove deprecated React Email preview server, migrate supported CLI/UI to 6.11.3; compatible test/transitive fixes. All 10 existing templates export; production component/render imports remain unchanged. Full audit also zero. |

Primary sources: [MapLibre advisory](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579), [v6 migration](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/), [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Zod migration](https://zod.dev/v4/changelog), [Cloudinary transformations](https://cloudinary.com/documentation/javascript_image_transformations), [React Email 6](https://resend.com/blog/react-email-6). Local evidence establishes MOVRR reachability and compatibility; it does not assert production exploitation.

Admin's operational visual system is unchanged. Community ride form edits are necessary Zod input/value compatibility only; RouteTrackingMap changes only renderer imports. No Community Safety authority or tracking behavior changed.

## Partner experience, localization and QR/PWA acceptance

The Partner-only forest navigation shell, mobile tabs with prominent Scan action, scan-led overview, reward cards/forms, inventory empty states, staff access management, organization settings, notifications and activity hierarchy form one coherent experience. Real counts/contracts remain; no decorative merchant information or inventory was fabricated. Pending/history tabs use a capability-checked, organization-scoped canonical read; closed collections remain viewable without another handover action. Financial commands and tenant authorities are unchanged.

English/Dutch management, navigation, scanner, handover, loading/error and offline copy are covered. The authenticated actor-bound HttpOnly/SameSite presentation cookie preserves preference and grants no membership/capability. Scanner/detail use workspace language consistently. Merchant-authored names and stored notification bodies remain authored content. Light/dark contrast and deterministic theme hydration passed browser checks.

QR/PWA automated gates pass: canonical decoding, camera denial/fallback, explicit server verification and handover, duplicate/replay/tenant denials, no offline validation/fulfilment, manifest/icons and public-offline-document-only caching. Offline cache v2 updates the public fallback only; no private data caching or queued financial commands. Actual iOS/Android install, camera/focus and signed-in merchant acceptance remain required. No physical-device acceptance is claimed.

## Exact controlled rollout order (execute only after explicit RC authorization)

1. Review the actual Admin and Partner commit SHAs and this 085 checksum, review the completed security remediation evidence and approve a named deployment window. Fetch main and verify those exact commits and clean trees; use immutable candidate checkouts. Keep Git-triggered deployment disabled (`vercel.json` already disables main in both repos). Check real production environment configuration; `https://platform-build.invalid/api` used for a local build is never a deployment value.
2. Capture current production deployment IDs/SHAs/aliases and both SQL function definitions, owners, ACLs and security settings into approved release evidence. Capture current 051/083/084 definitions and migration records, confirm no intervening contract drift, backup/recovery availability and production Shop Disabled/version baseline. Read financial health counters in a READ ONLY transaction; stop on unexplained discrepancies. Never use source-parent SHAs as a substitute for actual deployed rollback IDs.
3. After the separate migration authorization, apply the exact Admin 085 file transactionally to Supabase project `kzdvunpuxaxlphqvmzxw`. Record 085 once using the existing canonical migration-record procedure (this SQL file does not invent a second registry). Do not replay 083/084 or touch financial rows. Compare installed function definitions against the candidate and verify restricted ACLs, retained owners/search_path and Disabled state. Recheck read-only reconciliation. Abort the application rollout if any migration or health check fails.
4. Build and deploy the **approved Admin SHA** to existing Vercel project `movrr-admin`, ID `prj_VdWMMAnBPo7u5G9RPmlA6t9hMgCT`, team `team_Ni9dGJAOzL2buDAyllswezVl`, region fra1, alias `admin.movrr.nl`. Use the existing production environment and Platform configuration. Verify deployment source metadata, immutable URL health, authenticated authorized/denied reads and alias before proceeding. No cron/provider reconfiguration is part of this release.
5. Build and deploy Partner SHA `28e01614d3ec9d2ee75bf5a87c12be9bc8e369ee` to existing Vercel project `movrr-app`, ID `prj_I89dOyt1njax9XYP3aZBHNtprqwF`, same team/region, alias `app.movrr.nl`. Verify the actual project/origin mapping and production API origin before deployment. Use the configured project runtime and verify the build there. Keep main auto-deployment disabled. No Mobile deployment accompanies the fixture/evidence commit.
6. Record deployment IDs, exact source SHAs and final migration checksum. Verify signed-in authorized Partner organization/role/location reads, foreign/viewer denials, draft catalog visibility, safe errors, EN/NL navigation and success/failure copy, manifest/icon/SW headers, installation and camera behavior on real target devices. Confirm no private offline caching and no offline redemption. Reconcile Admin/Rider views with server state using approved existing records and read-only checks. Recheck Shop Disabled, financial health and durable notification backlog. Do not create accounts, inventory, live entitlements, scans or refunds for a canary without separate explicit authorization; use an approved isolated environment for mutating scenarios.
7. Obtain merchant, provider/device and readiness acceptance independently. No release step activates Shop. Public redemption needs a subsequent explicit decision after all readiness gates pass.

## Rollback conditions and operational acceptance

Stop for prerequisite/ACL/checksum drift, migration/build/health failure, tenant leak, unauthorized command, false QR success, duplicate settlement, unexplained financial/notification mismatch, authentication loss or failed critical language/install/camera journey. Restore captured previous deployment IDs, Partner first then Admin as applicable, preserving Shop Disabled; verify alias/source and read-only health.

Leave 085 installed for unrelated UI rollback. Only separately authorized SQL rollback may use the exact rollback file for a demonstrated 085 regression. It restores the known original refund incompatibility, requires containment/recovery review and never reverses ledger rows or notifications.

[Fresh production read-only check](../verification/partner-security-20261025/operating-gates.json) at 2026-10-25T14:29:21Z confirms Shop Disabled/version 0/redemption_enabled false, using SELECT only. Merchant counts were not refreshed: the earlier 25 October acceptance snapshot recorded readiness/inventory false, 10 active partner organizations, zero published locations, zero current launch attestations and 20 missing readiness evidence items. These are not operational merchant acceptance.

Remaining gates: explicit authorization for this exact rollout, production backup/drift checks, post-deployment signed-in reads, physical iOS/Android EN/NL camera/PWA/focus acceptance, target Admin WebGL2 support, genuine approved voucher supply and fulfilment/refund terms, published collection locations and trained staff, real email/push delivery acceptance and canonical launch attestations. No release step enables Shop or authorizes production test mutations.

**Software candidate: complete. Controlled deployment recommendation: GO after explicit release authorization and rollout preflight. Public redemption: NO-GO until separate operational acceptance and authorization.**


Execution follow-up: owner-authorized Admin `19790c4` and Partner `bc16e2c` are deployed. [Production checks and exact deployment IDs](../verification/partner-media-production-20261025/README.md) record unchanged financial/authorization/migration hashes, Shop Disabled, and the small dark-workspace label contrast exception with verified follow-up `43f11fc` awaiting its own deployment authorization.

Final contrast follow-up: owner-authorized Partner `43f11fc` is deployed as `dpl_B823jSAiYWG9n8NRsX9NYnPKUXML`; the dark workspace-label exception is resolved in fresh signed-in production acceptance. Admin remains `19790c4`. [Final production closure](../verification/partner-media-production-20261025/README.md) records unchanged financial/authorization/migration state and Shop Disabled.
