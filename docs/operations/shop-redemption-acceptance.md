# Shop redemption technical acceptance - 19 October 2026

Technical acceptance **passed** for F5, F8, F10 and F13 within the isolated boundary described below. No application implementation defect was demonstrated. Public redemption remains **Disabled** and is **not approved for activation**: merchant supply, real provider delivery, device and release acceptance remain outstanding. This report supplements the completed independent audit; it does not restart or replace its original evidence.

## Execution boundary and reproducibility

Run from Mobile beside the Admin checkout:

```powershell
# Task-owned PostgreSQL 17 on localhost only; no production env or data.
docker run --detach --name movrr-shop-acceptance --publish 127.0.0.1:55439:5432 --env POSTGRES_PASSWORD=isolated-local-test-only postgres:17
npm.cmd run test:shop-acceptance
# Existing full lifecycle/fault regression against the operating baseline:
$env:SHOP_OPERATING_BASELINE='1'
node scripts/test-shop-lifecycle.cjs
```

Use a dedicated empty server on that port. The runner creates a uniquely named database and drops only that database in its finalizer. Remove only the task-owned container/volume after checking for other databases/connections. Acceptance captures are written to ignored task scratch and promoted to release evidence after review.

The real Admin catalog server actions create drafts and independently activate both supported types. The real Mobile platform client and reward service make HTTP requests to a localhost server dispatching the same production-composition handlers, repositories, authorization services and canonical SQL RPCs. Service-role RPC execution uses separate real PostgreSQL transactions/connections. Real row, event, audit, outbox and receipt persistence is not mocked. This is not a running Next.js browser session or a full local Supabase gateway.

Explicit substitutions: Supabase wire transport is translated to isolated PostgreSQL; session/JWT verification and Admin cookie/MFA identity are fixtures; Next cache invalidation and native logging are inert. Merchant voucher inventory and readiness attestations are synthetic and never represent launch evidence. The parent runs the real email adapter, React template and Resend SDK with provider HTTP intercepted; a separate child recovery process uses a doubled email port. No outbound provider email, production identity, financial transaction or live inventory mutation is involved.

## F5/F8/F10/F13 results

| Finding | Technical acceptance | Demonstrated behavior | Remaining external acceptance |
|---|---|---|---|
| F5 delivery | Passed | Imported persisted digital code equals owner-delivered credential; owner reopening; genuine random QR issued and consumed; free digital/QR use identical lifecycle; unauthorized owners denied | Merchant confirms usable codes/terms; native QR display/camera and merchant handover |
| F8 refunds | Passed | Paid undisclosed cancellation has one debit and one compensating credit; stock/resource restored once; free cancellation/expiry have no financial rows; interrupted refund recovers in a separate worker process; delivered digital is not blindly refunded | Merchant/support accepts disclosure and revocation policy; no external voucher revocation was simulated |
| F10 availability | Passed | Real Admin draft/approval flow, independent-actor denial, server stock/limit checks, exhausted stock unavailable, unsupported inactive reward unreachable, changed quote rejected; baseline covers unavailable/malformed/duplicate/expired pools | Actual launch inventory and merchant supply are not ready; production readiness remains false |
| F13 audit/outbox | Passed | Every captured transition has matching event, audit and notification/email intents; injected audit failure rolls entire claim back; real email payload/outbox identity remains stable across outage and lost response; final rider/operator histories reconcile | Real provider authentication/deliverability and inbox receipt; deployed signed-in Admin/partner acceptance |

These are technical results, not claims that external acceptance has passed. The existing audit's launch-dependent partial classifications for these findings remain visible until that evidence exists. No new migrations or backend deployments are required by this acceptance task.

## Exact isolated transaction evidence

These are synthetic isolated IDs, not production/customer records. Full ledger transaction IDs, allocation IDs, timeline/audit IDs, outbox IDs, versioned states and token SHA-256 values are in Mobile `docs/verification/shop-acceptance/journeys.json` (20 checkpoints). Usable credential values are not published in the report.

| Journey | Redemption | Fulfillment | Final state | Ledger points | Catalog stock | Rider balance |
|---|---|---|---|---|---:|---:|
| digital owner disclosure completes delivery | `18a426c2-c344-472a-99da-2d830668a16a` | `b740f5a3-a287-486c-a34f-cd6622ddb2e9` | completed | -60 | 2 | 140 |
| free digital delivered | `f78de51d-85cc-44eb-a74d-6220d610dfdc` | `9ae4f06d-86e6-4527-bc8c-5750149d9e60` | completed | none | 2 | 0 |
| QR collected | `56b0c33d-7602-4924-93b2-6606496b2528` | `4a37fb29-70b3-496a-be45-860bf7d37e99` | completed | -25 | 2 | 115 |
| paid cancellation refunded once | `12a41f03-7feb-4eb2-a8c6-4c5922bb2b4b` | `c8aa539f-eb7a-41b7-b915-e60ceb298029` | refunded | -60, 60 | 2 | 115 |
| free cancellation no refund | `5a0a4966-ac37-4f64-9b15-8436d775343d` | `c3d8b451-c8f6-4325-ba20-b4571ef9b3a4` | cancelled | none | 2 | 115 |
| free QR collected | `66468ac5-a382-4ed4-a513-cd229ddf95b8` | `0f2b8326-a386-453d-9fe1-051f6f0c6ae5` | completed | none | 0 | 0 |
| new worker process refunds expired claim | `28561ae2-52b6-4392-859d-478ce60a7bed` | `8dede37b-f43d-4f28-bf28-98311ac8c715` | refunded | -60, 60 | 2 | 115 |
| free expiration recovers inventory without financial refund | `8bf6fe52-942c-460b-9493-06a10c2d1a06` | `5c49238e-3727-46bf-8ce4-945205023c49` | cancelled | none | 2 | 115 |

