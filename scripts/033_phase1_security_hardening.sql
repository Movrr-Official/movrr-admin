-- Phase 1 security hardening (enterprise remediation)
-- Apply after movrr 007 + movrr-admin 032 scripts.
--
-- Fixes:
--   • Permissive reward ledger RLS (WITH CHECK true)
--   • Forgeable create_audit_log RPC
--   • Unrestricted redeem_reward_product RPC
--   • Unrestricted get_active_rider_sessions_for_admin RPC
--   • Broken reward_redemptions rider SELECT policy
--   • Missing RLS on admin_users, user_activity, ride_session

-- ─── Unified admin check (admin_users is authoritative) ─────────────────────

CREATE OR REPLACE FUNCTION public.is_dashboard_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_dashboard_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dashboard_admin() TO authenticated;

-- ─── Reward ledger: deny direct authenticated writes ────────────────────────

DROP POLICY IF EXISTS reward_transactions_insert_system ON public.reward_transactions;
DROP POLICY IF EXISTS rider_reward_balance_update_system ON public.rider_reward_balance;
DROP POLICY IF EXISTS impression_events_insert_system ON public.impression_events;
DROP POLICY IF EXISTS performance_stats_insert_system ON public.performance_stats;
DROP POLICY IF EXISTS rider_campaign_streak_insert_system ON public.rider_campaign_streak;
DROP POLICY IF EXISTS rider_campaign_streak_update_system ON public.rider_campaign_streak;

-- No INSERT/UPDATE policies for authenticated on system-managed ledger tables.
-- Writes must go through SECURITY DEFINER RPCs or service_role.

-- ─── Audit log RPC hardening ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_action text,
  p_result text,
  p_performed_by jsonb,
  p_affected_entity jsonb default null,
  p_source_ip text default null,
  p_geo_location jsonb default null,
  p_user_agent text default null,
  p_resource_id text default null,
  p_metadata jsonb default null,
  p_timestamp timestamptz default now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_dashboard_admin() THEN
    RAISE EXCEPTION 'not authorized to create audit logs';
  END IF;

  INSERT INTO public.audit_log (
    action,
    result,
    performed_by,
    affected_entity,
    timestamp,
    source_ip,
    geo_location,
    user_agent,
    resource_id,
    metadata
  ) VALUES (
    p_action,
    p_result,
    p_performed_by,
    p_affected_entity,
    p_timestamp,
    p_source_ip,
    p_geo_location,
    p_user_agent,
    p_resource_id,
    p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_audit_log(
  text, text, jsonb, jsonb, text, jsonb, text, text, jsonb, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_audit_log(
  text, text, jsonb, jsonb, text, jsonb, text, text, jsonb, timestamptz
) TO authenticated;

-- ─── Reward redemption SELECT policy fix ────────────────────────────────────

DROP POLICY IF EXISTS "Riders can view own reward redemptions" ON public.reward_redemptions;
CREATE POLICY "Riders can view own reward redemptions"
  ON public.reward_redemptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rider r
      WHERE r.id = reward_redemptions.rider_id
        AND r.user_id = auth.uid()
    )
  );

-- ─── redeem_reward_product caller authorization ─────────────────────────────
-- Adds auth.uid() ownership check at the start of the existing function body.
-- Re-run reward-catalog.sql first if the function body drifts; this block only
-- prepends the authorization gate.

