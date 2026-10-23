-- Existing production helper, captured read-only on 2026-10-23. No rider data.
CREATE OR REPLACE FUNCTION public.community_ride_participant_read_allowed(p_ride_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_ride WHERE id = p_ride_id
      AND (is_public = true OR organizer_user_id = auth.uid())
  );
$$;
