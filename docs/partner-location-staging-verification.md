# Partner locations: controlled staging verification

Staging status: NOT EXECUTED. No authorized isolated staging connection is available. Local PostgreSQL 17.6 verification completed on 2026-10-12 using disposable Docker resources; see [local verification and remaining gates](partner-location-local-verification.md) and [exact execution evidence](partner-location-local-verification.json). Local success does not establish deployed Supabase/staging acceptance.

## Ordering and compatibility

Inspect the real migration ledger and schema before any application. Required: reward-catalog base schema; 040/045 Organisation identity; 041 rate counters; 046 atomic rate limiter. Apply 051 only after prerequisites. The new organisation atomic RPC is required before deploying the changed Organisation store. Fail closed if missing; no non-atomic fallback.

051 is currently an untracked candidate. If any environment has already applied an earlier 051, do not edit its migration ledger or pretend replay is an upgrade: prepare an additive forward migration containing the reviewed corrected function definitions after inspecting that environment. IF NOT EXISTS does not reconcile drift.

Verify actual column types, composite index eligibility, partner uniqueness, existing foreign keys, roles, default ACLs, auth.users references, and PostgREST relationship resolution. Reject drift rather than applying guessed repair SQL.

## Lifecycle policy

Existing inactive/suspended statuses archive a partner operationally and exclude its locations from discovery. Location records, links and audit history remain intact. Automatic relinking remains permitted for partners without locations; it is rejected atomically when physical locations exist. Organisation create/update and partner linking now share one transaction. Existing restrictive foreign keys prevent hard deletion of referenced identities. No cascading deletion or location transfer policy is introduced.

Product decision still required: retention duration, approved physical-location transfer workflow, and irreversible identity deletion. Until approved, no hard-delete UI/RPC is added.

## Verification

On a disposable clone or explicitly authorized staging database, with backups and ON_ERROR_STOP, apply reviewed prerequisites and 051; execute scripts/tests/051_partner_locations.integration.sql. Fixtures and mutations roll back. Inspect anon/authenticated table and mutation-RPC denial, service-role access, HTTP rider/admin capability checks, actual timestamp list/edit/save responses, stale-version 409, cross-partner association rollback, suspended/unpublished visibility, and relink/delete behavior. Test two concurrent edits and two concurrent rate-limiter sessions: at most 30 accepted hits in one fixed minute, no lost updates. Test actual PostgREST cursor pages at 0/100/101/300/>300 locations and organisation branches. Capture correlated sanitized infrastructure errors, 429 Retry-After, and plans under representative density.

Use real EXPLAIN ANALYZE/BUFFERS, write-lock observation and native HTTP evidence; mocked TypeScript tests do not satisfy these checks.

## Backup and recovery

Take and verify a restorable database backup before rollout. Record migration version, grants and function definitions. Set a bounded lock_timeout/statement_timeout for the maintenance window. A failed 051 transaction rolls back its changes; verify schema before retry.

After successful installation and any location writes, do not DROP new tables to roll back. Preserve/export location, association and audit data; keep discovery gates closed; restore the prior application and retain schema. Organisation operations require a compatible atomic RPC, so restore that store/RPC together. Any data restoration or schema downgrade requires an approved recovery plan and rehearsal on a clone. No destructive down migration is provided.
