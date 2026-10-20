-- Community approval/account boundary. Production application requires explicit authorization.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Private predicate: approval remains the existing staff-managed creator grant.
CREATE OR REPLACE FUNCTION public.community_rider_account_active(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.rider r
   JOIN public."user" u ON u.id = r.user_id
   JOIN auth.users a ON a.id = u.id
   WHERE r.user_id = p_user_id AND r.status::text = 'active'
     AND u.status::text = 'active' AND u.deleted_at IS NULL
     AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until <= now())
 );
$$;
REVOKE ALL ON FUNCTION public.community_rider_account_active(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_create_community_ride(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND p_user_id = auth.uid()
   AND public.community_rider_account_active(p_user_id)
   AND EXISTS (SELECT 1 FROM public.community_ride_creator_grant g
               WHERE g.user_id = p_user_id AND g.revoked_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.can_create_community_ride(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_community_ride(uuid) TO authenticated;

-- Runs even inside SECURITY DEFINER creation/edit RPCs, which bypass RLS.
CREATE OR REPLACE FUNCTION public.enforce_community_rider_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE trusted_staff boolean := coalesce(auth.role() = 'service_role', false);
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW.organizer_type = 'rider' THEN
     IF NOT public.community_rider_account_active(NEW.organizer_user_id)
        OR NOT EXISTS (SELECT 1 FROM public.community_ride_creator_grant g
                       WHERE g.user_id = NEW.organizer_user_id AND g.revoked_at IS NULL)
        OR NOT EXISTS (SELECT 1 FROM public.rider r WHERE r.id = NEW.organizer_rider_id
                       AND r.user_id = NEW.organizer_user_id)
        OR (NOT trusted_staff AND (
             auth.uid() IS NULL OR NEW.organizer_user_id IS DISTINCT FROM auth.uid()
             OR NEW.created_by_user_id IS DISTINCT FROM auth.uid())) THEN
       RAISE EXCEPTION 'Community ride creation requires an approved active rider' USING ERRCODE = '42501';
     END IF;
   ELSIF NOT trusted_staff THEN
     RAISE EXCEPTION 'Community ride creation is not permitted' USING ERRCODE = '42501';
   END IF;
 ELSIF NOT trusted_staff THEN
   -- Existing organizers retain edits after grant revocation, but cannot transfer identity.
   IF OLD.organizer_type IS DISTINCT FROM 'rider'
      OR auth.uid() IS NULL OR OLD.organizer_user_id IS DISTINCT FROM auth.uid()
      OR NOT public.community_rider_account_active(auth.uid())
      OR NOT EXISTS (SELECT 1 FROM public.rider r WHERE r.id = OLD.organizer_rider_id AND r.user_id = auth.uid())
      OR ROW(NEW.organizer_type, NEW.organizer_user_id, NEW.organizer_rider_id, NEW.created_by_user_id)
         IS DISTINCT FROM ROW(OLD.organizer_type, OLD.organizer_user_id, OLD.organizer_rider_id, OLD.created_by_user_id) THEN
     RAISE EXCEPTION 'Community ride update is not permitted' USING ERRCODE = '42501';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_community_rider_authorization() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS community_rider_authorization ON public.community_ride;
CREATE TRIGGER community_rider_authorization BEFORE INSERT OR UPDATE ON public.community_ride
FOR EACH ROW EXECUTE FUNCTION public.enforce_community_rider_authorization();

-- Replays must check current eligibility before returning a cached creation result.
-- Preserve the current validation, idempotency, ownership and receipt contracts.
DO $patch$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef('public.create_my_community_ride(uuid,jsonb)'::regprocedure) INTO body;
 IF body NOT LIKE '%-- community approval before replay%' THEN
   IF body NOT LIKE '%PERFORM public.assert_active_account();%' THEN
     RAISE EXCEPTION 'Community creation RPC contract drift';
   END IF;
   EXECUTE replace(body, 'PERFORM public.assert_active_account();',
     E'PERFORM public.assert_active_account();\n -- community approval before replay\n IF NOT public.can_create_community_ride(auth.uid()) THEN RAISE EXCEPTION ''Community ride creation requires an approved active rider'' USING ERRCODE=''42501''; END IF;');
 END IF;
END $patch$;
-- Definer RPC no-op/replay branches must also respect rider/account state.
DO $patch$
DECLARE f record; body text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname IN ('update_community_ride','cancel_my_community_ride') LOOP
   body := pg_get_functiondef(f.oid);
   IF body NOT LIKE '%-- community organizer account boundary%' THEN
     IF body NOT LIKE '%PERFORM public.assert_active_account();%' THEN
       RAISE EXCEPTION 'Community organizer RPC contract drift';
     END IF;
     EXECUTE replace(body, 'PERFORM public.assert_active_account();',
       E'PERFORM public.assert_active_account();\n -- community organizer account boundary\n IF NOT public.community_rider_account_active(auth.uid()) THEN RAISE EXCEPTION ''Community ride update is not permitted'' USING ERRCODE=''42501''; END IF;');
   END IF;
 END LOOP;
END $patch$;
COMMENT ON FUNCTION public.can_create_community_ride(uuid) IS
 'Current account only: active non-banned rider with an unrevoked staff-managed community creator grant. Approval is required for creation, not existing organizer edits.';
COMMIT;
