# Shop redemption remediation — 19 October 2026

Public redemption remains disabled. The containment and lifecycle migrations are applied to `kzdvunpuxaxlphqvmzxw`; existing records have unchanged before/after fingerprints. Isolated acceptance passed; physical device, merchant supply and public activation acceptance remain outstanding. This document distinguishes those gates from implemented source and database contracts.

| Finding | Root cause / authority | Correction | Regression / acceptance | Dependency |
|---|---|---|---|---|
| F1 | PUBLIC catalog policy and grants / PostgreSQL | Service-only catalog writes; server capability + activation policy | Effective anon/rider DML denied, active reads retained | 050 then Admin |
| F2 | Explicit client grants on definer primitives / PostgreSQL | Revoke all client execution; audited server adjustment command | Cross-rider and metadata/amount attacks denied; audit atomic | 050 then lifecycle SQL/API |
| F3 | Alternate legacy mutation RPCs / PostgreSQL | Retire effective access; preserve owner/support history | Legacy misuse denied; record hashes unchanged | 050 |
| F4 | Capability without target scope / service and PostgreSQL | Resolve actor and target organisation for every command | Cross-organisation cancel/refund/scan/collect denied | 050 blocks old writes; SQL/API |
| F5 | Hint rendered as credential / delivery API | Owner-only retrieval of actual durable credential | Digital display and QR scan survive restart; missing means missing | SQL, API, Mobile |
| F6 | Read then upsert token status / PostgreSQL | Token + validation + command receipt in one transaction | Concurrent scans and lost response replay one outcome | SQL/API |
| F7 | Allocation Map / lifecycle service | Durable allocation transitions under locks | Restart, duplicate, release/consume races | SQL/API |
| F8 | Refund unrelated to stock/status / PostgreSQL | One coordinated unwind with ledger compensation | Full refund, stock and purchase eligibility restored exactly once | SQL/API |
| F9 | No-op retry, latest 500 / jobs | Durable indexed due work, leases/backoff and ops visibility | Interrupted work, overdue rows, beyond-page records and idempotent jobs | SQL/jobs |
| F10 | Client points/stock-only eligibility / catalog | Server deliverability projection; preserve unsupported products | Unsupported/resource exhausted/gated products cannot purchase | SQL/API/Mobile |
| F11 | No quote precondition / checkout | Validate expected points before debit, after replay lookup | Price change reconfirmation; old receipt still replays | SQL/API/Mobile |
| F12 | Multiple activation paths; ignored version / Admin | Central activation policy; transactional version preconditions | Manage-only activation rejected; stale command conflict | SQL/API/Admin |
| F13 | Separate state/events and volatile bus / PostgreSQL | Transactional transition/audit/outbox; leased delivery retry | Failed event/audit rolls command back; retry never repeats finance | SQL/jobs |

## Rollout

A: verify project, permissions and preconditions; apply 050 with financial/catalog fingerprint preservation and read-only post-verification. B: rehearse lifecycle migration and API against isolated PostgreSQL, deploy backend with redemption disabled. C: integrate Mobile without OTA/EAS/store publishing. D: isolated integrated acceptance, reconciliation and operational recovery. E: explicit approval required to enable public redemption.

Do not run synthetic financial transactions against production. Application deployment and database rollout revisions, verification results and remaining gates must be recorded here before activation.

## Authoritative lifecycle

`Shop / Wallet -> Platform catalog -> confirmed expectedPointsPrice + persisted Idempotency-Key -> shop_redeem -> existing v2 wallet kernel -> durable allocation + credential + transition + audit + outbox -> owner credential endpoint -> My Rewards / Admin -> canonical cancellation, validation, collection or recovery`.

The claim, paid debit (if any), catalog decrement, imported resource reservation, fulfillment, credential, receipt, event and audit/outbox intent commit together in PostgreSQL. The application no longer orchestrates competing financial or fulfillment writers. The rider wallet advisory lock precedes fulfillment/resource locks. Catalog/resource row locks serialize stock across riders. Replays resolve before current quote/gate validation and must match the original reward. Different request IDs still obey balance, inventory and rider purchase limits.

