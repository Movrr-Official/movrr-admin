# Final commit preparation — 2026-10-12

This session corrected repository hygiene only. No staging, commits, deployment, production SQL, or marker regeneration occurred.

## Current acceptance

Approved cyclist iteration 3 and exact-M partner markers are integrated. All 90 pre-existing artwork/provenance/calibration files retain their original SHA-256 hashes. Partner backend readiness and production discovery remain disabled. Category variants remain unavailable. RouteTracker/TPE authority and migration 051 semantics are unchanged.

Earlier PostgreSQL 17.6 local verification and 27 authenticated local HTTP assertions remain PASS as recorded in the original reports; neither was rerun or re-dated this session. Actual production Supabase ledger/deployment verification, signed EAS builds, mounted Admin browser acceptance, and physical-device certification remain pending. Supabase staging is deferred.

## Hygiene corrections

Former image generators are read-only archival verifiers, using Node built-ins only. They reject output/regeneration arguments and validate frozen evidence, including original provenance. No sharp package, sibling node_modules dependency, new production dependency, or artwork regeneration is required.

Thirty partner PNG copies, three cyclist 64px copies, and one earlier proof remain on disk but are excluded by exact ignore rules. Runtime density assets, source/master assets, SVG masters, frozen review sheets, calibration and provenance remain included. Old provenance export names describe the original review bundle; the current inventory records runtime equivalents and local-only copies.

Incidental formatting in the reward service, account authentication block and Organisation drawer was removed using guarded comparisons. Approved functional additions were retained. The SQL runner now rejects nonpositive Runs at parameter binding and requires at least one successful run. Six deterministic argument checks invoked no Docker resources.

## Verification performed this session

| Check | Result |
| --- | --- |
| Mobile TypeScript | PASS |
| Mobile full Jest | PASS: 182 suites / 1,382 tests |
| Mobile focused tests | PASS: 20 suites / 149 tests |
| Mobile lint | PASS: 0 errors / 7 existing warnings |
| Admin TypeScript and lint alias | PASS |
| Admin focused tests | PASS: 5 files / 34 tests |
| Admin full Vitest | FAIL: 512 pass / 1 existing failure / 513 total |
| Archival safety Node tests | PASS: 2 tests; 56 frozen evidence hashes |
| Artwork preservation | PASS: 90 unchanged files |
| Static cross-repository contracts | PASS: 13 checks; no network/database |
| Tracking architecture invariants | PASS: 5 checks |
| SQL runner arguments | PASS: 6 checks; zero Docker calls |
| Git whitespace | PASS in both repositories; LF/CRLF warnings only |

The unchanged backend failure is searchableEntityRegistry.test.ts:64, support-role Users navigation authorization. No unrelated authorization policy was changed. The overall backend release suite is not green.

## Commit grouping and staging

Two coherent commits per repository are recommended: complete runtime integration, then tooling/evidence. Preferred finer splits cross shared source/contract dependencies and have not been independently certified. Do not force partial file boundaries. Runtime commits include their existing regression tests and required native assets/SQL migration; evidence/tooling commits depend on runtime commits.

Use the local commit-preparation-inventory.json file for exact paths, group messages, dependencies, exclusions and future literal-path staging commands. These commands are documentation only and were not executed. Recheck Git status and require explicit staging authorization before using them. Never stage entire working trees or force-add ignored artifacts.

Admin migration 051 must precede deployment of atomic Organisation persistence, even while rider discovery is disabled. Commit readiness does not imply deployment readiness.

## Verdict

READY for explicitly authorized scoped staging in each repository. The known backend baseline failure must remain disclosed. Public launch remains HOLD pending database operational gates, external Maps configuration, signed native builds, browser/device acceptance and resolution or separately approved disposition of the backend authorization failure.

Current cross-repository command/results record: ../../movrr-mobile/docs/implementation/commit-preparation.json (sibling checkout). Local historical SQL evidence: partner-location-local-verification.md and .json.
