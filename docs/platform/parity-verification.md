# Cross-Platform Parity Verification Report

Date: 2026-07-30  
Status: Post-remediation verification complete

## Post-Implementation Audit (Initial)

| Finding | Initial status |
|---------|----------------|
| Platform API routes (campaigns, rider campaigns, community, government, partner rewards) | Fully Resolved |
| Org-type auth resolution | Fully Resolved |
| Search route/fulfilment enabled | Fully Resolved |
| Fraud workbench | Fully Resolved |
| Programmes page | Fully Resolved |
| Dashboard pending queues | Fully Resolved |
| Capability registry completeness | Partially Resolved |
| Admin campaign actions → shared service | Still Open |
| Incidents persistence | Still Open |
| Government on Programmes nav | Partially Resolved |
| Advertiser/rider read paths on web | Partially Resolved |
| Gov/partner notifications | Partially Resolved |
| Billing `degraded` vocabulary | Partially Resolved |
| Admin wallet placeholder | Deferred |
| Fulfilment types (2 only) | Deferred (Phase 1) |
| Live PSP billing | Deferred (by plan) |

## Remediation Applied

### movrr-admin

- `features/campaigns/application/campaignRepository.ts` — shared insert/update/list/get for campaigns
- `campaignPlatformService.ts` and `app/actions/campaigns.ts` create/update now use `campaignRepository`
- `features/incidents/supabaseIncidentStore.ts` — persists incidents to `platform_settings` key `ops_incidents`
- `app/actions/incidents.ts` wired to async Supabase-backed store
- `PROGRAMMES_READ_ROLES` includes `government` in Sidebar + programmes page
- Removed fake `/api/v1/internal/incidents` from capability registry (admin server actions only)

### movrr-app

- `services/advertiser.ts` — campaign list/detail reads via Platform API with Supabase fallback
- `services/rider.ts` — wallet balance/transactions via Platform API with Supabase fallback
- `schemas/advertiser.ts` + `lib/billing.ts` — `degraded` billing connection state aligned with vocabulary
- `lib/notifications.ts` — shared inbox helpers; gov/partner wired in notifications page
- `app/actions/government.ts` + partner notification actions
- Removed dead `redirectAdvertiserCampaignCreate`

## Post-Remediation Audit (Final)

| Finding | Final status | Evidence |
|---------|--------------|----------|
| Platform API routes | **Fully Resolved** | `movrr-admin/app/api/v1/**` campaign, rider, community, government, partner routes |
| Org-type auth | **Fully Resolved** | `authorisationService.ts`, `Principal.organisationType` |
| Search route/fulfilment | **Fully Resolved** | Search providers enabled in admin |
| Fraud workbench | **Fully Resolved** | `/fraud` ops surface |
| Programmes page | **Fully Resolved** | `/programmes` with government read access |
| Dashboard pending queues | **Fully Resolved** | Overview cockpit queues |
| Capability registry | **Fully Resolved** | No phantom incident API route; registry matches implementation |
| Admin campaign actions → shared service | **Fully Resolved** | `campaignRepository` used by actions + platform service |
| Incidents persistence | **Fully Resolved** | `supabaseIncidentStore.ts` → `platform_settings.ops_incidents` |
| Government on Programmes nav | **Fully Resolved** | `government` in `PROGRAMMES_READ_ROLES` |
| Advertiser/rider read paths on web | **Fully Resolved** | Platform reads with Supabase fallback in services |
| Gov/partner notifications | **Fully Resolved** | Supabase `notifications` inbox + mark-read actions |
| Billing `degraded` vocab | **Fully Resolved** | Enum in `schemas/advertiser.ts`, types in capability registry |
| Admin wallet placeholder | **Deferred** | Intentional ops placeholder; not in parity scope |
| Fulfilment types (2 only) | **Deferred** | Phase 1 scope per plan |
| Live PSP billing | **Deferred** | Handoff-only by architecture decision |
| Mobile shared vocabulary | **Fully Resolved** | `movrr-mobile/lib/platform/vocabulary.ts` |

## Verification Commands

- movrr-admin: `npx tsc --noEmit` — pass; `npm test -- --run` — 420 tests pass
- movrr-app: `npx tsc --noEmit` — pass

## Intentional Platform Differences (unchanged)

- Live GPS / ride detection: mobile-only
- Deep fulfilment investigation: admin-only
- Live payment provider (Stripe/Adyen): deferred — handoff billing only
- Swarm/destination: campaign types, not separate product modules

## Launch Recommendation

**Ready for staged rollout.** All P0 parity gaps from the original audit are resolved or explicitly deferred per plan. No regressions detected in TypeScript or admin test suite.