Digital: only genuine imported voucher-pool codes are eligible. Claiming reserves a code and reaches `ready`; first authorized delivery commits the allocation as fulfilled and reaches `completed`. Reopening returns the same owner credential until expiry. This proves delivery, not redemption by an external merchant. Once disclosed, a voucher cannot be blindly refunded or returned to inventory.

QR: a durable, unpredictable bearer token is bound to one fulfillment and imported resource. Owner display returns the actual value. Authorized target-organisation validation atomically consumes the token and reaches `validated`; partner collection confirmation fulfills the allocation and reaches `completed`. Concurrent scans cannot both consume it. Replay of the same authorized command returns its receipt. Collection is a separate explicit action; validation alone is not proof of delivery.

Free: `points_price=0` follows precisely the same command, locks, allocation, limits and delivery. No debit, credit, refund or zero-value ledger entry is created. The ledger reference is nullable and receipts/history explicitly expose `isFree`. A rider without a balance row can claim an eligible free reward; the authoritative balance remains zero. Mobile and Admin display **Free**. Admin creation and editing require an explicit price; clearing a field does not silently configure a free product.

## Cancellation, refund and recovery policy

Undelivered claims can be cancelled by authorized operators at the expected version. The same transaction revokes active tokens, releases reserved resources, restores the catalog unit actually deducted, removes the claim from purchase-limit eligibility and appends the remaining paid compensation exactly once. Paid cancellation ends `refunded`; free cancellation ends `cancelled` with `unwind_complete=true` and no financial transaction. Neither settled financial history nor balances are rewritten. Fulfilled or disclosed merchant value fails closed; this launch does not pretend to revoke external vouchers.

`shop_recover` discovers all interrupted, overdue and missing-delivery cases through indexed predicates, then processes bounded batches with locks and persistent retry/backoff. It safely unwinds interrupted claims rather than issuing unverified replacement value. Recovery of 1,005 overdue records demonstrates discovery beyond the old 500/latest-page cap. Failed attempts remain visible through scoped health and fulfillment details; operators can queue retry through the existing action dialog. Retry does not add a financial writer.

Every authoritative transition writes its event, audit and notification/email intent in the transaction. The single recovery worker leases outbox rows, uses a stable provider idempotency identity, and acknowledges only successful deliveries. Provider or notification failures persist retry state. Missing email recipients produce an operational failure, not fake success. Validation has an explicit email template. A lost provider response can repeat notification delivery after the provider's idempotency retention window, but cannot repeat the claim, debit, refund or fulfillment.

## Security and retired paths

- Catalog policies/grants prohibit anon/rider mutation, including prices, stock and associations. Canonical catalog writes audit atomically and enforce independent activation approval, draft-first material changes and supported launch types.
- Financial adjustment and obsolete redemption primitives have no effective anon/authenticated/service execution grants. Only authorized server commands call the private v2 kernel. Adjustments accept bounded signed points, a reason and an operation identity; callers cannot inject arbitrary ledger metadata.
- Every command checks the actual target organisation in SQL. Partner validation, collection, cancellation, refund, retry and resource import cannot act on another organisation. Private bearer/resource/allocation tables are not client-readable. Owner history remains protected by RLS and scoped APIs.
- Exact partner/fulfillment routes reach bearer-authenticated handlers without an employee cookie. JWT capability checks and SQL target checks remain mandatory. Unknown adjacent routes retain the dashboard boundary. Checkout and operator mutations have atomic rate limits.
- Removed the process-memory resource/token stores, generated digital providers, unsupported handlers, TypeScript fulfillment engine/state machine, old redemption/refund orchestrators, in-memory financial writer and volatile fulfillment notification/email/metrics subscriptions. Removed their obsolete mocked-engine tests; real PostgreSQL contracts and worker-delivery regressions replace them.
- Removed the old expire/release job routes and the QStash three-schedule creation script. One authenticated worker at `/api/v1/internal/jobs/fulfilment-retry` owns discovery and delivery, scheduled by Supabase pg_cron every five minutes through a fixed-destination private HTTP dispatcher. Historical design documents remain evidence, not active instructions. Any previously configured external QStash schedules should be removed in its console; their removed destinations cannot mutate data.
- Existing migration records and historical SQL function bodies are preserved. Their insecure effective execution access is retired; they are not compatibility APIs.
- The only narrow historical obligation command is `shop_cancel_legacy_reservation`: staff can release a genuine pre-containment, undelivered, non-v2 reservation with expected status, receipt, audit and notification. It never creates a redemption or ledger credit. The two real production records were not changed. Remove this command and queue affordance after those two obligations are reviewed/resolved; no alternate purchase implementation remains.

