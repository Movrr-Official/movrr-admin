# Community production contract fixture

Read-only schema metadata captured 2026-10-20 from the established MOVRR Supabase database: function definitions/ACL, Community/grant/participant policies including permissive vs restrictive types, non-internal ride triggers and Auth ban/deletion column contracts. No customer records or credentials are included.

`test-community-authorization.cjs` uses the existing alignment schema fixture, then installs the captured ride/grant policies and Community function definitions. It installs enrolment, timestamp and lifecycle triggers. Existing account-deletion triggers are not reconstructed here; their source and operating state are unchanged and remain covered by the deletion-specific suites. This is an isolated authorization reconstruction, not a production database clone.

Run against the existing local-only PostgreSQL 17 test connection on 127.0.0.1:55439. `--http` additionally starts and removes a localhost-only PostgREST v16.4 container. Neither script loads `.env` or production credentials. Both use only synthetic disposable records and the database is dropped afterward.

The Safety test installs `safety-deployed-contracts.json`, captured read-only on
2026-10-23: all 19 current Community and four cover Storage policies, plus the
current identity/roster/path helper definitions, ownership and execution grants.
It asserts exact installed policy equality before applying candidate 082. This
includes the identity-status/capability changes absent from the older
creator-approval baseline. The older fixture remains for pre-065 authorization
reproduction; it is not the current Safety policy authority. With `--storage`,
the installed Supabase Storage API v1.79.36 image initializes its actual schema
and transfers synthetic PNG bytes using a disposable local file backend and a
dynamically allocated localhost port. The service/container/database are removed
after the run. This still does not reconstruct full account-deletion barriers or
production CDN behavior. No production permission or operating gate is changed.
