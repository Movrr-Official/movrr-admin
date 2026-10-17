# Campaign geography retirement — execution package

**Prepared only. Neither migration nor retirement has production execution approval.**

Production Supabase project: `kzdvunpuxaxlphqvmzxw`.
Campaign: `34a54a90-a399-46b7-b446-9d4e57db0759` (Beach Promenade Promo).
Route: `839cb18b-c452-49c5-832a-1d8d6acbe79b` (Scheveningen Promenade Run).
Operation: `2eabec27-003b-47a4-99a8-8d0090000cfe`.

## Scope and evidence

`manifest.json` pins the exact 80 IDs. `original-zones.json` exports all original fields, full-precision EWKB and geometry MD5s. These are campaign operating polygons, not rider GPS traces. No rider identity or private credential is included. The source investigation proved all 80 valid SRID 4326 MultiPolygons exactly equal 50 m buffers around 80 consecutive pairs of linearly interpolated stops. No approved replacement exists. Retirement keeps their IDs, names, campaign IDs, creation dates and geometry unchanged.

The campaign is completed, with one assigned campaign assignment and one completed rider-route. Its route remains pending and has 81 historical stops. There are no matching ride sessions, tracking records, reward transactions, zone visits or Hot Zones. Preserve these records/states; do not cancel the residual assignment implicitly. The 56 zones belonging to the other two campaigns remain current and unchanged.

## Migration prerequisites and deployment order

1. Obtain explicit approval for migration `scripts/053_campaign_geography_retirement.sql`. Production inspection found PostgreSQL 17.4, PostGIS 3.3.7 and the latest migration `20261017100500` (held ride recovery infrastructure). Required existing contracts are `campaign_zone`, `campaign_zone_geojson`, `route`, `route_stop`, its enabled `trg_validate_route_stop_in_campaign_zone`, `ride_session`, `route_tracking`, `rider_route`, `auth.users` and the deployed `platform_audit_record` contract. Do not overwrite a concurrently changed prerequisite. Check the production migration ledger again; reserve/register version `20261017160000` only when this approved migration is applied through the normal migration procedure.
2. Apply the reviewed migration in a transaction only after that approval. It adds nullable metadata, an all-or-none constraint, a current-area index, an atomic read RPC, a server-only historical projection, audited evidence-protection triggers, terminal-state protection and new-start/current-stop guards. **It retires zero rows and changes no original geometry or existing campaign/route/assignment/ride data.** Confirm registration, PostgREST schema reload and migration checksum. A failed migration rolls back as a unit. Do not run an infrastructure rollback that drops retirement data; support is additive and must remain during a data rollback.
3. Deploy the verified Admin/backend source only after separate deployment approval. Admin current consumers exclude retired rows by default. Authorized history uses `campaigns.read` plus the service-only projection; retired rows are labelled, read-only and cannot be deleted. Original geometry is still inspectable. Failed history reads show a genuine error/Retry rather than an empty list.
4. Release/adopt the Mobile source through an independently approved release workflow. `get_campaign_geography` schema version 1 returns current polygons and retirement state in one MVCC snapshot. Missing support or invalid payloads fail closed; no legacy geometry fallback is used. The versioned cache key excludes old polygon-only data. A known retired response survives refresh failure without resurrecting old polygons. Foreground/focus refresh and normal stale-time handling remain in use. Tracking changes presentation only and never rewrites frozen ride-start reward configuration.
5. Verify API access, historical permissions, cache refresh, Admin visibility and physical Android/iOS Campaign Details/Explore/tracking presentation. New clients distinguish retired, empty, cached and failed data. Before migration, their new RPC is unavailable and they show a request failure; therefore migration precedes consumer deployment. No EAS build, OTA or Admin/backend deployment is part of this source preparation.
6. Obtain separate explicit approval for the exact 80-row retirement transaction below. Re-run `preflight.sql` immediately before it. Any baseline drift requires review, not automatic broadening of scope.

### Push/deployment hold

