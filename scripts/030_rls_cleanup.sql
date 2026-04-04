-- Migration 030: RLS Cleanup
--
-- Drops legacy permissive policies that were left behind from the initial schema.
-- These coexist with the hardened policies from later migrations and silently
-- override them — because Postgres ORs PERMISSIVE policies together.
--
-- Security impact before this migration:
--   • Any authenticated user can INSERT a community_ride (bypasses organizer grant check)
--   • Any authenticated user can UPDATE any community_ride (bypasses organizer ownership check)
--   • Any authenticated user can INSERT/UPDATE/DELETE community_ride_participant directly
--     (bypasses join/leave RPCs and their capacity + status guards)
--   • All public rides exposed regardless of status (cancelled rides visible to all)
--   • All participant rows visible to any authenticated user
--
-- After this migration:
--   • community_ride writes are scoped: approved riders INSERT own rides, organizers UPDATE own rides
--   • community_ride_participant writes go exclusively through SECURITY DEFINER RPCs
--   • community_ride reads are scoped: public upcoming/active only, plus organizer + participant + admin reads
--   • community_ride_participant reads scoped to public rides, own rows, own organised rides, admins

-- ─── community_ride ───────────────────────────────────────────────────────────

-- Allowed any authenticated user to insert with no field restrictions
DROP POLICY IF EXISTS "community_ride_insert" ON public.community_ride;

-- Allowed any authenticated user to read ALL public rides regardless of status
DROP POLICY IF EXISTS "community_ride_read" ON public.community_ride;

-- Allowed any authenticated user to update any ride
DROP POLICY IF EXISTS "community_ride_update" ON public.community_ride;

-- ─── community_ride_participant ───────────────────────────────────────────────

-- Allowed any authenticated user to read all participant rows
DROP POLICY IF EXISTS "community_ride_participant_read" ON public.community_ride_participant;

-- Allowed any authenticated user full INSERT/UPDATE/DELETE on participant rows
-- (bypassed join_community_ride and leave_community_ride RPCs entirely)
DROP POLICY IF EXISTS "community_ride_participant_write" ON public.community_ride_participant;

-- Direct UPDATE path for leaving — redundant now that leave_community_ride is
-- SECURITY DEFINER. Removing it forces leave to go through the RPC (which
-- enforces the ride-status guard).
DROP POLICY IF EXISTS "Riders can leave their own community rides" ON public.community_ride_participant;
