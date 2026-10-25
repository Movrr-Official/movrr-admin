# Authorized Partner production rollout - 25 October 2026

The owner explicitly authorized the exact 085/Admin/Partner candidate. **All deployment steps completed. Server, schema, asset and offline acceptance passed; complete signed-in Admin/merchant acceptance remains open.** No production financial command, synthetic identity/inventory, Shop activation, EAS/OTA/store action or permission change was performed.

## Deployed revisions

| Target | Source | Deployment | Production |
| --- | --- | --- | --- |
| Admin | 74f0738825d4b6f067eca3ff6a522679e809cee0 | dpl_H7qu5RTahSCkYyM7R2TYCCzADx6g | https://admin.movrr.nl |
| Partner | 28e01614d3ec9d2ee75bf5a87c12be9bc8e369ee | dpl_2ViChyESsubMoQN1UBy8TTVXNZy6 | https://app.movrr.nl |

Both READY aliases and Git SHAs were verified through Vercel; functions run in fra1. Existing firewall, SSO/deployment protection, project settings and production origins are unchanged. Git-triggered main deployment remains disabled. Named non-secret production bindings confirm the approved Supabase project, real Admin API origin, app origins and mocks=false. Full environment export was rejected by automated approval; metadata and targeted non-secret reads completed the configuration check without that export.

## Migration and preservation

[Applied receipt](migration-applied.json): canonical journal version **20261025150000**, name **085_canonical_debit_refund_compatibility**, SHA-256 **c45e511cc771382b34dec6d3306343e17a9e66a22f33c415299ccb961896fb24**. Journal statement bytes and installed bodies were read back in a fresh read-only transaction. A PostgREST schema reload notification was issued.

082/083/084 journal checksums match their reviewed files. Before replacement the two target bodies matched the exact approved rollback. The apply transaction used the canonical migration lock, short lock timeout, migration-journal lock and SHARE locks over the 167 public tables. It rejected concurrent drift, replaced only the two approved bodies and inserted the exact source/rollback into the established journal in that transaction. OIDs, owners, SECURITY DEFINER/search_path, execution ACLs, all unrelated function definitions, RLS, triggers and table grants were unchanged. All 167 public-table fingerprints were identical inside the apply transaction. The first apply attempt rolled back before writes because the local comparison helper distinguished PostgreSQL Result arrays from parsed JSON arrays; normalized comparison corrected that tooling issue and the exact migration was then applied once.

[Final financial integrity](financial-integrity.json): all 14 financial/fulfilment/catalog/location table fingerprints remain unchanged. Wallet mismatches, unpaired paid claims, free financial entries, pending delivery and delivery failures are zero. Only the existing scheduler/worker heartbeat tables changed subsequently; other public rows, organization/membership controls, account-deletion and Community Safety remain unchanged. No refund/cancel/settlement RPC was invoked as a production test. Idempotency and 051 compatibility are established by exact installed source/ACL verification plus the retained isolated 392/256-assertion candidate evidence, not by fabricating live financial activity.

## Recovery

[Backup evidence](backup-verification.json): fresh read-only PostgreSQL 17 custom archive of public application schema/data and canonical journal, 2,382,360 bytes, readable archive with 2,469 objects. It is private local recovery material, never committed or uploaded. Function definitions/ACLs and deployment baselines are retained with it in ignored `.tmp/partner-production-20261025`. Archive inspection is not a full database restore rehearsal; provider PITR and Storage object bytes are not claimed. The separately verified canonical 085 rollback source exactly matched the pre-install target bodies and remains available.

[Deployment record](deployments.json) captures actual rollback IDs: Admin dpl_91fW9Py6MWJzvSiFPbsLr7idrusu; Partner dpl_H9zGwPGVYryNPBuadumTtkEzeLuj. Restore captured application deployments, Partner first, if a demonstrated application regression requires rollback. Keep 085 for UI-only rollback. Its SQL rollback requires its own demonstrated defect and authorization because it restores the known 083 refund incompatibility. Never reverse or replay historical ledger records.

## Production acceptance and limits

- [Admin HTTP acceptance](admin-acceptance.json): real application-level JSON 401 denials on scoped Partner profile/staff/reward/collection/history and financial reads, plus empty unauthorized validation/handover requests. No command reached financial code. Admin pages and map worker files retain the existing login boundary; anonymous worker fetches redirect to sign-in, so no authenticated worker-body or physical GPU acceptance is claimed.
- [Partner HTTP acceptance](partner-acceptance.json): protected management routes redirect to sign-in, manifest/icons return 200, deployed service worker/offline bytes match the exact Git blobs and worker headers prohibit stale caching. Production API URL is https://admin.movrr.nl/api.
- [Real public-origin PWA browser check](pwa-browser-acceptance.json): isolated anonymous Chromium at a mobile viewport registered and controlled the actual deployed service worker. Its only cached URL is /offline.html; offline scanner navigation returns that form-free fallback. No session/private data is cached. [Offline image](production-pwa-offline-mobile.png). This is not installation or camera acceptance on a physical iOS/Android device.
- Existing signed-in Partner session was observed rendering the deployed scanner, inventory and pending collections. No merchant records were edited and no real voucher was scanned. The Admin session inspected in another profile was expired and denied entry; manual sign-in is pending. Complete real-session EN/NL, mobile viewport, role/cross-tenant and map operational checks remain incomplete: the Windows helper repeatedly failed to activate the captured window, and the browser connector could not find DevToolsActivePort. Existing authorization sources and DB controls are unchanged, with real cross-tenant denials established in the isolated candidate evidence; these are not relabeled as authenticated production tests.

## Follow-up requested during acceptance

The owner requested desktop-to-phone scanning UX and online enterprise practice research. Separate verified Partner candidate **97da8f1528f1cba7a8dd5474808b05b8388efa61** implements Continue on your phone with a QR/copy-link, normal phone authentication and phone-only camera presentation. [Research, rendered evidence and 23-suite / 136-test verification](../../../../movrr-app/docs/verification/partner-phone-handoff-20261025/README.md). It is not deployed under the original exact-SHA authorization; specific follow-up approval is pending. The production revision in this record remains 28e0161 until an authorized follow-up deployment is recorded.

## Launch readiness

Shop remains **Disabled, version 0, redemption_enabled=false**. The approved software is deployed, but full signed-in operational acceptance and the requested phone UX follow-up are not closed. Genuine merchant-approved supply/terms, published locations, staff readiness, physical-device QR/PWA acceptance, real notification delivery and launch attestations remain separate public-activation prerequisites. No count of existing test-looking inventory in the observed workspace is treated as approved merchant supply. Public redemption remains **NO-GO**.
