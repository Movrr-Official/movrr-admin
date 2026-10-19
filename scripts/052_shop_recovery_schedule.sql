-- Single scheduler over the existing recovery worker. No financial/data backfill.
-- pg_cron + pg_net + Vault: https://supabase.com/docs/guides/functions/schedule-functions
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE TABLE public.shop_scheduler_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 request_id bigint, dispatched_at timestamptz
);
INSERT INTO public.shop_scheduler_state(singleton) VALUES(true);
ALTER TABLE public.shop_scheduler_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_scheduler_state FROM PUBLIC,anon,authenticated,service_role;
-- HTTP queues contain a bearer header. Only the database scheduler can read them.
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM PUBLIC,anon,authenticated,service_role;
REVOKE USAGE ON SCHEMA net FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.shop_dispatch_recovery() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text; request bigint; s public.shop_scheduler_state; BEGIN
 SELECT * INTO STRICT s FROM public.shop_scheduler_state WHERE singleton FOR UPDATE;
 IF s.dispatched_at>now()-interval '2 minutes' THEN RETURN s.request_id; END IF;
 SELECT decrypted_secret INTO STRICT secret FROM vault.decrypted_secrets WHERE name='movrr_shop_recovery_secret';
 IF length(secret)<48 THEN RAISE EXCEPTION 'Recovery authentication is not configured'; END IF;
 SELECT net.http_post(
  url:='https://admin.movrr.nl/api/v1/internal/jobs/fulfilment-retry',
  headers:=jsonb_build_object('content-type','application/json','x-internal-job-secret',secret),
  body:='{"source":"supabase-cron"}'::jsonb,timeout_milliseconds:=60000
 ) INTO request;
 UPDATE public.shop_scheduler_state SET request_id=request,dispatched_at=now() WHERE singleton;
 RETURN request;
END $$;
REVOKE ALL ON FUNCTION public.shop_dispatch_recovery() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.shop_scheduler_health(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF public.shop_authorize(p_actor,'read')<>'admin' THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('active',EXISTS(SELECT 1 FROM cron.job WHERE jobname='movrr_shop_recovery' AND active),
  'lastDispatchAt',s.dispatched_at,'httpStatus',r.status_code,'transportError',r.error_msg)
  FROM public.shop_scheduler_state s LEFT JOIN net._http_response r ON r.id=s.request_id WHERE s.singleton);
END $$;
REVOKE ALL ON FUNCTION public.shop_scheduler_health(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shop_scheduler_health(uuid) TO service_role;
-- Provision the matching private secret and deploy the authenticated worker
-- before activating this job. Creation does not enable real reward redemption.
DO $$ DECLARE job bigint; BEGIN
 job:=cron.schedule('movrr_shop_recovery','*/5 * * * *','SELECT public.shop_dispatch_recovery()');
 PERFORM cron.alter_job(job,active:=false);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