The paid wallet starts at 200 fixture points. Digital costs 60, QR costs 25; its final balance is 115 after cancelled/expired claims are compensated. The zero-balance rider has no financial ledger entries. A zero-valued balance projection may exist; it is not a fabricated financial transaction. Digital owner retrieval is the supported delivery confirmation and completes fulfillment atomically; Admin observes that completed state. QR progresses ready -> validated by single-use consumption -> completed by explicit authorized collection. Digital delivery does not require an invented second Admin confirmation action.

## Failure, isolation and consistency evidence

- Twelve simultaneous QR scans with different operation IDs yield exactly one success; replaying the winning operation returns the same outcome. Eight same-operation cancellations yield one refund. Twelve simultaneous free-claim requests return one receipt and allocation.
- A lost HTTP response after SQL commit produces a real Mobile network error; retry of the same operation recovers the original receipt without another claim or financial effect.
- Recovery records a failed refund attempt without losing the original debit. A newly spawned worker process (PID `76360`) loads the actual worker, reads durable work, refunds once, and subsequent retry has no effect.
- The lifecycle regression independently kills an app process before SQL commit, verifies rollback, disposes/recreates connections after commit and verifies replay. It also tests release-versus-consume races, distinct-operation purchase limits, injected receipt/event/notification/refund failures, bounded attempts and recovery beyond the first page.
- The actual email adapter/SDK/template ran. The recorded delivery for one outbox identity is accepted -> provider 503 -> accepted with lost response -> accepted replay, with an unchanged serialized payload hash and provider idempotency key. This proves application payload/retry behavior, not a provider's real idempotency retention or inbox receipt.
- Cross-rider credential/detail reads, stale expected-user sessions, cross-organisation cancellation/refund/scan, unsupported products, stale quotes, consumed/expired credentials and Disabled paid/free checkout are rejected. Existing history and worker operations remain usable while Disabled.
- Every final My Rewards entry, fulfillment state, free flag, points price, rider/operator detail and timeline was compared with SQL. Wallet history sums to the same authoritative balance; free rider Wallet history is empty. Final reconciliation has zero wallet mismatches, unpaired paid claims, free financial entries, overdue claims, recovery failures or notification backlog.

## Verification results

Acceptance: **228 assertions, 120 actual HTTP requests, 20 checkpoints, 17 denial/error scenarios**. Separate full operating-baseline lifecycle regression: **305 real PostgreSQL assertions**, including 12 independent connections. Coverage overlaps; do not sum these as distinct scenarios.

Admin: **54 suites / 605 tests**, TypeScript passed. Mobile: **29 suites / 338 tests**, TypeScript passed; lint zero errors and four pre-existing Campaigns/Searchbar warnings. Existing diagnostic fixtures log intentional warnings. New tooling passes Node syntax checks. Application runtime and approved UI are unchanged; no new production/native build, EAS, OTA or store operation was performed. No visual or cross-platform parity claim is inferred from source tests.

## Production and release decision

Read-only production check: Supabase `kzdvunpuxaxlphqvmzxw`, migration `20261019140000`, operating state **Disabled** version 0, zero recorded launch attestations, inventory readiness false; live worker heartbeat successful and financial reconciliation healthy. Admin remains READY revision `22f7cf501c68af3919e91c48679e0b28f4f76df9`, deployment `dpl_FkyszEXAdmZ9iz31pUvmBWrbnx3D`. Evidence: Mobile `production-state.json` and Admin `docs/verification/shop-acceptance/deployment.json`. Production was inspected read-only; no claims, points changes or inventory changes were created.

What remains needs real external access or release participation: merchant-approved voucher supply and terms/refund handling; Android/iOS display, camera, offline/restart and accessibility acceptance; controlled real provider delivery/inbox receipt; authenticated deployed controller/partner acceptance; disposition of the separate web checkout and the separately authorized Mobile release. Record genuine readiness attestations only after these gates pass. Explicit authorized activation remains a separate final operation. **Do not enable public redemption on the basis of this isolated run alone.**
