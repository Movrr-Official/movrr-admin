# Approved Admin creation and role-integrity rollout

Production rollout completed on 2026-10-20. The owner explicitly approved the
ordered migrations 068 → 069 and Admin commit
`7d5d53753a1c68b10c49ec614e4360c580e8f9ce`.

| Migration | Journal version | Normalized LF SHA-256 |
| --- | --- | --- |
| 068_employee_provisioning | 20261020195301 | ef473752c15d0406961d96375642378f96cd442744f45980e32216dbcce6528c |
| 069_admin_creation_transactions | 20261020195302 | f54359db7ebb47ab6068fc078136bf3ee8223ff67ba1c28a3de787eea543d4dc |

Both journal entries and both exact SQL files committed together in one database
transaction, executing 068 before 069. The installer verified all 13 function
bodies and protected-data fingerprints before commit. Existing migrations,
canonical capability definitions, seven captured function dependencies, 327
columns, 22 enums, 57 constraints, 82 formatted types and Auth/profile triggers
were checked before application.

Remote main was fast-forwarded to the exact approved commit without a merge or
runtime integration edits. The existing cleanup evidence commits were preserved.
The previous production deployment's dirty source upload was compared against
the baseline: after line-ending normalization, the only substantive runtime
difference was the user-creation form covered by this release. No unrelated
runtime changes were integrated.

Vercel built directly from the approved Git SHA with production-domain assignment
disabled. After the build succeeded and migrations committed, the ready build
was promoted to `admin.movrr.nl`:

- Deployment: `dpl_2Hvf87yio6ZWFxzzRprx4S6EA4xn`
- Git source: `7d5d53753a1c68b10c49ec614e4360c580e8f9ce`
- State: READY; production domain lookup resolves to that deployment.

## Verification results

- `partner_operations_manager` resolves through canonical employee capabilities;
  it is absent from the legacy user_role enum. Provisioning uses a coarse public
  admin identity and the exact admin_users employee grant. Tenant membership is
  a separate authority and is not silently granted.
- Installed function bodies match the approved migration source. RPC/helper
  permissions and journal RLS deny end-user direct access. Six read-only SQL
  checks reject missing service claims, missing actors, the incident Rider as
  grantor, invalid roles and employee/organisation domain mixing.
- Live PostgREST recognizes the new RPCs. Three missing-actor requests return
  403/42501; anonymous employee provisioning returns 401/42501. All fail before
  writes. The service credential used was already configured locally; no new
  production credential retrieval was used.
- Live sign-in returns 200. Protected user creation, campaign GET/POST and
  suggested-route POST redirect unauthenticated callers to sign-in. The
  fulfilment API rejects unauthenticated callers with 401.
- The approved implementation's isolated evidence remains 732 tests in 67 files,
  including 33 PostgreSQL provisioning and seven real GoTrue HTTP tests; 79
  creation assertions; eight rollback assertions; 306 Shop and 87 deletion
  preservation assertions; typecheck and optimized build passed. All seven real
  Auth tests were rerun for rollout, with an added ordinary Rider password-login
  assertion. They passed. The deployed runtime source was not changed by this
  test-only addition.
- Isolated tests establish exact employee grants/status, absence of employee
  Rider profiles, banned/pending recovery after grant failure, same-UUID retry,
  concurrent/replay deduplication, existing-user invitations, tenant ownership
  restrictions and denial of unauthorized role overwrites. Successful creation
  was not exercised against production, as the owner prohibited synthetic users.
- Auth and all protected public identity, membership and financial table counts
  and full-row fingerprints match before migration, immediately after migration,
  and after production verification. All three new provisioning/creation journals
  are empty. No test identities or memberships were created.
- The incident identity `007b5ab8-fea0-41f2-9068-055f154d7db0` remains unchanged:
  active public Rider, active Rider profile, no employee grant or organisation
  membership. Auth, public-user and Rider row fingerprints match exactly.
- Deletion intake remains enabled with policy 2; managed irreversible execution
  remains disabled. Shop state and redemption remain disabled. No Mobile files,
  EAS/OTA builds, financial test mutations or unrelated deployments were made.

## Evidence and limits

`applied.json` records journal identities, dependency checks, installed contracts
and transaction-preservation fingerprints. `post-deployment.json` records
independent journal readback, SQL denial checks and the final snapshot.
`deployment.json`, `http-smoke.json`, `rpc-smoke.json` and
`source-comparison.json` establish deployed provenance and external denials.

No new rollout defects were detected. The incident account's original incorrect
classification remains deliberately unrepaired under the owner's instructions.
External email delivery is not certified exactly once. Existing employee
data-scope presets retain their documented dashboard semantics; this release
does not introduce new row-level employee tenancy. Auth and PostgreSQL remain a
durable recoverable workflow, not a distributed transaction.

Automatic approval review rejected downloading production environment values to
a local file because it would retrieve secrets. Verification continued using
environment-variable metadata, Git-source build provenance and safe live HTTP/
RPC checks. This did not block the rollout or require credential export.

Reproducible tools are in `scripts/manual/creation-workflows/README.md`. Further
production schema changes or deployments require their own authorization.
