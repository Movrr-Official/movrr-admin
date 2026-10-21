-- Approval required before production execution. No historical backfill.
-- Reuse recorded session touches/token exchanges; no new heartbeat requests.
BEGIN;
CREATE OR REPLACE FUNCTION public.read_account_activity(p_actor uuid,p_users uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' OR NOT EXISTS(
  SELECT 1 FROM public.admin_users a WHERE a.user_id=p_actor
   AND public.account_identity_active(a.user_id)
   AND public.ops_employee_capabilities(a.role) ? 'users.read'
 ) THEN RAISE EXCEPTION 'Unauthorized account activity read' USING ERRCODE='42501'; END IF;
 IF p_users IS NULL OR cardinality(p_users)>500 THEN RAISE EXCEPTION 'Invalid activity batch'; END IF;
 -- One bounded JSON result cannot be silently truncated by PostgREST row caps.
 WITH requested AS (SELECT DISTINCT unnest(p_users) id), signals AS (
  SELECT a.id user_id,a.last_sign_in_at at FROM auth.users a JOIN requested r ON r.id=a.id
  UNION ALL
  SELECT s.user_id,s.refreshed_at AT TIME ZONE 'UTC' FROM auth.sessions s JOIN requested r ON r.id=s.user_id
  UNION ALL
  SELECT s.auth_user_id,s.last_seen_at FROM public.admin_dashboard_sessions s JOIN requested r ON r.id=s.auth_user_id
  UNION ALL
  -- user_id identifies the SUBJECT of an event, not its authenticated actor.
  SELECT e.actor_user_id,e.occurred_at FROM public.user_activity e JOIN requested r ON r.id=e.actor_user_id
   WHERE e.source<>'system'
 ), projected AS (
  SELECT r.id user_id,max(s.at) last_active_at FROM requested r LEFT JOIN signals s ON s.user_id=r.id AND s.at<=statement_timestamp()
  GROUP BY r.id
 ) SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.user_id),'[]'::jsonb) INTO result FROM projected p;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_account_activity(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_activity(uuid,uuid[]) TO service_role;

-- Preserve the last RECORDED activity when logout removes a session. A forced
-- revocation or expiry must never turn its deletion time into account activity.
-- Cascade account deletion is deliberately excluded: do not interfere with intake
-- or the separately authorized exact-account cleanup.
CREATE OR REPLACE FUNCTION public.retain_deleted_session_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid; seen timestamptz;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN OLD; END IF;
 IF TG_TABLE_SCHEMA='auth' THEN
  who:=OLD.user_id; seen:=OLD.refreshed_at AT TIME ZONE 'UTC';
 ELSE
  who:=OLD.auth_user_id; seen:=OLD.last_seen_at;
 END IF;
 IF seen IS NOT NULL AND seen<=statement_timestamp() AND EXISTS(SELECT 1 FROM public."user" WHERE id=who)
    AND EXISTS(SELECT 1 FROM auth.users WHERE id=who AND deleted_at IS NULL) THEN
  INSERT INTO public.user_activity(user_id,actor_user_id,source,action,description,occurred_at)
   VALUES(who,who,'account','Recorded session activity','Last recorded authenticated session activity retained on session removal.',seen);
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.retain_deleted_session_activity() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER retain_auth_session_activity BEFORE DELETE ON auth.sessions
 FOR EACH ROW EXECUTE FUNCTION public.retain_deleted_session_activity();
CREATE TRIGGER retain_admin_session_activity BEFORE DELETE ON public.admin_dashboard_sessions
 FOR EACH ROW EXECUTE FUNCTION public.retain_deleted_session_activity();
COMMIT;
