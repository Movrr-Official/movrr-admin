# Partner media and controls production rollout ? 25 October 2026

The owner explicitly authorized Admin 19790c4 and Partner bc16e2c, then separately authorized Partner-only contrast correction 43f11fc. All were deployed in that order. Final runtime: Admin 19790c4 and Partner 43f11fc. The dark workspace-label acceptance exception is resolved and verified in the existing signed-in Chrome session.

| Runtime | Source SHA | Deployment ID | Production URL |
| --- | --- | --- | --- |
| Admin | 19790c43a92b9ba11996a8e23bd8cb091397855c | dpl_n2M4CuqU8hCcv4Na3nKZJQJiDqCJ | https://admin.movrr.nl |
| Partner | 43f11fcec679f145c7fe8d29ced2085d16d3edc8 | dpl_B823jSAiYWG9n8NRsX9NYnPKUXML | https://app.movrr.nl |

Admin was deployed and accepted before Partner. Both builds reached READY, matched the authorized Git source metadata, existing project/region fra1 and custom domain. Existing firewall and authentication protection settings were preserved. Production Partner API remains https://admin.movrr.nl/api, with mocks off and the authorized Supabase project. No production settings were changed.

## Acceptance

- Fresh SELECT-only preflight and post-deployment checks: 14 financial/catalog/inventory fingerprints unchanged; all public function definitions/owners/ACLs, RLS/policies/table grants and migration journal unchanged. Wallet mismatches, unpaired paid claims, undelivered outbox and delivery failures are zero.
- 085 remains journal version 20261025150000, SHA-256 c45e511cc771382b34dec6d3306343e17a9e66a22f33c415299ccb961896fb24. It was not reapplied. Full journal hash matches the prior verified deployment, preserving 082/083/084. The retained recovery archive checksum matches 280e93ab32de9aaffde5b1bd449a8a90d5b18452505cbbc7b2f7ed745e37a5a0.
- Unauthenticated API reads and canonical validation/handover requests return 401 JSON. New catalog multipart POST/PATCH requests return 401 before parsing or storage writes. Signed-out Partner routes redirect to authentication.
- Existing native Chrome sessions: Admin overview, fulfilment overview and Partner Operations render with existing authorization. Partner overview, actual merchant reward images/status banners, Create Reward image field and existing reward editor image/replace/remove controls render. No reward/media form was submitted.
- Flag menu renders UK/NL choices and selected check; outside click dismisses it. Recent-notification preview loads the real empty inbox and View all opens the existing notifications page, without marking messages read. White CTA text is visible.
- Dutch Create Reward form and workspace picker render correctly; re-entering the same authorized workspace retains Dutch. Original English preference was restored and observed. No roles/memberships were modified.
- A previously verified foreign-merchant reward edit URL returns Page not found with no foreign details or editor. Isolated tests separately cover foreign ownership and stale-version denial before storage.
- Desktop Scan shows Continue on your phone with the existing app link/QR; it does not request a desktop camera. No voucher was scanned, validated or fulfilled.
- Manifest, icons, flags, SW and offline page return 200; flag/SW/offline hashes match candidate source. Anonymous browser with a mobile viewport verifies SW control, offline navigation fallback, zero offline forms and only the public offline.html cached. No private data caching.

## Resolved acceptance exception and remaining operational gates

The deeper CTA green also affected two dark workspace-picker text labels. Partner-only 43f11fcec679f145c7fe8d29ced2085d16d3edc8 restores their established light accent without changing white buttons, authorization or API behavior. Production build and four light/dark desktop/mobile actual-route accessibility checks pass. The owner subsequently authorized this exact correction. Deployment dpl_B823jSAiYWG9n8NRsX9NYnPKUXML is READY, source/alias verified. A fresh signed-in workspace-page reload confirms both labels readable; re-entering the authorized workspace confirms white primary-button text remains intact and English retained. Final read-only checks at 2026-10-25T17:32:12Z match both rollout windows; Admin remains at its approved deployment. See movrr-app/docs/verification/partner-header-and-images-20261025/workspace-contrast.json and captures.

Shop remains Disabled/version 0/redemption_enabled false. No merchant identities, inventory, rewards, media uploads, redemptions, refunds or financial transactions were created by acceptance. Migration, Community Safety, account deletion, Rider Mobile and ride tracking remain unchanged. Browser-emulated PWA checks do not establish physical-device acceptance. Real merchant supply, collection locations/staff, launch attestations, iOS/Android camera/install/focus and legitimate merchant upload acceptance remain separate public-activation prerequisites. Public redemption remains NO-GO.

## Recovery

Captured prior deployments: Partner dpl_9eiApXd8jaEXMZrSEkGovrJ76MNV (9c2db98), Admin dpl_3gKnSPdcW8RqgT6w9XaZi2wu669A (6c825a5). If rollback becomes necessary for an authorization, data-integrity, authentication or critical interaction failure, restore Partner first and Admin second, preserving legitimate records/media and Shop Disabled. Leave 085 installed; no financial replay or SQL rollback is authorized here. Recovery/private receipts remain in ignored task-specific production audit storage.

**Verdict: DEPLOYED & VERIFIED for the authorized software rollout. No software acceptance exception remains from this rollout. Public redemption stays Disabled and NO-GO until the separate merchant/device/operational gates are fulfilled.**
