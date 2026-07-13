-- Gap closure: unified admin model, atomic reward cap, erasure support
-- Apply after scripts/034_phase3_storage_gps_retention.sql

-- Unify audit_log write policy to dashboard admins (is_dashboard_admin)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'audit_log_insert_dashboard_admin'
  ) THEN
    DROP POLICY audit_log_insert_dashboard_admin ON public.audit_log;
  END IF;
END $$;

CREATE POLICY audit_log_insert_dashboard_admin ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_dashboard_admin());

-- Atomic daily reward cap with per-rider advisory lock
CREATE OR REPLACE FUNCTION public.award_reward_points_capped(
  p_rider_id uuid,
  p_points integer,
  p_daily_cap integer,
  p_source text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_total integer;
  v_award integer;
  v_tx_id uuid;
BEGIN
  IF p_points <= 0 OR p_daily_cap <= 0 THEN
    RETURN jsonb_build_object('awarded', 0, 'reason', 'invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_rider_id::text || ':' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
  );

  SELECT COALESCE(SUM(points_earned), 0) INTO v_today_total
  FROM reward_transactions
  WHERE rider_id = p_rider_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');

  IF v_today_total >= p_daily_cap THEN
    RETURN jsonb_build_object('awarded', 0, 'reason', 'daily_cap_reached', 'today_total', v_today_total);
  END IF;

  v_award := LEAST(p_points, p_daily_cap - v_today_total);
  IF v_award <= 0 THEN
    RETURN jsonb_build_object('awarded', 0, 'reason', 'zero_remaining');
  END IF;

  INSERT INTO reward_transactions (rider_id, points_earned, source, metadata, created_at)
  VALUES (p_rider_id, v_award, p_source, p_metadata, now())
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'awarded', v_award,
    'transaction_id', v_tx_id,
    'today_total', v_today_total + v_award
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_reward_points_capped(uuid, integer, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_reward_points_capped(uuid, integer, integer, text, jsonb) TO service_role;

-- Right-to-erasure: anonymize rider PII and purge location history
CREATE OR REPLACE FUNCTION public.erase_rider_personal_data(
  p_rider_id uuid,
  p_requested_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_ids uuid[];
  v_gps_deleted integer := 0;
  v_sessions_anonymized integer := 0;
BEGIN
  SELECT array_agg(id) INTO v_session_ids
  FROM ride_session
  WHERE rider_id = p_rider_id;

  IF v_session_ids IS NOT NULL THEN
    DELETE FROM gps_point WHERE session_id = ANY(v_session_ids);
    GET DIAGNOSTICS v_gps_deleted = ROW_COUNT;

    UPDATE ride_session
    SET
      status = 'rejected',
      ended_at = COALESCE(ended_at, now()),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('erasure_applied', true)
    WHERE id = ANY(v_session_ids);
    GET DIAGNOSTICS v_sessions_anonymized = ROW_COUNT;
  END IF;

  UPDATE profiles
  SET
    full_name = 'Erased User',
    avatar_url = NULL,
    phone = NULL,
    date_of_birth = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('erasure_applied', true, 'erased_at', now())
  WHERE id = p_rider_id;

  DELETE FROM waitlist WHERE email IN (
    SELECT email FROM auth.users WHERE id = p_rider_id
  );

  INSERT INTO audit_log (action, result, performed_by, affected_entity, metadata, timestamp)
  VALUES (
    'Rider Data Erasure',
    'success',
    jsonb_build_object('requested_by', p_requested_by),
    jsonb_build_object('type', 'rider', 'id', p_rider_id),
    jsonb_build_object('gps_deleted', v_gps_deleted, 'sessions_anonymized', v_sessions_anonymized),
    now()
  );

  RETURN jsonb_build_object(
    'rider_id', p_rider_id,
    'gps_deleted', v_gps_deleted,
    'sessions_anonymized', v_sessions_anonymized
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erase_rider_personal_data(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erase_rider_personal_data(uuid, uuid) TO service_role;
