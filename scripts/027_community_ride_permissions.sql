-- Migration 027: Community ride organizers and creator permissions
-- Separates ride ownership/organizer identity from rider participation and
-- introduces RLS-backed creator grants for rider-created community rides.

CREATE TABLE IF NOT EXISTS public.community_ride_creator_grant (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note                TEXT,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crcg_active
  ON public.community_ride_creator_grant(user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.community_ride
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organizer_type TEXT,
  ADD COLUMN IF NOT EXISTS organizer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organizer_name TEXT;

UPDATE public.community_ride cr
SET
  created_by_user_id = COALESCE(
    cr.created_by_user_id,
    (
      SELECT r.user_id
      FROM public.rider r
      WHERE r.id = cr.organizer_rider_id
      LIMIT 1
    )
  ),
  organizer_type = COALESCE(
    cr.organizer_type,
    CASE
      WHEN cr.organizer_rider_id IS NOT NULL THEN 'rider'
      ELSE 'movrr'
    END
  ),
  organizer_user_id = COALESCE(
    cr.organizer_user_id,
    (
      SELECT r.user_id
      FROM public.rider r
      WHERE r.id = cr.organizer_rider_id
      LIMIT 1
    )
  ),
  organizer_name = COALESCE(
    NULLIF(cr.organizer_name, ''),
    (
  SELECT NULLIF(TRIM(COALESCE(u.name, '' )), '')
  FROM public.rider r
  JOIN public."user" u
    ON u.id = r.user_id
  WHERE r.id = cr.organizer_rider_id
  LIMIT 1
),
    'MOVRR'
  );

ALTER TABLE public.community_ride
  ALTER COLUMN organizer_type SET DEFAULT 'movrr',
  ALTER COLUMN organizer_name SET DEFAULT 'MOVRR',
  ALTER COLUMN organizer_type SET NOT NULL,
  ALTER COLUMN organizer_name SET NOT NULL;

ALTER TABLE public.community_ride
  DROP CONSTRAINT IF EXISTS community_ride_organizer_type_check;

ALTER TABLE public.community_ride
  ADD CONSTRAINT community_ride_organizer_type_check
  CHECK (organizer_type IN ('rider', 'admin', 'movrr'));

CREATE INDEX IF NOT EXISTS idx_community_ride_organizer_user
  ON public.community_ride(organizer_user_id)
  WHERE organizer_user_id IS NOT NULL;

COMMENT ON TABLE public.community_ride_creator_grant IS
  'Users explicitly allowed to create community rides from rider-facing surfaces.';

COMMENT ON COLUMN public.community_ride.created_by_user_id IS
  'Auth user who created the ride record.';

COMMENT ON COLUMN public.community_ride.organizer_type IS
  'Display/source identity for the ride organizer: rider, admin, or MOVRR.';

COMMENT ON COLUMN public.community_ride.organizer_user_id IS
  'Auth user linked to the organizer when applicable.';

COMMENT ON COLUMN public.community_ride.organizer_name IS
  'Display-safe organizer label persisted with the ride.';

CREATE OR REPLACE FUNCTION public.set_community_ride_creator_grant_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_ride_creator_grant_updated_at
  ON public.community_ride_creator_grant;

CREATE TRIGGER trg_community_ride_creator_grant_updated_at
  BEFORE UPDATE ON public.community_ride_creator_grant
  FOR EACH ROW
  EXECUTE FUNCTION public.set_community_ride_creator_grant_updated_at();

CREATE OR REPLACE FUNCTION public.can_create_community_ride(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.community_ride_creator_grant cg
    WHERE cg.user_id = p_user_id
      AND cg.revoked_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.can_create_community_ride(UUID) IS
  'Returns true when the supplied auth user may create a community ride.';

GRANT EXECUTE ON FUNCTION public.can_create_community_ride(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.community_ride_enrol_organizer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organizer_type = 'rider' AND NEW.organizer_rider_id IS NOT NULL THEN
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
DROP TRIGGER IF EXISTS enrol_organiser_on_community_ride_create ON public.community_ride;

CREATE TRIGGER trg_community_ride_enrol_organizer
  AFTER INSERT ON public.community_ride
  FOR EACH ROW
  EXECUTE FUNCTION public.community_ride_enrol_organizer();

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
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rider r
    WHERE r.id = p_rider_id
      AND r.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

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

ALTER TABLE public.community_ride_creator_grant ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own community ride grant"
  ON public.community_ride_creator_grant;
CREATE POLICY "Users can read own community ride grant"
  ON public.community_ride_creator_grant
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Community ride organizers can read own rides" ON public.community_ride;
CREATE POLICY "Community ride organizers can read own rides"
  ON public.community_ride
  FOR SELECT
  USING (
    organizer_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Community ride participants can read joined rides" ON public.community_ride;
CREATE POLICY "Community ride participants can read joined rides"
  ON public.community_ride
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_ride_participant crp
      JOIN public.rider r
        ON r.id = crp.rider_id
      WHERE crp.community_ride_id = community_ride.id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Approved riders can create community rides" ON public.community_ride;
CREATE POLICY "Approved riders can create community rides"
  ON public.community_ride
  FOR INSERT
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND organizer_type = 'rider'
    AND organizer_user_id = auth.uid()
    AND organizer_rider_id IS NOT NULL
    AND public.can_create_community_ride(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.rider r
      WHERE r.id = organizer_rider_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Rider organizers can update own rides" ON public.community_ride;
CREATE POLICY "Rider organizers can update own rides"
  ON public.community_ride
  FOR UPDATE
  USING (
    organizer_type = 'rider'
    AND organizer_user_id = auth.uid()
  )
  WITH CHECK (
    organizer_type = 'rider'
    AND organizer_user_id = auth.uid()
    AND organizer_rider_id IS NOT NULL
  );

DROP POLICY IF EXISTS "Participants visible on public rides" ON public.community_ride_participant;
CREATE POLICY "Participants visible on public rides"
  ON public.community_ride_participant
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_ride cr
      WHERE cr.id = community_ride_id
        AND cr.is_public = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.rider r
      WHERE r.id = rider_id
        AND r.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.community_ride cr
      WHERE cr.id = community_ride_id
        AND cr.organizer_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Riders can leave their own community rides" ON public.community_ride_participant;
CREATE POLICY "Riders can leave their own community rides"
  ON public.community_ride_participant
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.rider r
      WHERE r.id = rider_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rider r
      WHERE r.id = rider_id
        AND r.user_id = auth.uid()
    )
  );
