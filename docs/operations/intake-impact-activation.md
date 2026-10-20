# Account-deletion intake and approved impact: 20 October 2026

Account-deletion intake remains **Disabled, operating version 0**. The approved environmental methodology is already installed and reconciled in production. This session performed no production database writes, account requests, deletion, financial transactions or Mobile changes. X01–X17 were not repeated.

## Deletion activation decision

[Fresh production preflight](../verification/intake-impact-activation/deletion-readiness.json) used a read-only transaction against `kzdvunpuxaxlphqvmzxw` at 16:23 UTC. The deployed `set_account_deletion_intake` body matches migration 060. It requires the existing Security capability, active account, configured MFA, a security administrator, expected operating version, reason and operation UUID. It atomically records actor, previous/new state, version and a retry receipt only after all prerequisites pass.

The existing enablement prerequisites fail:

- Catalog digest, catalog review reference, catalog verification, barrier verification and disposition verification are absent.
- Policy 1 is technically approved, with legal, Finance and partner statuses pending. Required `personal.erase`, `external.erase`, `receipt.complete` and `restore.suppress` rules have pending approvals, no approval references and `account_deletion_rule_allowed=false`.
- `receipt.delivery` also lacks approvals. All 13 retention categories are pending, without approved periods, lawful bases or start events, including financial/equipment evidence, deletion receipts, receipt access and restore suppression.

**Smallest correction:** complete the existing policy/readiness records with genuine review evidence and applicable approved disposition/retention definitions. Reuse the accepted technical evidence where applicable; do not invent approval references or choose retention periods merely to make the gate pass. Then rerun `node scripts/verify-deletion-intake-readiness.cjs` and use the existing Admin command in a genuine authorized MFA session. No replacement intake, fallback, new role, Google Workspace inspection or staging prerequisite is needed.

No activation was attempted after these failures. There is **no activation audit record**, no actor/state transition and no intake command receipt. State remains Disabled/version 0; policy version remains 1. Current counts are zero requests, zero receipt credentials and ten retained lifecycle audit rows. All production checks were read-only, preserving those records and existing obligations.

The existing web and Mobile sources send the same `delete-account` request body (`policyVersion: 1`, acknowledged disclosure), and use the canonical version-1 receipt/lifecycle. Edge source binds new requests to the authenticated Supabase identity and recent authentication/provider proof. The installed lifecycle reader requires both request ID and owning user ID; delivered receipts require an unexpired hashed secret and approved delivery policy. Direct rider/anonymous execution of privileged request/read RPCs remains denied. The barrier serializes duplicate requests against the user guard and operating-state changes. Request retries reuse the job; approved receipt access can rotate its secret rather than create a second job.

Admin review sources retain existing monitor and Finance/Operations/Compliance/Security capability boundaries. Focused tests pass: **44 isolated PostgreSQL intake assertions**, **49 Admin deletion/authorization/recovery tests**, **15 Mobile request/receipt tests**, and **four web privacy boundary tests**. These establish the tested contracts; an authenticated live request/review browser journey was not exercised, and no test production request was created.

Irreversible execution remains separately disabled (`managed_resources_execution_enabled=false`). The deployed authorization function still requires a current fenced claim, exact per-case Security proposal, independent approving reviewer, no unreleased hold and approved disposition rules. Enabling intake cannot satisfy these requirements. Existing financial/equipment/legal obligations and deletion approvals were not changed. `privacy@movrr.nl` remains the founder/co-founder monitored channel, as confirmed by the owner.

## Environmental production verification

[Fresh SQL/API reconciliation](../verification/intake-impact-activation/impact-production.json) passes **35 read-only assertions**. Active methodology is `MOVRR-NL-CAR-COMPARISON-2026-v2`: **0.190 kg CO₂e/vehicle-km WTW**, Netherlands 2026 edition, reference data 2025. The [factor source](https://co2emissiefactoren.nl/factoren/2026/38/147/personenvervoer-auto-gemiddelde-auto-brandstofsoort-onbekend/) confirms 0.142 TTW + 0.048 WTT = 0.190 WTW. This is an equivalent-distance average-car comparison, not actual avoided emissions.

Migration 059 is retained unchanged. Already-installed additive migrations 061/062/063 provide the immutable registry, verified historical coverage independent of reward settlement, and precision-preserving daily buckets. All four local normalized checksums match the production migration journal. All five installed impact function bodies match their latest migration sources and contain no active `0.180` factor. Historical migrations and immutable methodology v1 remain evidence; v2 is the sole active calculation contract.

`get_impact_ride_evidence` selects completed rides with backend `verification_result.status=verified`, positive finite `total_distance_meters` and nonfuture completion timestamps. It uses each session once, including historical records and distinct sessions on repeated routes. Assigned route distance, reward metadata, bonuses and settlement receipts do not supply cycling distance or eligibility. SQL aggregation precedes response pagination; display rounding occurs after aggregation. Reporting days use Europe/Amsterdam.

Live independent SQL, canonical aggregate SQL and Supabase RPC API agree on **21 rides / 42.86987 km / 8.15 kg CO₂e**. The 30-day daily-bucket aggregate independently agrees on **7.3281 km / 1.39 kg CO₂e**. Admin distance/performance readers call `get_impact_summary`; trends call `get_impact_daily`; web `/riders/me/impact` forwards the authenticated client to `get_lifetime_impact_summary`, which binds the rider through `auth.uid()` and delegates to the same summary. Existing Mobile output names are preserved, including `co2_saved_kg`; no Mobile change is necessary.

Focused validation: **32 real PostgreSQL impact assertions**, including 1,501 sessions on the same route, historical rides, unverified/rejected/incomplete/invalid exclusions, ownership, method immutability, aggregation/rounding and preserved reward rows. **23 Admin projection/participation/API authorization tests**, **25 web rider/privacy tests**, and Admin TypeScript checking pass. The projection fixture now uses 0.190 and verifies totals above the default 1,000-row API limit.

Production Admin revision `16a5951c55e3394f705f48ecc0d4cd7fc46685c7` (`dpl_2JPKh1PTkvHjPwDVVPGcMKhn2V3U`) and web revision `e5cf27b58199f2f274069503d4e35ce8ef7ed99e` (`dpl_DCANL9GvEimQYDn8SKY4L6WTv2cB`) were confirmed READY via Vercel metadata. Existing primary impact labels explicitly distinguish verified cycling distance and the car comparison. One residual Admin settings description saying “CO₂ savings factor” was corrected; its wording-only rollout is recorded alongside this report. Authenticated visual acceptance of the impact page remains outstanding; SQL/API reconciliation does not imply that browser journey was performed.

Environmental `co2_50` remains catalog-visible/upcoming, with null `rule_type` and exclusion from the award function. No environmental award was invoked or activated. No Wallet, ledger, ride-verification or historical financial records were written. Prior rollout preservation evidence remains in [the original production record](../verification/enterprise-alignment/production-rollout.json).

No new migration or material backend change is necessary or pending deployment approval. Public Shop redemption remains **Disabled**. No EAS, OTA, store, native or Mobile service work occurred.
