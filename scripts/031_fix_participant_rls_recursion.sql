-- Migration 031: Fix infinite recursion in community_ride_participant RLS
--
-- Root cause:
--   • community_ride policy "Community ride participants can read joined rides"
--     queries community_ride_participant
--   • community_ride_participant policy "Participants visible on public rides"
--     queries community_ride (to check is_public / organizer_user_id)
--   • Postgres detects the cycle and throws 42P17
--
-- Fix:
--   Wrap the community_ride lookups inside the participant policy in a
--   SECURITY DEFINER function. SECURITY DEFINER bypasses RLS on community_ride,
--   so the lookup does not re-trigger community_ride's RLS policies.

-- ─── Helper: check ride visibility without triggering community_ride RLS ───────

CREATE OR REPLACE FUNCTION public.community_ride_participant_read_allowed(
  p_ride_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_ride
    WHERE id = p_ride_id
      AND (
        is_public = true
        OR organizer_user_id = auth.uid()
      )
  );
$$;

COMMENT ON FUNCTION public.community_ride_participant_read_allowed(UUID) IS
  'Returns true when the calling user may read participant rows for the given ride. '
  'SECURITY DEFINER: reads community_ride without triggering its RLS policies, '
  'which avoids the mutual-recursion loop between the two tables'' RLS policies.';

GRANT EXECUTE ON FUNCTION public.community_ride_participant_read_allowed(UUID)
  TO authenticated;

-- ─── Recreate the participant SELECT policy using the helper ──────────────────

DROP POLICY IF EXISTS "Participants visible on public rides"
  ON public.community_ride_participant;

CREATE POLICY "Participants visible on public rides"
  ON public.community_ride_participant
  FOR SELECT
  USING (
    -- Ride is public or caller is the organizer (resolved without RLS recursion)
    public.community_ride_participant_read_allowed(community_ride_id)
    -- Caller is the participant themselves
    OR EXISTS (
      SELECT 1 FROM public.rider r
      WHERE r.id = rider_id
        AND r.user_id = auth.uid()
    )
  );
