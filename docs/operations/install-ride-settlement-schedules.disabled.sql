-- PREPARED ONLY. Separate deployment authorization required. Never run as part of migration101.
-- Requires migrations093-101 and an approved Admin HTTPS origin in Supabase Vault.
-- No secrets appear in cron command text, job output or application responses.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE FUNCTION public.invoke_ride_operations_schedule(p_component text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origin text;token text;path text;request_id bigint;
BEGIN
 IF p_component IS NULL OR p_component NOT IN ('worker','monitor') THEN RAISE EXCEPTION 'invalid_schedule_component';END IF;
 IF NOT (SELECT enabled FROM public.ride_ops_control) THEN RETURN NULL;END IF;
 IF p_component='worker' AND (NOT (SELECT worker_enabled FROM public.ride_completion_release_control) OR NOT (SELECT worker_expected FROM public.ride_ops_control)) THEN RETURN NULL;END IF;
 SELECT decrypted_secret INTO origin FROM vault.decrypted_secrets WHERE name='movrr_admin_origin';
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name=CASE WHEN p_component='worker' THEN 'movrr_ride_worker_token' ELSE 'movrr_ride_monitor_token' END;
 IF origin IS NULL OR origin !~ '^https://[a-zA-Z0-9.-]+$' OR token IS NULL OR length(token)<32 THEN RAISE EXCEPTION 'ride_schedule_configuration_required';END IF;
 path:=CASE WHEN p_component='worker' THEN '/api/internal/ride-settlement' ELSE '/api/internal/ride-settlement-monitor' END;
 SELECT net.http_post(url:=origin||path,body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds:=60000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.invoke_ride_operations_schedule(text) FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE job_id bigint;BEGIN
 job_id:=cron.schedule('movrr-ride-settlement-v3','* * * * *',$cmd$SELECT public.invoke_ride_operations_schedule('worker')$cmd$);
 PERFORM cron.alter_job(job_id,active:=false);
 job_id:=cron.schedule('movrr-ride-settlement-monitor-v3','* * * * *',$cmd$SELECT public.invoke_ride_operations_schedule('monitor')$cmd$);
 PERFORM cron.alter_job(job_id,active:=false);
END $$;
COMMIT;
