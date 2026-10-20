# Deletion request intake: separate from execution

20 October 2026. **Source prepared and tested; production migrations not applied. Production intake remains Disabled/version 0.** This record supersedes the earlier package's treatment of execution policy completion as a prerequisite for receiving a request. That package remains relevant to actual erasure and retained obligations, not a requirement for independent accountant/partner approval before intake.

## Authorized scope and receipt policy

The MOVRR owner explicitly approves self-service request intake, keeping irreversible deletion disabled. The owner separately approved the existing receipt-only credential to expire **30 days after the original request submission timestamp**. Approval reference `MOVRR-owner-2026-10-20-receipt-access-30d` identifies that actual decision in this record; it is not a fabricated independent review.

The approved credential policy is:

- Store only the credential digest and expiry, associated with its original request. Return the random secret only to the verified requester through the existing response.
- Grant only the original request's minimal status. No account identity, deletion authority, unrelated personal data or financial access.
- Enforce expiry on the server. Reads and retries cannot extend `requested_at + interval '30 days'`. Before expiry, a retry may rotate the secret and invalidate the old one while retaining the same deadline.
- After expiry, preserve the request/audit/retention records. No automatic credential renewal or new recovery endpoint is introduced. Any later recovery or reissuance needs appropriate verification and a separately bounded credential; expiry does not erase or approve the underlying request.

This approves credential validity and the minimal receipt-delivery scope only. It does not approve the long-term completion receipt, journal, accounting, equipment, campaign, restore, external-provider or erasure policies. Expired credentials are unusable even if their hash awaits the separately governed expiry worker; no purge job is enabled.

## Boundary correction

Migration [066](../../scripts/066_deletion_intake_execution_separation.sql) replaces the execution-coupled request predicate with an internal intake predicate: contract v1, technical contract approval, approved `receipt.delivery`, and an approved positive bounded `receipt_access` rule with the existing exact hash/expiry projection and original-request clock.

The MFA-protected Admin command retains active-account/capability/role checks, expected operating version, operation UUID, reason, transactional actor/before/after audit and idempotent command receipt. No supplied actor, service-role activation path or direct application table grant is introduced. The existing operating state remains the sole intake authority.

The old catalog/barrier/disposition SQL check moves to **managed execution**, so it remains mandatory before that gate can be enabled. The existing per-case destructive authorization function, independently reviewed Security proposal, fenced claim, holds and execution action approvals remain unchanged. Managed execution stays false.

New requests still use the canonical account barrier and queue. New-request eligibility requires an existing nondeleted/unbanned Auth identity, active nondeleted rider account and active rider record. The Edge function retains verified bearer identity, recent authentication/provider proof and disclosure acknowledgement. No client identity input is added. Duplicate requests reuse their existing job and preserve its original policy/status/timestamp.

New jobs are explicitly marked `review_required=true` and get one open review under the existing `privacy.deletion.operations.review` capability. The existing one-day internal review deadline is reused; it is neither a retention period nor a substitute for privacy-response deadlines. The current monitor exposes manual review/open-review count, and Operations review reads select by that capability. These jobs are excluded from the normal worker claim. Existing requests, reviews, receipts, financial evidence and legal holds are not rewritten.

Migration [067](../../scripts/067_deletion_intake_receipt_policy.sql) preserves immutable policy v1 and publishes additive policy v2. Only `receipt.delivery` and `receipt_access` receive the actual owner approval; Finance/partner review is not applicable to issuing that minimal credential. All other action/retention records are copied without changing their pending statuses, parameters or references. Global execution-policy Legal/Finance/partner statuses remain pending. The active policy pointer becomes v2 while intake remains **Disabled/version 0**. Migration application itself does not create an activation audit event or actor.

The existing `delete-account`, request/receipt RPCs, status/receipt readers, claimers and destructive authorization signatures remain intact. The public request still sends disclosure version 1; the backend stamps the active policy version. Web/Mobile receipt parsers already accept positive policy versions under contract v1. **No Mobile runtime/UI/native/service or Edge change is required.** Admin changes clarify the intake-specific error and select-option wording without changing the layout or authorization.

## Verification and production evidence

