-- Migration 029: Community Ride Hardening
--
-- Prerequisite: 026 and 027 have already run.
--   • category column exists with type TEXT NOT NULL DEFAULT 'social'
--   • CHECK constraint covers ('beginner','intermediate','challenging','social')
--   • difficulty column has been dropped
--
-- This migration adds:
--   1. Index on category for filter performance
--   2. DB-level status-transition trigger (blocks all invalid lifecycle moves)
--   3. leave_community_ride() RPC with auth + status guard
--   4. join_community_ride() replacement that enforces is_public

-- ─── 1. Index on category ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_community_ride_category
  ON public.community_ride(category);

-- ─── 2. Status-transition trigger ────────────────────────────────────────────
-- Lifecycle:
--   upcoming  → active | cancelled
--   active    → completed | cancelled
--   completed → (terminal)
--   cancelled → (terminal)
-- Same-status updates always pass through.

CREATE OR REPLACE FUNCTION public.enforce_community_ride_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status = 'upcoming'  AND NEW.status IN ('active', 'cancelled'))  OR
     (OLD.status = 'active'    AND NEW.status IN ('completed', 'cancelled'))
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'community_ride_invalid_transition: cannot move from "%" to "%"',
    OLD.status, NEW.status
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_community_ride_status_transition
  ON public.community_ride;

CREATE TRIGGER trg_community_ride_status_transition
  BEFORE UPDATE ON public.community_ride
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enforce_community_ride_status_transition();

-- ─── 3. leave_community_ride RPC ─────────────────────────────────────────────
-- Called from mobile instead of a direct participant UPDATE.
-- Guards: auth identity, ride must be upcoming or active.

CREATE OR REPLACE FUNCTION public.leave_community_ride(
  p_community_ride_id UUID,
  p_rider_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rider r
    WHERE r.id = p_rider_id
      AND r.user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT status INTO v_ride_status
  FROM public.community_ride
  WHERE id = p_community_ride_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_found');
  END IF;

  IF v_ride_status NOT IN ('upcoming', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_leavable');
  END IF;

  UPDATE public.community_ride_participant
  SET status = 'left'
  WHERE community_ride_id = p_community_ride_id
    AND rider_id           = p_rider_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.leave_community_ride(UUID, UUID) IS
  'Rider leaves a community ride. Guards: auth identity, ride must be upcoming or active.';

GRANT EXECUTE ON FUNCTION public.leave_community_ride(UUID, UUID) TO authenticated;

-- ─── 4. join_community_ride — enforces is_public ──────────────────────────────
-- Replaces the version from 027.
-- Added guard: private rides (is_public = false) cannot be joined.

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
    SELECT 1 FROM public.rider r
    WHERE r.id = p_rider_id
      AND r.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.admin_users au
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

  IF NOT v_ride.is_public THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_public');
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

COMMENT ON FUNCTION public.join_community_ride(UUID, UUID) IS
  'Atomically joins a rider to a community ride. '
  'Guards: auth identity, is_public, ride status (upcoming|active), max_participants. '
  'Uses row-level lock to prevent concurrent over-booking.';

GRANT EXECUTE ON FUNCTION public.join_community_ride(UUID, UUID) TO authenticated;
