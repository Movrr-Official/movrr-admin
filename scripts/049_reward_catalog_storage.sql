-- Reward Catalog owned media — Supabase Storage bucket + policies
--
-- Apply in Supabase SQL Editor (or migration runner) after review.
-- Admin app uploads via service role (bypasses RLS); policies still protect
-- direct browser/anon access if anything ever uploads client-side.
--
-- Public read is required: active catalog items are public SELECT and the
-- rider app loads thumbnail_url / gallery_urls as plain image URIs.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reward-catalog',
  'reward-catalog',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read (shop + admin previews)
DROP POLICY IF EXISTS "Public read reward catalog assets" ON storage.objects;
CREATE POLICY "Public read reward catalog assets"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'reward-catalog');

-- Authenticated dashboard admins may write (defence in depth; app uses service role)
DROP POLICY IF EXISTS "Admins insert reward catalog assets" ON storage.objects;
CREATE POLICY "Admins insert reward catalog assets"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'reward-catalog'
    AND public.is_dashboard_admin()
  );

DROP POLICY IF EXISTS "Admins update reward catalog assets" ON storage.objects;
CREATE POLICY "Admins update reward catalog assets"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'reward-catalog'
    AND public.is_dashboard_admin()
  );

DROP POLICY IF EXISTS "Admins delete reward catalog assets" ON storage.objects;
CREATE POLICY "Admins delete reward catalog assets"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'reward-catalog'
    AND public.is_dashboard_admin()
  );
