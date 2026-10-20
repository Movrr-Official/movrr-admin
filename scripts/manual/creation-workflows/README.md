# Controlled creation-workflow production checks

`production-rollout.cjs` pins the approved source commit and normalized migration
checksums. It loads the existing root `.env` without printing credentials and
asserts the production project identity. Run from the Admin repository:

```powershell
node scripts/manual/creation-workflows/production-rollout.cjs --verify
node scripts/manual/creation-workflows/verify-http.cjs
node scripts/manual/creation-workflows/verify-rpc.cjs
```

The first command uses read-only transactions, validates installed function
bodies, ACLs, journal checksums, canonical capability resolution and operating
gates, and exercises failure-only SQL contracts. The HTTP check sends only
unauthenticated requests. The RPC check sends missing-actor/anonymous requests
that fail before side effects. Neither creates synthetic production identities,
invites users, changes grants or tests financial mutations. RPC verification uses
the already configured local credential; it does not export production secrets.
Outputs go to ignored `.tmp/admin-creation-rollout`.

The installer's default mode is read-only preflight for an uninstalled release;
it refuses existing journal entries. Its `--apply` mode was used once under the
owner's explicit approval to install 068 then 069 atomically with journal rows.
It is not a general-purpose migration runner or an authorization for further
production changes. After interruption, inspect the journal; never infer
rollback or replay blindly.

`rollback-unused.sql` is preserved as reviewed rollback tooling. It refuses to
discard used provisioning or role-assignment evidence. Do not roll back to the
unsafe employee-create behavior as containment. Any rollback or new production
schema change requires explicit approval.

The production evidence is in `docs/verification/admin-creation-rollout/`.
