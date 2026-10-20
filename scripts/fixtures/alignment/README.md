# Alignment SQL contract fixtures

These fixtures contain schema metadata, enums and function definitions captured through a read-only production transaction. They contain no customer records. Fixture rows created by the test runner are synthetic and isolated; the fixture is not a full production clone and does not model every production constraint, trigger or external processor.

`schema.json` supplies actual column/default/type contracts. `production-functions.sql` supplies the existing readers, participation, achievement and brand authorities. The test adds minimal dependent tables and exercises the candidate migrations, including production-style default grants, before making behavioral assertions. Release rehearsal must also use the full current database constraint/trigger set.

Use sibling checkouts named `movrr-admin`, `movrr-app` and `movrr-mobile`. Install their existing dependencies. Start an exclusively local PostgreSQL 17 test container on port 55439 using database user `postgres` and the test-only password `isolated-local-test-only`. Use the already available `public.ecr.aws/supabase/postgrest:v16.4` image for HTTP checks. For example:

```powershell
docker run --detach --name movrr-alignment-postgres --label movrr.task=enterprise-alignment --publish 127.0.0.1:55439:5432 --env POSTGRES_PASSWORD=isolated-local-test-only postgres:17
node scripts/test-alignment-database.cjs --http
node scripts/test-shop-preservation.cjs
```

The runners hardcode localhost and never load production environment variables. They create/drop only their own disposable databases; HTTP verification creates/removes its own API container. Remove the test container after use. The Shop wrapper executes the existing Mobile test without editing it and redirects diagnostics into Admin's ignored task storage.

`node scripts/inspect-alignment-contracts.cjs --check-baseline` is a separate, explicitly read-only production preflight. It checks captured functions, columns and enums for drift and verifies Shop remains disabled. It also reports aggregate locale compatibility and the deletion request gate. It does not execute candidate migrations or business commands. Its raw diagnostic snapshot is ignored; approved release evidence belongs in `docs/enterprise-alignment-verification.json`.
