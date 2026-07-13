-- Phase 3 storage RLS for advertiser logo bucket
-- Apply bucket policies in Supabase dashboard if bucket name differs.
--
-- Supabase note: storage.objects is owned by supabase_storage_admin and already
-- has RLS enabled. Do NOT run ALTER TABLE ... ENABLE ROW LEVEL SECURITY here.
-- Create policies below via SQL editor (postgres) or Storage > Policies UI.

-- Authenticated admins upload via dashboard (service role bypasses RLS).
-- Riders/public have no write access.

DROP POLICY IF EXISTS "Public read advertiser assets" ON storage.objects;
CREATE POLICY "Public read advertiser assets"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'advertiser-assets');

DROP POLICY IF EXISTS "Admins insert advertiser assets" ON storage.objects;
CREATE POLICY "Admins insert advertiser assets"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'advertiser-assets'
    AND public.is_dashboard_admin()
  );

DROP POLICY IF EXISTS "Admins update advertiser assets" ON storage.objects;
CREATE POLICY "Admins update advertiser assets"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'advertiser-assets'
    AND public.is_dashboard_admin()
  );

DROP POLICY IF EXISTS "Admins delete advertiser assets" ON storage.objects;
CREATE POLICY "Admins delete advertiser assets"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'advertiser-assets'
    AND public.is_dashboard_admin()
  );

-- GPS retention helper (privacy) — delete points older than configured window
CREATE OR REPLACE FUNCTION public.purge_stale_gps_points(p_retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT public.is_dashboard_admin() AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM public.ride_gps_point
  WHERE recorded_at < now() - make_interval(days => p_retention_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_stale_gps_points(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_stale_gps_points(integer) TO service_role;
