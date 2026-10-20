# Migration 065 production rollout

Applied with explicit owner authorization to Supabase project `kzdvunpuxaxlphqvmzxw` as journal version `20261020151107` on 2026-10-20. The migration SQL is unchanged from tested revision `be89fbcd11c368d66c9cb8ab9b1fda292aecc59d`.

Tested working-artifact SHA-256 (CRLF): `6e95dea6827fc7cc02dd88e09d9922739c2281e84f5a98377f29536aa8155f3f`.
Git blob SHA-256 (LF): `afa04c953bc540a4411030b7dbe4fd75803f18da47682b66c359397c591bc940`.
Normalized source content was verified identical; the journal stores the exact tested artifact and its checksum in the idempotency key.

## Verification

- `node scripts/manual/community-approval/verify-production.cjs` is read-only. It uses existing identities with transaction-local authenticated claims, evaluates the exact restrictive INSERT policy as a SELECT, and calls the real creation RPC with an invalid null operation. Denied identities fail with 42501; eligible identities reach validation and fail with 22023 before any INSERT. It never inserts a production ride, mutates an identity or changes a grant.
- `node scripts/manual/community-approval/apply-and-verify.cjs --verify` is read-only. It checks the journal checksum, exact deployed function bodies, trigger and function privileges, then compares protected catalog and data digests against the committed integrity baseline. It expects this Windows checkout's tested CRLF artifact bytes; the standalone verifier above does not depend on checkout line endings.
- `apply-and-verify.cjs` without flags is a read-only preflight and intentionally refuses an already journaled migration. `--apply` is the production write operation and requires explicit authorization. Do not use it to blindly replay a journaled migration. It compares source with the approved revision/checksum, uses a single transaction for the exact migration body and journal entry, takes short-lived Community SHARE locks, and rolls back if protected data or unrelated catalogs differ. It writes no business records.

The digest comparisons are deployment-time acceptance checks. Later legitimate ride or catalog changes can produce drift; investigate that drift rather than replaying or rolling back the migration automatically.

The journal contains the original rollback SQL. `rollback.sql` restores the pre-065 authorization gap and requires explicit production authorization. It was not run in production.

Evidence: `docs/verification/community-065-rollout/production.json` and `integrity-baseline.json`. Raw catalog diagnostics stay in task-specific ignored `.tmp/` storage and may be removed after preserving the release evidence. No credentials, names, account IDs or individual ride records are exported.

No production subjects currently represent suspended, Auth-banned, deleted or revoked-grant cases. Their guards match the exact tested source; earlier isolated PostgreSQL/PostgREST tests exercise those states. Production acceptance intentionally does not claim successful mutation tests or Mobile sign-in coverage. Admin approval controls retain their existing RBAC, service permissions, RLS and auditing; no production grant/revocation was performed.
