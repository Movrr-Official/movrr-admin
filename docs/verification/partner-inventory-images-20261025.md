# Partner inventory thumbnail read — 25 October 2026

Additive, read-only follow-up to deployed Admin source `74f0738825d4b6f067eca3ff6a522679e809cee0` and documentation baseline `fa808a02fdfcce392f6ce300e46ded459bd1bee8`.

`listFulfilmentResources` now exposes optional `thumbnailUrl` from the resource's existing catalog relationship. Catalog ownership is resolved through `reward_partner.organisation_id`, the canonical authority. The image is withheld when that organisation differs from the inventory resource's organisation. Existing resource filtering, capability checks and availability-count RPC are unchanged; no financial command, migration, Admin layout or merchant record changes.

Verification: four suites / 73 tests passed (`partnerInventoryImages`, `partnerWorkspaceContracts`, `platformIngress`, `platformApiClient`); TypeScript and production build passed. A zero-row authenticated production Supabase SELECT verified the exact nested PostgREST relationship with HTTP 200 and no returned merchant rows. Tests cover own, foreign and missing catalog images and read failures.

Migration 085 remains unchanged: Git-blob SHA-256 `c45e511cc771382b34dec6d3306343e17a9e66a22f33c415299ccb961896fb24`. No migration was applied or replayed in this follow-up.

Partner before/after screenshots, fixture boundaries, form and workspace tests, and the full-repository App lint limitation are recorded in `movrr-app/docs/verification/partner-workspace-polish-20261025/README.md`. Only the changed App files pass lint; do not claim its complete lint command is green.

This follow-up is not deployed. After exact-revision approval, deploy Admin first, then Partner. Roll back the relevant application alias on inventory read errors, incorrect form submission, unauthorized workspace access or rendering regression. Preserve the existing deployed rollback targets; do not replay migration 085. Public Shop remains Disabled. No production financial, inventory, merchant identity or role mutation was performed.
