# ID-25 production ingress correction — 21 October 2026

The approved correction is deployed to **admin.movrr.nl**. This report supersedes the pending-deployment disposition for ID-25 in the earlier enterprise identity release report. The deployment task is closed per the user's instruction on 21 October 2026, with external authenticated browser acceptance pending. This closure does not claim those journeys passed.

- Source: `75105bd8c7ab29323803987e334403f12b918b86`.
- Deployment: `dpl_4NKHidcv6wEUzewztKniP5Wny6pm`, READY and PROMOTED.
- Deployment URL: `https://movrr-admin-h47j6m539-movrrops-projects.vercel.app`.
- The Vercel production target and custom-domain alias both identify this deployment.
- Previous Admin deployment: `dpl_Cpxc7H62VD3zLpCdVot4MzGYFe8X`, source `8d7320ea96325bbc9adbc67f7e4b820baba9c5e1`.

## Isolation and release process

Local and remote main initially matched `e0572d3527725fab08209ab6ea215c6703b6d1c5`, containing the approved correction. The application delta from the previously deployed revision is confined to `lib/pathMatch.ts` and `proxy.ts`; intermediate commits also contain already-installed SQL corrections, tests, documentation and release tooling. No SQL was run by this release.

The existing Vercel Git-source API process created a production candidate pinned to the exact approved SHA with `autoAssignCustomDomains=false`. The immutable build passed compilation and TypeScript, reached READY, and was probed using Vercel CLI access before promotion. A fresh alias read confirmed no concurrent production deployment before promotion. The promotion endpoint returned no response body; independent readback confirmed success without retrying the promotion.

The parallel identity session began editing the shared working tree during verification. None of its files were staged, committed, reset, overwritten, or uploaded by this release. A shared-tree typecheck observed a transient missing `initialMemberships` prop in that unfinished work; it was left untouched. The pinned Vercel build independently passed TypeScript. Migration 078 and all unfinished identity simplification changes are excluded. Mobile was not modified.

No legacy authentication fallback, duplicate middleware, new production identity, membership change, invitation, email, or financial transaction was introduced. The web domain remains on `dpl_FgZDgMTfSM3Zaaaov2VSc2xdCp35`. Existing production operating states and firewall rules were preserved.

## Verification

The [production receipt](../verification/id25-ingress/production.json) records the exact source and deployment, HTTP request identifiers, database verification, and limitations.

- 160 focused tests passed across six ingress, path, authentication, API authorization, employee authorization and organisation authorization files. The correction's existing 860-test/72-file PostgreSQL and GoTrue regression evidence was reviewed; it was not rerun against the moving shared tree.
- Staged membership discovery and organisation APIs returned canonical JSON 401 responses with matching handler paths; `/users` retained its Admin-cookie redirect. The initial direct staged probes encountered Vercel deployment protection; authenticated Vercel CLI access was used without disabling protection.
- All 27 final production probes passed: 22 missing/invalid-bearer requests across 11 canonical API routes returned JSON 401 with no sign-in redirect; four protected Admin/unsafe descendant routes retained 307 sign-in redirects; sign-in returned 200. Invitation denial used its registered POST method with an empty body and no valid credentials. GET on that POST-only route returned the expected 405 during initial inspection.
- Before and after promotion, read-only production verification confirmed checksums for migrations 071–077, all 34 exact canonical SQL function bodies, 11 domain/role capability catalogs, revoked direct membership/employee DML and untrusted granting RPCs, and absent retired granting signatures/broad policies.
- Existing Advertiser identity contexts retained own-tenant capabilities and RLS visibility, denied cross-tenant access and internal role approval. Five existing staff contexts retained dashboard eligibility. Privileged role approval was denied at AAL1 and allowed at AAL2. Five existing Rider contexts retained identity and were denied the Advertiser tenant. These are read-only PostgreSQL contexts, not authenticated HTTP sessions.
- The existing one-organisation/one-Owner Advertiser backfill was verified without replay. All non-routine protected fingerprints matched across this release; only the existing Shop scheduler/worker heartbeat tables changed between snapshots. Auth users, memberships, financial records and migration metadata were preserved.
- Deletion intake remains enabled, policy version 2; irreversible execution remains disabled. Public Shop redemption remains disabled. The Admin firewall remains enabled with zero custom rules, unchanged version 8.

## Remaining acceptance

No authenticated Chrome/DevTools connection or computer-use browser session was available. Therefore successful requests with an existing legitimate organisation bearer token, cross-tenant/privilege rejection through live HTTP using that token, and successful Admin cookie/MFA browser journeys were **not executed**. Database context checks, handler tests and anonymous HTTP checks do not substitute for these journeys.

The user confirmed that authorised Admin and organisation sessions exist in Chrome but are inaccessible to this agent's browser environment. The following are recorded as **pending external browser acceptance**:

- Successful bearer-authenticated organisation API access.
- Cross-organisation denial using distinct authorised identities.
- Admin cookie/MFA browser navigation.

The deployment and completed verification evidence are preserved. Per the user's closure instruction, no further browser connection attempts, credential requests, token extraction, source audit, redeployment or production-account creation will be performed for this task. The parallel identity-simplification session remains undisturbed. The ID-25 ingress defect is corrected at the live boundary; the external acceptance items above remain pending.