## F1?F13 acceptance evidence and exact authorities

All lifecycle SQL authorities below are in `scripts/051_shop_lifecycle.sql`. Production containment uses `050_shop_containment.sql` and `050b_shop_inventory_containment.sql`. The database integration runner is `../movrr-mobile/scripts/test-shop-lifecycle.cjs`; its fixture invokes the actual SQL contracts under service-role grants. HTTP integration loads the actual `shopLifecycleApi.ts` adapter; identity/transport fixtures connect it to isolated PostgreSQL, not mocked settlement responses.

| Finding | Authoritative correction | Demonstrated evidence | Release qualification |
|---|---|---|---|
| F1 P0 | 050 catalog policy/grants; 051 `shop_save_catalog`, `shop_guard_catalog` | Isolated anon/rider DML denial; production effective permissions and unchanged catalog hashes | Applied; backend rollout required for management |
| F2 P0 | 050 primitive revokes; `shop_adjust_points` | Unauthorized actor/zero adjustment denial; signed adjustment replay, receipt balance, audit rollback | Applied; Admin calls canonical command |
| F3 P0 | 050 legacy revokes; 051 private kernel boundary | Effective anon/auth/service grants denied; legacy resolution restores reservation without ledger transaction | Applied; two real records preserved |
| F4 P0 | `shop_authorize`, `shop_fulfilment_command`, `shop_import_codes`; API adapter | Foreign-org paid/free cancellation, refund, scan, collection and import denied; credential ownership denial | SQL/API verified locally; live authenticated partner session acceptance pending |
| F5 P1 | `shop_prepare`, `shop_get_credential`; Mobile order-detail/token card | Actual imported synthetic code delivered/reopened; actual QR token used for validation/collection | Real merchant inventory and physical device acceptance pending |
| F6 P1 | Conditional token consume + validation + command receipt in one transaction | 12-connection simultaneous scan race; same-operation replay; stale expected-version denial; release/consume race | Isolated PostgreSQL verified |
| F7 P1 | Durable resource item/allocation + single command transaction | Injected failures at nine write boundaries roll back; killed application before commit; new connection replay after commit | No process-memory allocation authority remains |
| F8 P1 | `shop_unwind`, private existing v2 refund kernel | Duplicate cancellation restores points/stock once; purchase limit recovery; free cancellation/expiry produces no financial entry | Disclosed value refund intentionally rejected without revocation evidence |
| F9 P1 | `shop_recovery`, `shop_recover`, health, operator retry, single cron | 1,005 cases discovered/drained; injected refund failure persists backoff; operator retry applies one refund | Private cron configuration/secret verified; live scheduled acceptance recorded in shop-recovery evidence |
| F10 P1 | `shop_catalog`, public catalog visibility policy; Mobile authoritative catalog | Unsupported types, inactive/missing/expired/exhausted resources unavailable; zero-balance free claims accepted | Existing unsupported records preserved, inaccessible as purchases |
| F11 P1 | `shop_redeem` expected price; both Mobile checkout callers | Changed quote rejected before debit; Mobile reconfirmation; committed receipt replays despite later quote | Source integrated, native bundles built locally; no store/OTA release |
| F12 P1 | `shop_save_catalog`; all Admin actions use `writeCatalog`; command expected version | Same editor activation denied; draft-first material changes; stale operator command returns conflict | Generic catalog updates cannot bypass the canonical command |
| F13 P1 | `shop_record_transition`, transactional outbox, recovery worker | Audit/receipt/event failure rollback; notification failure + retry dedup; email failure never acknowledged; retry-persistence failure surfaced | Actual provider inbox/device notification acceptance pending |

