# Community Safety rollout gate

The owner authorized a controlled production rollout on 23 October 2026 only after
successful preflight. It stopped before apply/deployment. See the authoritative
[operating policy](../../../docs/operations/community-safety.md). This directory
now also contains explicit owner-authorized pre-launch apply/relocate/deploy commands.
The earlier support-population gate is superseded by the owner?s no-public-rider-base
decision. The pinned migration has been applied: do not reapply it. Use read-only
verify/acceptance commands for follow-up and inspect journal/receipts after interruption.

From `movrr-admin`:

For pre-build read-only acceptance, preserve earlier captures with a separate output
directory. Neither command applies migrations, signs/uploads/deletes objects, purges
caches or invokes a production mutation:

```powershell
$env:MOVRR_COMMUNITY_PREFLIGHT_DIR='.tmp/community-safety-prebuild-20261023'
node scripts/manual/community-safety/preflight.cjs
node scripts/manual/community-safety/prebuild.cjs
```

The second command records current public CDN behavior and exact cover/reference
mapping with byte hashes and proposed immutable destinations. Its private recovery
copy and CDN revocation flags remain false: a reference manifest is not an object
backup or a completed cutover. Keep the exact mapping confidential in ignored local
release evidence. It uses existing Rider IDs only in read-only authenticated-role
SQL; that is not a real Auth/JWT session or new mutation acceptance. No installed
adoption is inferred. Unexpected non-public covers in the public bucket fail closed.
See the current pre-build decision in the rollout procedure before any execution.

```powershell
node scripts/manual/community-safety/preflight.cjs --schema-only
docker run --detach --pull=never --name movrr-safety-rollout-rehearsal-20261023 --publish 127.0.0.1:55469:5432 --env POSTGRES_PASSWORD=isolated-local-test-only public.ecr.aws/supabase/postgres:17.11.0.004
docker exec movrr-safety-rollout-rehearsal-20261023 psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c 'ALTER ROLE postgres SUPERUSER'
node scripts/manual/community-safety/rehearse.cjs
```

Use a dedicated container with the exact name and port above. Never repurpose an
existing container. The privileged role adjustment is exclusively for this local
restoration; it must never be run on Supabase. Local databases drop in `finally`.
Remove only this container after inspecting its identity. No test script creates
production records or sends notifications. No external provider is simulated as
having delivered or moderated content.

`preflight.cjs` pins project `kzdvunpuxaxlphqvmzxw`, loads the existing Admin `.env`
privately, sets `default_transaction_read_only=on` and opens a repeatable-read,
read-only transaction. The schema dump also forces read-only connections. It
exports public/Auth/Storage definitions, never table data or login credentials.
Definitions can contain operational endpoints; keep the dump in task-specific
ignored `.tmp/community-safety-rollout-20261023`, not a public report or another
schema authority. The retained dump and `preflight.json` are the input fixtures
for this historical rehearsal; fresh preflight produces new inputs. Receipts with
aggregate hashes/counts and no rider records are committed under
`docs/verification/community-safety-rollout`.

The restore uses `--no-owner`, locally recreated role names/BYPASSRLS attributes
and extension prerequisites. Production data, role memberships and scheduled jobs
are not cloned. An inert local notification trigger prevents outbound delivery.
The schema dump's session `row_security=off` is reset before authenticated checks.
Do not interpret this as full erasure, production authorization, byte-storage,
native-device or UI acceptance. Existing byte-storage/HTTP evidence is preserved
in the earlier audit; unchanged suites need not be rerun.

The lifecycle probe intentionally records whether restricted-account report/block
writes succeed. A zero exit code means the diagnostic completed; **it does not
mean rollout gates passed**. Gate evaluation must include those fields, old-client
compatibility, retention/closure/hold/disposal controls, disclosures, operational
coverage and recovery readiness. Prior to any future apply, re-read production
source/alias/journal and recheck the final changed checksum. Do not promote an
older Admin revision or enable unrelated operating gates.

Production closure: `production.cjs verify`, `accept-production.cjs` and `privacy-readiness.cjs` preserve exact source/receipt evidence in `.tmp/community-safety-production-20261023`. The latter is strictly read-only and never invokes a disposal worker. No disposal worker/schedule was activated; future irreversible disposal needs explicit operational authority. Keep confidential recovery records/originals out of Git. Source, data-preservation and guarded transition checks are recorded in the rollout procedure and current verification receipt.
