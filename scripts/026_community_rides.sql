-- Migration 026: Community Rides
-- Creates the community_ride and community_ride_participant tables.
-- Also creates the join_community_ride RPC that enforces capacity atomically.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- CREATE POLICY IF NOT EXISTS / CREATE OR REPLACE FUNCTION throughout.

-- ─── community_ride ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_ride (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_rider_id   UUID REFERENCES public.rider(id) ON DELETE SET NULL,
  title                TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description          TEXT,
  scheduled_at         TIMESTAMPTZ NOT NULL,
  meeting_point_name   TEXT,
  meeting_point_lat    DOUBLE PRECISION,
  meeting_point_lng    DOUBLE PRECISION,
  route_id             UUID REFERENCES public.route(id) ON DELETE SET NULL,
  max_participants     INTEGER NOT NULL DEFAULT 20
                         CHECK (max_participants BETWEEN 2 AND 100),
  bike_types_allowed   TEXT[],
  category             TEXT NOT NULL DEFAULT 'social'
                         CHECK (category IN ('beginner', 'intermediate', 'challenging', 'social')),
  status               TEXT NOT NULL DEFAULT 'upcoming'
                         CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
  is_public            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_ride_status
  ON public.community_ride(status);

CREATE INDEX IF NOT EXISTS idx_community_ride_scheduled_at
  ON public.community_ride(scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_ride_organizer
  ON public.community_ride(organizer_rider_id)
  WHERE organizer_rider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_ride_public_upcoming
  ON public.community_ride(status, scheduled_at)
  WHERE is_public = true;

COMMENT ON TABLE public.community_ride IS
  'Admin- or rider-created group cycling events. '
  'Riders discover and join public rides from the mobile app. '
  'Admins manage the full lifecycle from the admin dashboard.';

-- ─── community_ride_participant ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_ride_participant (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_ride_id UUID NOT NULL REFERENCES public.community_ride(id) ON DELETE CASCADE,
  rider_id          UUID NOT NULL REFERENCES public.rider(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'joined'
                      CHECK (status IN ('joined', 'left', 'removed')),
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (community_ride_id, rider_id)
);

CREATE INDEX IF NOT EXISTS idx_crp_ride_id
  ON public.community_ride_participant(community_ride_id);

CREATE INDEX IF NOT EXISTS idx_crp_rider_id
  ON public.community_ride_participant(rider_id);

CREATE INDEX IF NOT EXISTS idx_crp_ride_status
  ON public.community_ride_participant(community_ride_id, status);

COMMENT ON TABLE public.community_ride_participant IS
  'Participants for each community_ride. '
  'Status tracks join/leave/removal lifecycle. '
  'Only riders with status=joined count toward capacity.';

-- ─── Auto-enrol organizer trigger ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_ride_enrol_organizer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only enrol if an organizer is set (admin-created rides may have none).
  IF NEW.organizer_rider_id IS NOT NULL THEN
    INSERT INTO public.community_ride_participant
      (community_ride_id, rider_id, status, joined_at)
    VALUES
      (NEW.id, NEW.organizer_rider_id, 'joined', NOW())
    ON CONFLICT (community_ride_id, rider_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_ride_enrol_organizer ON public.community_ride;
CREATE TRIGGER trg_community_ride_enrol_organizer
  AFTER INSERT ON public.community_ride
  FOR EACH ROW EXECUTE FUNCTION public.community_ride_enrol_organizer();

-- ─── Atomic join RPC ─────────────────────────────────────────────────────────
-- Called from the mobile app to join a ride. Enforces capacity cap and
-- active-ride guard atomically under a row-level lock.

CREATE OR REPLACE FUNCTION public.join_community_ride(
  p_community_ride_id UUID,
  p_rider_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride        RECORD;
  v_active_cnt  INTEGER;
BEGIN
  -- Lock the ride row to prevent concurrent over-booking.
  SELECT id, status, max_participants, is_public
    INTO v_ride
    FROM public.community_ride
   WHERE id = p_community_ride_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_found');
  END IF;

  IF v_ride.status NOT IN ('upcoming', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_joinable');
  END IF;

  SELECT COUNT(*)
    INTO v_active_cnt
    FROM public.community_ride_participant
   WHERE community_ride_id = p_community_ride_id
     AND status = 'joined';

  IF v_active_cnt >= v_ride.max_participants THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_full');
  END IF;

  INSERT INTO public.community_ride_participant
    (community_ride_id, rider_id, status, joined_at)
  VALUES
    (p_community_ride_id, p_rider_id, 'joined', NOW())
  ON CONFLICT (community_ride_id, rider_id)
    DO UPDATE SET status = 'joined', joined_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.join_community_ride IS
  'Atomically joins a rider to a community ride. '
  'Enforces max_participants cap under row-level lock. '
  'Returns {success: bool, error?: string}.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.community_ride ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ride_participant ENABLE ROW LEVEL SECURITY;

-- Public rides: any authenticated user can read upcoming/active public rides.
DROP POLICY IF EXISTS "Public upcoming rides are readable" ON public.community_ride;
CREATE POLICY "Public upcoming rides are readable"
  ON public.community_ride
  FOR SELECT
  USING (
    is_public = true
    AND status IN ('upcoming', 'active')
  );

-- Admins can read all rides.
DROP POLICY IF EXISTS "Admins can read all community rides" ON public.community_ride;
CREATE POLICY "Admins can read all community rides"
  ON public.community_ride
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Admins can write (insert/update/delete) via service role only.
-- Application mutations use createSupabaseAdminClient (service role key) so
-- no INSERT/UPDATE/DELETE RLS policies are required for the admin dashboard.

-- Participants: riders can see participants for rides they've joined or that are public.
DROP POLICY IF EXISTS "Participants visible on public rides" ON public.community_ride_participant;
CREATE POLICY "Participants visible on public rides"
  ON public.community_ride_participant
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_ride cr
      WHERE cr.id = community_ride_id
        AND (
          cr.is_public = true
          OR rider_id = auth.uid()
        )
    )
  );

-- Admins can read all participant records.
DROP POLICY IF EXISTS "Admins can read all participants" ON public.community_ride_participant;
CREATE POLICY "Admins can read all participants"
  ON public.community_ride_participant
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
    )
  );
