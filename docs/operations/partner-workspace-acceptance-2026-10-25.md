# Partner Workspace acceptance - 25 October 2026

**NO-GO for public redemption.** Public Shop remains **Disabled**, version 0, confirmed in a repeatable-read, read-only production transaction. Changes below are local and have not been committed, pushed, deployed or applied to production. No production merchant identity, entitlement, inventory or financial mutation was created.

## 1. Existing capabilities retained

The approved architecture remains Organisation membership -> Platform authorization -> canonical PostgreSQL fulfilment commands. Partner has no fulfilment SQL writer, alternative tenancy model or local settlement logic. Admin remains the authority for organisation provisioning, role assignment, partner/location approval and reward setup. Mobile remains the canonical Rider entitlement/credential presentation surface.

Existing capabilities include account provisioning and invitation acceptance/revocation, capability-based partner roles, tenant-filtered collections, catalog/inventory approval, server-issued opaque QR credentials, versioned collection/cancellation, single-use validation, audit events, durable notification/email intents, recovery and financial reconciliation. Physical locations already have verified-coordinate/publication and reward-association controls. These implementations were reused.

The previously accepted settlement/recovery controls were not redesigned. The specific 083 incompatibility below is new, reproduced evidence that narrows the earlier financial acceptance. Community Safety, native Mobile UI/UX and tracking are unchanged.

## 2. Confirmed gaps and defects

| Finding | Evidence | Correction |
| --- | --- | --- |
| Manual-only QR entry, no camera lifecycle | Existing ValidateTokenForm described camera as future work | Camera-first capture, explicit online server validation and manual fallback |
| Validation discarded the result and generated a fresh retry identity | Partner action ignored canonical response | Typed result, stable scan operation ID and direct collection handoff |
| Collection UI offered confirmation before validation | UI gated capability/version only | Confirmation appears only for server-reported validated state, with required handover acknowledgement |
| Merchant screens exposed UUIDs and API instructions | Collections, staff, resources, settings and rewards | Reward/team labels, scoped inventory selector, plain copy and safe error feedback |
| No PWA installation/offline assets | No manifest or worker | Manifest, approved-brand icons, install guidance and public-only offline document |
| Partner draft catalog entries disappeared | Shared catalog list filtered active items | Dedicated tenant-scoped catalog read; public active-only query unchanged |
| Catalog fields and updates did not match current API | Client missed title/pointsPrice and required expectedUpdatedAt | Canonical field mapping, full editable readback and viewed-version submission; new rewards remain drafts for canonical approval |
| Free/zero-stock handling and successful redirects were broken | Missing/zero values conflated; redirects caught as exceptions | Explicit nonnegative prices, retained zero stock, redirects outside catch |
| Staff invitation required Auth UUID | Merchant input was Auth user ID | Exact email lookup after capability/tenant checks, matching Auth identity, same invitation RPC |
| Partner Settings advertised unsupported PATCH | Only canonical GET route exists | Honest read-only organisation view; updates remain Admin-owned |
| Partner readiness could show inactive/wrongly linked profile as ready | Assessment checked profile ID only | Inactive profiles not ready; mismatched links flagged incomplete |
| Dashboard/analytics could show false emptiness or unmapped series | Read errors swallowed; API uses state/count | Read errors propagate; real counts and operational overview labels |
| Existing web runtime dependency advisories | npm runtime audit | Next 16.4.3 on Partner/Admin, Partner Zod 4.6.6 and compatible transitive fixes; Admin major-version issues remain gated |
| Actual 051 debits could not be refunded by 083 | Full acceptance with 083 installed failed; read-only production definitions match | Proposed migration 085, tested locally only; production remains blocked |

## 3. Implemented corrections and financial boundary

The Partner scanner uses lazy-loaded jsQR to decode camera frames on the device. Camera permission is requested on Start camera, with rear-facing preference. Capture stops the stream, requires an explicit Validate reward action and sends the exact opaque code to the existing `/partners/validate` command. The server remains the sole authority. The operation identity stays constant through a response-loss retry. Success links to the validated collection. Camera denial, unavailable devices, offline state, visibility changes and navigation release/fail closed; no credential is persisted in browser storage or placed in a URL.

Scan and collection controls include English/Dutch copy, status announcements, focused outcome feedback and mobile-sized controls. Full translation of all legacy Partner management pages is still outstanding; this report does not claim complete workspace localization or device visual approval.

Migration [085](../../scripts/085_canonical_debit_refund_compatibility.sql) preserves migrations 083/084 and the deployed 051 debit writer. The 051 writer deliberately records v2 debit transactions with source `adjustment`; 083 required source `redemption` even for those canonical debits. 085 accepts an adjustment debit only when the v2 wallet marker, debit settlement kind, redemption ID, exact ledger receipt binding and fulfilment ID agree. Existing rider, amount, state, authorization, locking, remaining-refund and idempotency checks remain in place. Historical adjustment entries still cannot authorize credits. The financial read model uses the same canonical binding rule.

