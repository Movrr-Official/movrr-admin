-- Unify is_admin() with authoritative is_dashboard_admin()
-- Apply after scripts/035_gap_closure.sql

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_dashboard_admin();
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Align audit_log policies with dashboard admin model
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_log;
CREATE POLICY "Dashboard admins can read audit logs"
  ON public.audit_log
  FOR SELECT
  USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_log;
CREATE POLICY "Dashboard admins can insert audit logs"
  ON public.audit_log
  FOR INSERT
  WITH CHECK (public.is_dashboard_admin());