Read-only production inspection confirmed the deployed coupling, original function digests/ACLs, old gate constraint, Disabled/version 0, active policy 1, zero requests/receipt credentials, ten lifecycle audit entries and Shop redemption false. The captured [baseline](../verification/intake-execution-separation/baseline.json) and [fixture](../../scripts/fixtures/deletion-intake/separation-baseline.json) contain metadata/contracts only, no rider data. Existing accepted X01–X17 evidence is reused rather than reopened.

Verification passed:

- **87 real isolated PostgreSQL assertions**: both exact migrations, immutable v1 preservation, one approved intake-only scope, pending execution policies, eligible/ineligible riders, MFA/capability/direct-write denials, audit failure rollback, operation retry/version conflict, hash-only credential storage, exact 30-day expiry, no deadline extension or post-expiry issuance, foreign request/token denials, duplicate/concurrent requests, durable review routing, no automatic worker claim, managed-execution denial, receipts available during intake Hold, unchanged existing execution/request/read functions and ACLs, and installation rejected on source drift.
- **44 original PostgreSQL intake assertions** remain passing for the historical 060 installation/control contract.
- **50 Admin deletion/intake/authorization/recovery tests** and Admin TypeScript checking pass.

The claim-validation dependency in the focused fixture is a synthetic fenced-claim adapter, not a full provider erasure rehearsal. Existing destructive lifecycle/Edge acceptance evidence remains authoritative for those unchanged components. No synthetic production request, financial transaction, account erasure or approval impersonation was performed.

Reproduce locally with `node scripts/test-deletion-intake-separation.cjs` against the hardcoded disposable PostgreSQL 17 fixture port. Its fixtures retain the actual pending policy and live function definitions/ACLs needed for reproducibility; they contain no test approvals presented as production evidence.

## Migration approval and rollout

The owner explicitly requires approval **before any new production migration**. Approval of intake and receipt validity is not treated as approval to apply unreviewed SQL. The [manifest](../../scripts/manual/deletion-intake/manifest.json) pins the two SQL files, normalized SHA-256 checksums and reserved journal versions `20261020171801` and `20261020171802` for Supabase `kzdvunpuxaxlphqvmzxw`.

After reviewing/committing the exact sources, the prepared controller defaults to read-only:

```text
node scripts/manual/deletion-intake/apply-and-verify.cjs
```

**Only after explicit migration approval**, run the same command with `--apply`. Both migrations and their journal entries commit atomically. The tool pins the project and committed/checksummed sources, checks Disabled/managed-execution-false baseline, verifies preserved business/request/receipt data and immutable v1, and checks unchanged critical functions/ACLs. It does not invent an MFA identity or execute the operating command. On a client interruption, inspect the journal; never infer rollback or replay blindly.

Then:

1. Run `node scripts/manual/deletion-intake/apply-and-verify.cjs --verify` and `node scripts/verify-deletion-intake-readiness.cjs`. Intake should be ready but still Disabled; execution blockers should remain listed separately.
2. Deploy the reviewed Admin wording changes through the existing production process, preserving the running backend and web/Mobile contracts.
3. In a genuine authorized MFA Admin session, use the existing operating control to set Enabled with the current operating version, a fresh operation UUID and the owner's intake-only reason. Do not synthesize JWT claims, borrow a database identity or bypass MFA.
4. Read back authoritative Enabled state and its command receipt/audit actor, timestamp, reason, Disabled→Enabled transition and operating version. Recheck managed execution false, Shop false, unchanged request/receipt/evidence counts, exact policy and private permissions. Inspect the existing review UI without creating a production request. Live success must not be inferred from local tests or an unconfirmed command response.

Before commit, any migration failure rolls back. After commit, retain the schema journal, immutable policy history and accepted requests. For operational containment, use the same MFA control to Hold/Disable **new intake**; existing receipts/reviews remain available. Do not restore the old execution-coupled gate, delete audit history, disable barriers/RLS or roll back valid financial records.

**Remaining activation step:** explicit approval of the two production migrations, then controlled application and the already-authorized MFA intake command. Full accountant/partner/backup retention decisions remain execution work, not additional prerequisites for receiving requests under this correction.