The migration replaces only two function definitions. It issues no grants and changes no financial rows, operating control or schedules. [Rollback](../../scripts/rollback/085_canonical_debit_refund_compatibility.sql) restores the original 083 definitions and therefore reinstates the known defect. The isolated acceptance run exercises rollback, reproduces the original failed paid cancellation, reapplies 085, rejects a tampered receipt binding and refunds the genuine debit exactly once. **Neither migration nor rollback was applied to production.**

Same-major security maintenance updated Partner/Admin to Next 16.4.3, Partner to Zod 4.6.6 and affected transitive packages within their existing ranges. The final Partner runtime audit has **zero advisories**. Admin's final runtime audit still has **one critical and three high package entries**: MapLibre GL, Zod and the next-cloudinary/url-loader chain. Their suggested fixes cross major versions. These are installed-package findings, not proof that an application exploit path or a deployed vulnerable revision was demonstrated. Major compatibility work or a documented applicability decision remains a release gate; no force update or unrelated UI migration was attempted. See [dependency evidence](../verification/partner-workspace-20261025/dependency-readiness.json), [Next maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) and [Zod maintainer fix](https://github.com/colinhacks/zod/pull/6652).

## 4. QR and PWA operational acceptance

| Check | Result |
| --- | --- |
| Genuine canonical QR payload decodes through jsQR | Passed automated QR generation/decoding test |
| Camera capture, rear-camera request, stream cleanup and explicit validation | Passed DOM tests with media/canvas fixtures |
| Permission denial, late permission resolution after navigation, offline and viewer states | Passed isolated component tests |
| Stable scan retry, server denial and no false validation from malformed response | Passed action/client tests |
| Scan -> validated reward -> explicit handover -> completed | Passed real Partner client -> localhost HTTP -> production API composition -> PostgreSQL |
| Twelve concurrent scans/replay and cross-merchant denial | Passed real independent PostgreSQL transactions |
| Installable manifest/icons and offline-only service worker | Passed asset and worker behavior tests |
| Local compiled routes | Manifest, 192/512 icons, offline page and worker returned HTTP 200; worker served no-store headers |
| Partner production compilation | Passed on Next 16.4.3 with temporary build-only `PLATFORM_API_URL=https://platform-build.invalid/api`; existing Google Fonts fetched with approved network access |
| Real iOS/Android install, permission, camera focus and handover | Not performed; remains a release gate |
| Signed-in deployed browser, visual and assistive-technology acceptance | Not performed; no connected browser session was available |

Install icons can be reproduced from the approved existing app icon with Partner `npm.cmd run generate:pwa-icons`. No new visual identity was generated.

The manifest starts the existing authenticated dashboard and preserves the existing selected-workspace/organisation checks. It is named MOVRR Workspace because the web application serves several canonical workspace types. Registration UI appears only in the Partner shell. The worker caches only the public bilingual offline document, never private pages, API responses, credentials or mutations. It has no background redemption queue. Existing online server authorization remains necessary even when installed.

