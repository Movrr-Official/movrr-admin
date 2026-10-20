# Creation-workflow regression contracts

Captured through read-only production transactions on 2026-10-20. These files
contain schema/function metadata, not customer rows or credentials. They are
reproducible test inputs, not disposable diagnostics.

`schema.json` supplies actual columns/defaults/nullability, enum labels and
relevant check/unique constraints. Exact PostgreSQL formatted types are recorded
for route/campaign geometry contracts. Function files preserve the actual route
path validator, organisation/partner transaction, location transaction, catalog
authorization/transaction and invitation acceptance definitions.

`node scripts/test-creation-workflows.cjs` uses a dedicated localhost PostgreSQL
17 + PostGIS database on port 55443. It never loads `.env`. It creates/drops only
its own database. The runner adds relevant foreign keys and small dependency
tables. It is not a full production database clone and does not execute financial
fulfilment, production migrations, email providers or production accounts.

The invitation baseline is copied under a test-only function name and its
exception handler rethrows locally to prove the original `team_id` ambiguity.
The candidate function retains the public response contract and is tested for
transaction rollback, concurrent acceptance and replay using an existing employee.

For Auth timing and SDK contracts, run the separate opt-in real GoTrue HTTP
tests documented in `docs/security/admin-creation-workflows.md`.
