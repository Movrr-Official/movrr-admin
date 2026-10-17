# Verification receipt ? 17 October 2026

Source preparation only; production schema/data changes and deployment remain unexecuted.

- Local isolated Docker/PostGIS integration: **52/52 passed**, including the exact prepared retirement and rollback scripts against all 80 original EWKB exports; original bytes and protected records unchanged, current/history filtering, permissions, audit, lifecycle/new-start guards and polygon holes verified.
- Admin: **57 suites / 673 tests passed** (`vitest run --maxWorkers=2`), TypeScript and local Next production build (`--webpack`, dummy CI configuration) passed. One unrestricted concurrent run timed out in the existing rewardCutover filesystem scan; bounded-worker rerun passed without source/test changes. Admin's existing lint command is its TypeScript check.
- Mobile: final focused run **15 suites / 104 tests passed**, TypeScript, focused ESLint and EN/NL parity passed. Earlier broader focused run: 21 suites / 145 tests passed.
- Full Mobile: **278/280 suites, 2217/2221 tests passed**. The four failures (three offlineReadiness assertions and one rideCorridors timeout) reproduce in an untouched archive of baseline main `e114a01178ff2b89af35710e764ea4888987b4e8`: 4 failures / 20 passing tests across those two suites. No unrelated fix or assertion weakening was included.
- Final SELECT-only production preflight: completed target campaign; 80 original zone IDs/geometry hashes match the investigation, 56 unrelated zone fingerprints unchanged, all three campaign fingerprints unchanged, no target ride sessions/tracking/rewards/visits/Hot Zones. Retirement columns, RPC, history view and proposed migration registration are absent: nothing has been applied.

Physical Android/iOS rendering, iPhone XR accessibility/performance, installed offline-client adoption and live post-migration API checks remain outstanding. Local SQL tests use a reduced contract fixture matching inspected production interfaces, not a production clone. Existing reward/settlement and historical membership functions are not modified. Source pushes do not install SQL; main Git deployment is explicitly held in vercel.json.

See README.md for exact prerequisites, approval settings, deployment order, expected counts, security boundaries, guarded retirement and rollback. SHA256SUMS.json pins the prepared execution artifacts; recheck normalized Git file bytes before production execution.
