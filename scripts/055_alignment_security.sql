-- X01. Additive integrity correction. Deploy only after explicit rollout approval.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.account_is_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public."user" u WHERE u.id=auth.uid() AND lower(u.status::text) IN ('active','pending'))
$$;
REVOKE ALL ON FUNCTION public.account_is_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_is_active() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.assert_active_account() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_is_active() THEN
  RAISE EXCEPTION 'Account access restricted' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_active_account() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assert_active_account() TO authenticated,service_role;
-- Restrictive policies compose with existing ownership/RBAC policies; deletion receipts are excluded.
DO $policies$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['rider','ride_session','route_tracking','rider_route','reward_transactions','rider_reward_balance','reward_redemptions','campaign_signup','campaign_assignment','user_preferences','community_ride','community_ride_participant','rider_campaign_accessory_assignment','rider_campaign_accessory_event','rider_brand_preference','rider_badge_award'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('DROP POLICY IF EXISTS account_status_required ON public.%I',t);
   EXECUTE format('CREATE POLICY account_status_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.account_is_active()) WITH CHECK (public.account_is_active())',t);
  END IF;
 END LOOP;
END $policies$;
-- Preserve signatures and current function bodies, adding the account guard before any effect.
-- No renamed legacy implementation or compatibility dispatcher is retained.
DO $guards$ DECLARE f record; body text; patched text; BEGIN
 FOR f IN SELECT p.oid,p.proname,l.lanname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public' AND p.proname IN ('current_rider_id','get_authenticated_rider_id','rider_campaign_opt_in','rider_campaign_confirm','rider_campaign_withdraw','join_community_ride','leave_community_ride','update_community_ride','sync_my_achievement_progress','set_rider_brand_preference','enqueue_my_ride_settlement','claim_my_ride_settlement','finish_my_ride_settlement','execute_my_ride_time_settlement') LOOP
  body:=pg_get_functiondef(f.oid);
  IF body NOT LIKE '%PERFORM public.assert_active_account();%' THEN
   IF f.lanname='plpgsql' THEN
    patched:=regexp_replace(body,'\mBEGIN\M',E'BEGIN\n PERFORM public.assert_active_account();','i');
   ELSIF f.proname='execute_my_ride_time_settlement' AND f.lanname='sql' THEN
    -- Production uses a SQL wrapper. Keep its signature, ACL and delegation;
    -- convert only this inspected body so the security guard runs first.
    IF pg_get_function_identity_arguments(f.oid)<>'p_session uuid, p_token uuid'
      OR pg_get_function_result(f.oid)<>'jsonb'
      OR regexp_replace((SELECT prosrc FROM pg_proc WHERE oid=f.oid),'\s','','g')<>'SELECTpublic.execute_ride_time_settlement(p_session,p_token);' THEN
     RAISE EXCEPTION 'Settlement wrapper drift requires review'; END IF;
    EXECUTE 'CREATE OR REPLACE FUNCTION public.execute_my_ride_time_settlement(p_session uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS $guard$ BEGIN PERFORM public.assert_active_account(); RETURN public.execute_ride_time_settlement(p_session,p_token); END $guard$';
    CONTINUE;
   ELSIF f.proname IN ('current_rider_id','get_authenticated_rider_id') AND f.lanname='sql' THEN
    patched:=replace(body,'auth.uid()','CASE WHEN public.account_is_active() THEN auth.uid() ELSE NULL END');
   ELSE RAISE EXCEPTION 'Unsupported guarded function contract: %',f.proname;
   END IF;
   IF patched=body THEN RAISE EXCEPTION 'Account guard insertion failed: %',f.proname; END IF;
   EXECUTE patched;
  END IF;
 END LOOP;
END $guards$;
COMMIT;