`vercel.json` sets `git.deploymentEnabled.main=false`, so pushing the approved source does not automatically deploy the migration-dependent Admin code. Existing CI builds/tests are not deployments. Leave this hold in place until deployment is authorized and the migration is installed. Its removal or an explicit deployment is a separate approved release step. [Vercel documentation](https://vercel.com/docs/project-configuration/git-configuration).

## Read and authorization contracts

- `campaign_zone_geojson` preserves its existing columns/owner/grants and excludes `retired_at IS NOT NULL`.
- `get_campaign_geography(uuid)` is STABLE, SECURITY INVOKER, fixed search path, with read execution granted to the existing anon/authenticated/service roles. Response: `schemaVersion:1`, `state:available|retired|empty`, `retiredCount`, `revision`, `checkedAt`, `zones:[{id,name,geojson}]`. Partial retirement returns only current zones with state `available` and a positive retiredCount. A fully retired campaign returns no current polygons.
- The original base-table SELECT policy/grants remain unchanged. This intentionally retains the existing historical-membership boundary; raw base access was already permitted by its deployed policy. No new public historical privilege is introduced. The new `campaign_zone_history_geojson` projection is explicitly unavailable to anon/authenticated and readable only by service_role/owner; the Admin server action enforces `campaigns.read` before using it.
- Retirement adds no rider mutation RPC or generic Admin retirement button. Existing Admin zone editing cannot set the new metadata; retired canonical fields/deletion are rejected in the database even if a caller bypasses the UI. Inserts into a campaign that retains retired zones cannot implicitly substitute new geography.
- Metadata changes require a real, approved operator identity in `movrr.geography_actor_id`. They append one `platform_audit_record` per zone using the existing principal/actor contract. The execution operator must independently verify the supplied auth.users UUID is the acting administrator with `campaigns.write`; the setting is an audit identity, not an authorization token. Execution requires the trusted database operator role, not a browser or rider session. Existing RLS and account-deletion write barriers are not disabled.
- Completed campaigns cannot leave their historical lifecycle through a paused/draft detour. A fully retired campaign cannot become active/confirmed. New campaign ride starts reject unavailable/retired campaigns and mismatched route/assignment identities. Existing ride resume/completion and frozen configurations are not revalidated or rewritten. Current route-stop validation rejects terminal campaigns/retired polygons. Historical `is_point_in_campaign_zone` and all reward/settlement functions remain unchanged.

## Exact guarded retirement

Use a fresh operator connection whose credentials/hostname match the pinned production project; do not infer the project from the generic `postgres` database name. Export a fresh original-row backup and retain the operator approval and execution receipt in the controlled operations record. Compare the export against the 80 pinned IDs/EWKB hashes/names/dates.

Run `preflight.sql` with read-only access after migration installation. Expected: 80 original rows, all original evidence matching, current=80, retired=0, campaign completed, assigned campaign assignments=1, completed rider-routes=1, sessions/tracking=0. Confirm 81 route stops, zero target Hot Zones/rewards/visits, and 56 other zones before granting execution approval.

Only after explicit owner approval, in a trusted operator session with `ON_ERROR_STOP` enabled:

```sql
SET movrr.geography_execution='retire:2eabec27-003b-47a4-99a8-8d0090000cfe';
SET movrr.geography_actor_id='<verified acting administrator auth.users UUID>';
-- Then execute retire.sql in the same connection.
```

`retire.sql` is self-contained and defaults to aborting without the approval setting. It checks migration registration, the exact IDs/hash/name/date baseline, completed lifecycle, route/stop/assignment states, absence of all target ride/reward/visit/Hot Zone evidence, and 56 unrelated zones/three campaigns. It uses a serializable transaction, bounded locks/timeouts and a target-campaign lock that serializes with new-start guards. It updates only the 80 retirement-metadata tuples. Any failed assertion rolls back the whole transaction.

Before committing it verifies byte-identical canonical evidence, current/history read agreement, all protected existing table fingerprints, and exactly 80 appended audit records. It fingerprints the original campaign, zone, route, stop, assignment, ride, tracking, visit, reward and audit records and existing ride_reward/ride_time/wallet tables without exporting their private contents.

| Item | Before retirement | After retirement |
|---|---:|---:|
| Target base rows / original geometries | 80 / 80 | 80 / 80, byte-identical |
| Target current-area response | 80 | 0 |
| Target retired count | 0 | 80 |
| Authorized historical rows | 80 | 80 |
| Other current zones | 56 | 56, unchanged |
| Campaign rows / route / stops / assignments | Existing values | Unchanged |
| Existing rides/rewards/settlement/audit evidence | Existing values | Unchanged |
| New audit records | 0 for this application | 80 retirement records |

Store the successful transaction output, new revision, geometry checks, audit IDs and deployed client versions. Re-query from a fresh connection and test the actual API. Do not claim the native visual defect resolved until physical rendering confirms it.

## Guarded rollback

Rollback restores known obsolete geography to current responses; it is an incident measure requiring separate approval, not reactivation or replacement. Keep the additive support installed. Verify the same campaign is completed, exact 80 geometries remain intact and were retired by this operation, and all ride/relationship baselines remain unchanged. Then set `movrr.geography_execution='rollback:2eabec27-003b-47a4-99a8-8d0090000cfe'` and the verified operator identity in one fresh connection and execute `rollback.sql` with `ON_ERROR_STOP`.

Rollback clears only the three retirement metadata fields on those exact 80 rows, verifies current=80/retired=0/history=80 and original evidence unchanged, and appends 80 rollback audit records. Earlier retirement audit records remain intact. It does not change the completed campaign, assignments, route/stops, original geometry, historical membership or any financial result.

## Older clients and remaining risks

Older online clients using the current GeoJSON view receive no retired areas but may show their ordinary empty-state wording. An offline older client cannot learn a server retirement until it reconnects; no source change can retroactively erase its installed cache. Completed-campaign/new-start server guards remain authoritative. Confirm client adoption/cache refresh before the operational retirement if explicit retired wording is required everywhere.

This is a capability/migration plus a separate data operation. Applying source alone does not retire the campaign geography. Pending/active ride or assignment drift aborts the prepared operation. Stale persistent source exports, modified migration prerequisites, audit actor deletion, write-barrier holds, lock timeouts, missing client versions or unrelated baseline changes require review. Do not weaken validation, disable existing guards, invent replacement geometry or run migration/data files automatically from CI/build/deployment hooks.

## Local validation

Run `node scripts/tests/campaign-geography-retirement.cjs movrr-geography-retirement-test` against the explicitly labelled localhost-only temporary Docker/PostGIS container created for this task. The script reads no environment/production credentials, creates its own temporary database, loads the exact 80 EWKB originals and 56 unrelated test fixtures, runs migration rollback/installation and the actual retirement/rollback files, exercises authorization/lifecycle/geometry/audit guards, and drops only its own test database. This is local integration testing, not a deployed staging environment or physical-device verification.