Implementation references: [Next.js PWA guidance](https://nextjs.org/docs/app/guides/progressive-web-apps), [camera secure-context/permission rules](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [native barcode API availability](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API). These references inform implementation, not device acceptance claims.

## 5. Merchant onboarding and fulfilment

The existing external-account PostgreSQL suite passed **19 tests**, with **8 optional PostgREST/HTTP tests skipped**. It exercised actual provisioning services and canonical SQL for create/read/edit/revoke, explicit multi-membership, invitation creation/acceptance/retry, stale/superseded/expired/revoked tokens, ownership protection, suspended/revoked actors, role boundaries, tenant isolation and preservation of existing Rider/financial history. Auth wire operations are database-backed fixtures; no real Auth account was created. The suite ran in its own disposable database on this task's localhost PostgreSQL container. Its default shared test container was not touched.

The email invitation extension is covered separately for exact normalization, matching Auth email, cross-tenant denial before lookup, ambiguous recipient denial and compatibility with the existing Admin user-ID contract. Identity lookup does not grant membership: the canonical invitation RPC and verified acceptance still decide access. Staff read labels are enriched only after the existing scoped membership query.

Admin's existing physical-location/publication/category tests pass in the regression suite. Production has **10 active reward-partner organisations but 0 published merchant locations**, and **0 current launch attestations**. Counts are operational facts, not evidence that any particular partner is launch ready. Inventory readiness remains false. No locations, merchant users or attestations were fabricated to satisfy acceptance.

Fulfilment acceptance covers paid/free digital delivery, paid/free QR collection, cancellation, expiry, refund recovery in a fresh worker process, duplicate commands, cross-rider/merchant denial, audit failure rollback, durable notifications and reconciliation. Merchant-approved voucher usability, handover/refund terms and real supply remain external requirements.

## 6. Reconciliation and regression evidence

| Verification | Result |
| --- | --- |
| Partner web | 20 suites / 122 tests passed; TypeScript passed; changed production sources lint clean |
| Admin | 88 suites / 954 tests passed; 8 opt-in suites / 105 tests skipped; TypeScript and production compilation passed on Next 16.4.3 |
| Isolated onboarding (separate opt-in run) | 19 passed / 8 skipped |
| Mobile reward regressions | 31 suites / 359 tests passed; TypeScript passed |
| Full PostgreSQL lifecycle regression with 083/084/085 checks | 391 assertions passed, including 12 independent connections |
| Full application acceptance | 249 assertions, 122 HTTP requests, 20 checkpoints, 18 denial/error scenarios |
| Final isolated reconciliation | Zero wallet mismatches, unpaired paid claims, free financial rows, overdue claims, recovery failures or notification delivery backlog |
| Production check | Read-only; Shop Disabled/version 0, ready false, inventory false, zero current attestations; all returned financial health counters zero |

Counts overlap and must not be summed into distinct scenarios. Existing fixture warning logs are deliberate; web tests also emit the pre-existing Next image-quality warning. No EAS build, native release, OTA update or store operation occurred.

Evidence is in Mobile [journeys.json](../../../movrr-mobile/docs/verification/partner-workspace-20261025/journeys.json) and [production-readiness.json](../../../movrr-mobile/docs/verification/partner-workspace-20261025/production-readiness.json). The journey artifact records synthetic ledger/allocation/event/audit/outbox identities, credential hashes, source hashes and migration hashes. It contains no usable production credentials. Source hashes identify uncommitted implementations actually loaded by the runner, alongside repository revisions.

Boundary substitutions remain explicit: sessions/JWT and Admin cookie/MFA identities are fixtures; Supabase wire transport executes actual isolated SQL; Next cache invalidation is inert. Email uses the actual adapter/SDK/template with intercepted Resend HTTP, while the child recovery process doubles email transport. Push transport in this acceptance uses an explicit no-device adapter; the separate lifecycle fixture runs the actual Edge sender with intercepted provider transport. None of this establishes real provider authentication, deliverability, inbox receipt or device delivery.

## 7. Reproduction and remaining launch blockers

From Mobile, create only a task-owned PostgreSQL 17 container with the standard isolated password and port 55439. The runners create/drop their own databases. No production env is loaded by the isolated runners.

```powershell
# Mobile
$env:MOVRR_ACCEPTANCE_OUTPUT_DIR='.tmp/partner-finalization-20261025/acceptance'
npm.cmd run test:shop-acceptance
$env:SHOP_OPERATING_BASELINE='1'
node scripts/test-shop-lifecycle.cjs

# Admin: same task-owned localhost server, distinct disposable database
$env:MOVRR_EMPLOYEE_POSTGRES='1'
$env:MOVRR_ISOLATED_POSTGRES_PORT='55439'
.\node_modules\.bin\vitest.cmd run __tests__/features/identity/externalAccountDomains.postgres.test.ts
```

For the production contract check, use a separately authorized database connection and a repeatable-read **READ ONLY** transaction. Inspect `shop_release_control`, `shop_readiness`, aggregate location/organisation counts and these function-definition predicates; do not call fulfilment commands or record readiness evidence:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT state,version,redemption_enabled FROM public.shop_release_control WHERE singleton;
SELECT pg_get_functiondef('public.wallet_settle_debit(uuid,uuid,text,uuid,text)'::regprocedure)
  LIKE '%v_catalog.points_price,''adjustment''%' AS canonical_adjustment_debit;
SELECT pg_get_functiondef('public.wallet_settle_refund_entry(uuid,uuid,uuid,integer,text,text,text,uuid)'::regprocedure)
  LIKE '%d.source<>''redemption''%' AS original_083_guard;
ROLLBACK;
```

The genuine remaining gates are:

1. Review and authorize the release of 085 and the coordinated Admin/Partner changes, including the tested security updates. Production still has the demonstrated refund incompatibility. Re-run acceptance against the release candidate before deployment; deployment is separate from enabling Shop.
2. Supply merchant-approved vouchers, usable inventory, terms and collection/cancellation/refund operating agreements. Publish verified physical locations where the launch journey requires them.
3. Complete signed-in deployed Admin/Partner acceptance with approved test identities, and real iOS/Android install/camera/offline/restart/accessibility/visual acceptance. No live financial activity is authorized by this report.
4. Finish English/Dutch coverage of the remaining legacy Partner management surfaces; scan, handover and offline flows alone do not establish whole-workspace language acceptance.
5. Complete controlled real email/push provider and inbox/device receipt acceptance and the remaining canonical readiness attestations. Verify actual production HTTPS origins and Platform API configuration; the build-only placeholder is not a deployment setting.
6. Resolve or formally assess the remaining Admin runtime dependency advisories before release; the current audit still includes a critical MapLibre entry.
7. Obtain explicit activation authorization only after those gates pass. Existing separate Mobile release requirements remain in force.

## 8. Decision

**NO-GO for enabling public redemption.** The local corrections and isolated operational evidence are reviewable, but the live refund contract, merchant supply/readiness, deployed signed-in/device acceptance, full management localization, remaining Admin dependency advisories and provider gates are still open. The public Disabled state and production financial records were preserved.