The table records implemented and tested corrections; it is not certification that all external launch gates have passed.

## Verification performed

- Isolated PostgreSQL 17: 206 lifecycle assertions, 12 simultaneous connections; 86 existing wallet exactly-once assertions; 14 isolated containment assertions. Fixtures are explicitly synthetic and not merchant credentials. Included free digital/QR success, concurrent distinct free requests, zero balances, no ledger rows, stock exhaustion, limits, expiry, cross-org denial, cancellation, recovery and reconciliation.
- The kill test terminates a child application while its transaction remains uncommitted. PostgreSQL rolls the entire claim back. A separate client commits, is disposed, and a new client replays the persisted receipt. Trigger-injected failures cover intermediate writes; these are not claims that physical device termination and every external provider interruption were tested.
- Admin: TypeScript/lint (repository lint delegates to TypeScript), production Next build, 45 suites / 539 relevant tests. Tests cover API capabilities, exact middleware paths, deletion barriers, financial read contracts and delivery worker behavior. Existing diagnostic-fixture warnings do not represent production test mutations.
- Mobile: TypeScript, lint (zero errors, four existing warnings outside this change), 28 suites / 335 relevant Jest tests and local Android/iOS Hermes exports. Web export was unavailable because the checkout lacks `react-native-web`; no unrelated dependency was added. Local bundles are not native-device, EAS or release acceptance.
- Production: all five migrations applied to the exact verified project; locked before/after data fingerprints match for 12 financial/catalog/inventory tables. Independent post-verification was read-only. Two owner history probes match expected counts, anonymous/cross-rider reads return zero, canonical RPCs are service-only and private credential tables remain denied. No production test claim, credit, debit, refund, token consumption, inventory movement or legacy cancellation was executed.
- Evidence: mobile `docs/verification/shop-{containment,inventory,lifecycle}/`; Admin `docs/verification/shop-redemption/`. Safe evidence stores hashes/counts/permissions and revisions, not bearer tokens, customer rows or environment secrets.

## UI preservation

Mobile retains Shop, Wallet, My Rewards, order detail, approved tokens, geometry, navigation, skeletons and confirmation components. Changes are Free labels, authoritative availability, price reconfirmation, true credential display, consumed/expired credential suppression, account-scoped catalog caching and consistent status refresh. No screen redesign, font, brand color, spacing or decorative treatment was introduced.

Admin retains existing tables, cards, dialogs, buttons and density. Added actions reuse those controls for QR validation/collection, durable retry, real pool import/expiry and historical reservation review. Free prices and recovery fields are explanatory data within existing views. Financial receipt balances are historical persisted values; absent legacy evidence is shown as unavailable rather than today's balance.

## Production rollout and remaining activation gates

1. Applied `20261019110000` (`050`, P0 containment), `20261019122000` (`050b`, inventory barriers), `20261019123000` (`051`, canonical lifecycle/free claims), `20261019131500` (`052`, initially inactive scheduler), and `20261019133000` (`053`, final private HTTP transport). No data backfill or historical rewrite was needed. No additional schema migration is currently outstanding.
2. Admin production target, Supabase binding, service key presence, mock-data disabled state, Resend binding and sensitive `SHOP_RECOVERY_SECRET` binding verified. Vercel Hobby rejected the initial five-minute cron configuration before deployment. Recovery now uses the existing Supabase pg_cron/Vault infrastructure and a private HTTP extension schema; `vercel.json` retains only its existing daily privacy cron. Deployment revision and unauthenticated live probes are recorded separately after rollout.
3. Mobile source is integrated and locally verified only. No EAS build, OTA publication or store submission was authorized or performed.
4. Before public activation: validate actual partner-issued digital/QR inventory and expiry/terms; independently approve launch catalog items; run a controlled non-production device journey through the deployed API, actual camera scan, real provider delivery and restart/offline flows; complete operator training for validate-versus-collect and the no-refund-after-disclosure policy.
5. The separate `movrr-app` web consumer exists outside the two requested repositories. Its checkout/delivery contracts must either be verified against the canonical expected-price API before activation or its reward checkout retired from public access. This task does not silently preserve an unsafe old writer for it.
6. Review any old QStash schedules using its management console; no management token was available to enumerate/delete them. Only the Supabase cron dispatcher and canonical worker are configured by this source.
7. Explicit approval is still required to enable real rider redemption. Keep `shop_release_control.redemption_enabled=false` until all gates pass. Do not use production synthetic financial transactions to satisfy them.