CREATE OR REPLACE FUNCTION public.redeem_reward_product(
  p_rider_id uuid,
  p_reward_id uuid
)
RETURNS TABLE(status text, points_spent integer, redemption_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  catalog_row public.reward_catalog;
  balance_row public.rider_reward_balance;
  redemption_id uuid;
  existing_redemptions integer := 0;
  v_user_id uuid;
BEGIN
  SELECT r.user_id INTO v_user_id
  FROM public.rider r
  WHERE r.id = p_rider_id;

  IF v_user_id IS NULL OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN QUERY SELECT 'not_authorized'::text, 0, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO catalog_row FROM public.reward_catalog WHERE id = p_reward_id;
  IF catalog_row.id IS NULL OR catalog_row.status <> 'active' THEN
    RETURN QUERY SELECT 'not_available', 0, null;
  END IF;

  SELECT * INTO balance_row FROM public.rider_reward_balance WHERE rider_id = p_rider_id FOR UPDATE;
  IF balance_row.rider_id IS NULL THEN
    RETURN QUERY SELECT 'no_balance', 0, null;
  END IF;

  IF catalog_row.max_per_rider IS NOT NULL THEN
    SELECT count(*) INTO existing_redemptions
    FROM public.reward_redemptions
    WHERE rider_id = p_rider_id
      AND reward_id = catalog_row.id
      AND status NOT IN ('cancelled', 'rejected');

    IF existing_redemptions >= catalog_row.max_per_rider THEN
      RETURN QUERY SELECT 'not_available', 0, null;
    END IF;
  END IF;

  IF balance_row.points_balance < catalog_row.points_price THEN
    RETURN QUERY SELECT 'insufficient_points', catalog_row.points_price, null;
  END IF;

  IF catalog_row.inventory_type = 'limited' THEN
    IF catalog_row.inventory_count IS NULL OR catalog_row.inventory_count <= 0 THEN
      RETURN QUERY SELECT 'out_of_stock', 0, null;
    END IF;
    UPDATE public.reward_catalog
      SET inventory_count = catalog_row.inventory_count - 1,
          updated_at = now()
      WHERE id = catalog_row.id;
  END IF;

  INSERT INTO public.reward_redemptions (
    rider_id,
    reward_id,
    reward_sku,
    reward_title,
    points_spent,
    status,
    requested_at,
    metadata
  ) VALUES (
    p_rider_id,
    catalog_row.id,
    catalog_row.sku,
    catalog_row.title,
    catalog_row.points_price,
    'requested',
    now(),
    jsonb_build_object('reward_id', catalog_row.id, 'reward_title', catalog_row.title)
  ) RETURNING id INTO redemption_id;

  INSERT INTO public.reward_transactions (
    rider_id,
    campaign_id,
    ride_id,
    points_earned,
    source,
    metadata,
    created_at
  ) VALUES (
    p_rider_id,
    null,
    null,
    -catalog_row.points_price,
    'redemption',
    jsonb_build_object(
      'reward_id', catalog_row.id,
      'reward_title', catalog_row.title,
      'reward_sku', catalog_row.sku,
      'campaignName', catalog_row.title
    ),
    now()
  );

  RETURN QUERY SELECT 'ok', catalog_row.points_price, redemption_id;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reward_product(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_reward_product(uuid, uuid) TO authenticated;

-- ─── Admin session enumeration RPC hardening ────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_active_rider_sessions_for_admin()
RETURNS TABLE (
  session_id         uuid,
  rider_id           uuid,
  user_id            uuid,
  earning_mode       text,
  campaign_id        uuid,
  suggested_route_id uuid,
  started_at         timestamptz,
  status             text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rs.id AS session_id,
    rs.rider_id,
    r.user_id,
    rs.earning_mode,
    rs.campaign_id,
    rs.suggested_route_id,
    rs.started_at,
    rs.status
  FROM public.ride_session rs
  JOIN public.rider r ON r.id = rs.rider_id
  WHERE public.is_dashboard_admin()
    AND rs.status IN ('active', 'paused')
    AND rs.started_at > now() - INTERVAL '12 hours';
$$;

REVOKE ALL ON FUNCTION public.get_active_rider_sessions_for_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_rider_sessions_for_admin() TO authenticated;

-- ─── admin_users RLS ────────────────────────────────────────────────────────

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read own admin_users row" ON public.admin_users;
CREATE POLICY "Admins can read own admin_users row"
  ON public.admin_users
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── user_activity RLS ──────────────────────────────────────────────────────

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own activity" ON public.user_activity;
CREATE POLICY "Users can read own activity"
  ON public.user_activity
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read all user activity" ON public.user_activity;
CREATE POLICY "Admins can read all user activity"
  ON public.user_activity
  FOR SELECT
  USING (public.is_dashboard_admin());

-- ─── ride_session RLS ───────────────────────────────────────────────────────

ALTER TABLE public.ride_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Riders can read own sessions" ON public.ride_session;
CREATE POLICY "Riders can read own sessions"
  ON public.ride_session
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rider r
      WHERE r.id = ride_session.rider_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can read all ride sessions" ON public.ride_session;
CREATE POLICY "Admins can read all ride sessions"
  ON public.ride_session
  FOR SELECT
  USING (public.is_dashboard_admin());

-- Writes only via service role ingest API (no INSERT/UPDATE policies for authenticated)

-- ─── Campaign signup status transition guard ────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_campaign_signup_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('confirmed', 'selected', 'withdrawn') THEN
      RAISE EXCEPTION 'campaign_signup status transitions must use approved RPCs';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_signup_status_guard ON public.campaign_signup;
CREATE TRIGGER campaign_signup_status_guard
  BEFORE UPDATE ON public.campaign_signup
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_campaign_signup_status_transition();
