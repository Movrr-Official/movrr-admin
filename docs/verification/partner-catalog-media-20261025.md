# Partner catalog media transport ? 25 October 2026

Follow-up to Admin 6c825a5 and Partner 9c2db98. Not deployed by this source change.

Partner POST/PATCH catalog routes now support multipart as well as existing JSON. Canonical platform authentication and rewards.manage authorization precede parsing. Merchant binding and reward ownership remain server-resolved; caller-supplied image URLs, partner IDs and unknown fields are rejected by the existing strict schemas. Byte-signature/type validation reuses rewardCatalogImageShared. Partner files are capped at 3 MiB to fit production request limits; storage policies remain unchanged.

Image uploads reuse immutable reward-catalog paths and server-only storage helpers. Updates attach or clear thumbnail_url only through shop_save_catalog with p_expected. Ownership and viewed-version checks precede upload; a rejected canonical save cleans only its new upload. Previous media is retained to avoid deleting gallery/shared references. No new migration, financial command, role or Admin UI change.

Creation validates before creating the normal draft. Because the canonical command allocates its ID, image attachment follows draft creation using the returned version. Failed attachment preserves that draft and returns imageUploadFailed so Partner redirects to edit with a retry message instead of creating another draft. Storage exceptions with an ambiguous catalog save are not followed by destructive cleanup.

Evidence: TypeScript/configured lint, production build; 27 tests in partnerRewardImageUpload, partnerCatalogImages, partnerCatalogPreconditions, rewardCatalogImageShared and catalogMediaConcurrency. Tests cover binary parsing, spoofed/oversized file rejection, foreign ownership and stale-version denial before storage, canonical metadata/image save, new-object cleanup on conflict, removal without deleting shared assets and recoverable draft creation.

Partner visual evidence and reproducible isolated fixtures: movrr-app/docs/verification/partner-header-and-images-20261025/. Tests use isolated provider/storage doubles; no production upload, merchant/reward creation or financial mutation was performed. Deployment order: this Admin commit first, then matching Partner commit, after exact-candidate release authorization. Keep Shop disabled; do not reapply migration 085. Rollback Partner to 9c2db98 first, then Admin to 6c825a5, retaining legitimate records/assets.