**Decision: do not enable public redemption yet.** Database/security containment and isolated lifecycle evidence are complete; external supply, physical-device, provider acceptance and Mobile release approval are not implied by passing source tests.


## Scheduler security and deployment adjustment

The initial Vercel rollout was rejected by its Hobby cron limit and did not replace the deployed backend. The frequency was preserved without a paid plan change. Migration 052 created an inactive pg_cron/pg_net dispatcher. Hosted effective-permission verification then showed that pg_net queues were owned by `supabase_admin` with public read grants that the migrating owner could not revoke. No secret was placed in those queues and no dispatch ran. Migration 053 guarded that both queues were empty and the job inactive, removed that new extension, and established `shop_transport` owned by postgres with no schema usage for anon, authenticated or service roles. HTTP extension member ACL revokes are restricted by the hosted owner; the independently asserted private schema boundary is the effective access control. Only the fixed-destination postgres-owned dispatcher can call the worker. Persistent authentication is held in Vault and a Vercel Secret, and is never written into a network queue or cron command.

The dispatcher has a 55-second HTTP timeout, records safe status/SQLSTATE and dispatch time, and suppresses duplicate invocations within two minutes. The worker processes bounded batches and stops starting delivery work after 40 seconds; unprocessed leases expire for retry. Admin health displays scheduler activity, last status/error and last run time. Provisioning first leaves the job inactive, then activates only after the exact backend is READY. Public redemption activation is a separate flag and remains false throughout.

Twenty isolated scheduler SQL/privilege checks and fourteen final private-transport checks passed. Their HTTP/cron transport is explicitly doubled because the local PostgreSQL image lacks those extensions. Hosted effective permissions, migration fingerprints and a real scheduled HTTP outcome are recorded separately. The configuration helper never executes a redemption or synthetic financial transaction.

Primary references: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [PostgreSQL HTTP extension](https://github.com/pramsey/pgsql-http). The final design uses synchronous private transport rather than persisting authentication headers in the hosted pg_net queue.


## Reproduce isolated checks

From `movrr-mobile`, with both repositories checked out as siblings and existing dependencies installed, start a disposable PostgreSQL instance on localhost only:

```powershell
docker run --name movrr-shop-regression -e POSTGRES_PASSWORD=isolated-local-test-only -p 127.0.0.1:55439:5432 -d postgres:17-alpine
node scripts/test-wallet-exactly-once.cjs
node scripts/test-shop-containment.cjs
node scripts/test-shop-lifecycle.cjs
node scripts/test-shop-scheduler.cjs
```

The runners create/drop only their task databases. The scheduler runner explicitly doubles extension transport; its output must not be represented as a hosted HTTP pass. Stop/remove only this disposable container after running the checks. Do not point these mutation tests at production.


## Observed production acceptance

Backend revision `73bb010273f3c939a5b6541148b2b394dfb22b62` reached READY and the `admin.movrr.nl` alias. Twelve unauthenticated probes verified application JSON denials, including catalog, wallet, credential, partner and mutation boundaries; they did not merely hit Vercel deployment protection. Supabase's first scheduled private recovery call completed at **2026-10-19 10:35 UTC** with HTTP 200 and no transport error. Queues were empty. No synthetic redemption, ledger effect or notification was created to test it.

Read-only production health reports zero wallet mismatches, unpaired paid claims and free financial entries, zero pending/failed delivery, and two unchanged historical reservations. Final free-price input validation is covered separately: blank values are missing; an explicit zero is accepted by both create/edit controls and the Admin command schema. Final deployment revision and safe live probes are in `docs/verification/shop-redemption/deployment.json` and `live-boundaries.json`; recovery activation, observed run and financial fingerprints are in Mobile `docs/verification/shop-recovery/`.
