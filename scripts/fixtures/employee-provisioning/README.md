# Original Auth bootstrap fixture

`handle_new_user.sql` is the unchanged production function captured read-only on
2026-10-20. It demonstrates the invalid-enum-to-Rider fallback. Candidate
migration 068 guards its inputs using durable provisioning reservations; it does
not expand the role enum or replace ordinary Rider signup.

The PostgreSQL and real GoTrue regression suites use synthetic accounts only.
The real Auth test uses the available `supabase/gotrue:v2.197.0` image and removes
its own container and database after the run. No production credentials are read.
