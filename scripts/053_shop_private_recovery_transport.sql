-- Hosted pg_net owns publicly readable request queues; do not put a persistent
-- authentication header there. Use a private synchronous HTTP call from cron.
-- 052 never ran and its queues contain no customer or financial operations.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM net.http_request_queue) OR EXISTS(SELECT 1 FROM net._http_response) OR
    EXISTS(SELECT 1 FROM cron.job WHERE jobname='movrr_shop_recovery' AND active) THEN
  RAISE EXCEPTION 'Review active scheduler/network work before changing transport';
 END IF;
END $$;
CREATE SCHEMA shop_transport AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA shop_transport FROM PUBLIC,anon,authenticated,service_role;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA shop_transport;
-- This new extension belongs to the migrating owner. Explicitly deny every HTTP
-- primitive to client/service roles; only the fixed-destination scheduler calls it.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_depend d ON d.objid=p.oid AND d.classid='pg_proc'::regclass
  JOIN pg_extension e ON e.oid=d.refobjid WHERE e.extname='http' AND d.deptype='e' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 END LOOP;
 IF has_schema_privilege('anon','shop_transport','USAGE') OR has_schema_privilege('authenticated','shop_transport','USAGE') OR has_schema_privilege('service_role','shop_transport','USAGE') THEN
  RAISE EXCEPTION 'HTTP transport schema was not contained';
 END IF;
END $$;
ALTER TABLE public.shop_scheduler_state DROP COLUMN request_id;
ALTER TABLE public.shop_scheduler_state ADD http_status integer,ADD last_error text;
DROP FUNCTION public.shop_dispatch_recovery();
CREATE FUNCTION public.shop_dispatch_recovery() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text; status integer; s public.shop_scheduler_state; BEGIN
 SELECT * INTO STRICT s FROM public.shop_scheduler_state WHERE singleton FOR UPDATE;
 IF s.dispatched_at>now()-interval '2 minutes' THEN RETURN s.http_status; END IF;
 BEGIN
  SELECT decrypted_secret INTO STRICT secret FROM vault.decrypted_secrets WHERE name='movrr_shop_recovery_secret';
  IF length(secret)<48 THEN RAISE EXCEPTION 'Recovery authentication is not configured'; END IF;
  PERFORM shop_transport.http_set_curlopt('CURLOPT_TIMEOUT_MS','55000');
  PERFORM shop_transport.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','5000');
  SELECT r.status INTO status FROM shop_transport.http(('POST','https://admin.movrr.nl/api/v1/internal/jobs/fulfilment-retry',
   ARRAY[('x-internal-job-secret',secret)::shop_transport.http_header],'application/json','{}')::shop_transport.http_request) r;
  UPDATE public.shop_scheduler_state SET dispatched_at=now(),http_status=status,last_error=CASE WHEN status=200 THEN NULL ELSE 'http_'||status::text END WHERE singleton;
 EXCEPTION WHEN OTHERS THEN
  UPDATE public.shop_scheduler_state SET dispatched_at=now(),http_status=NULL,last_error=SQLSTATE WHERE singleton;
 END;
 RETURN status;
END $$;
REVOKE ALL ON FUNCTION public.shop_dispatch_recovery() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.shop_scheduler_health(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF public.shop_authorize(p_actor,'read')<>'admin' THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('active',EXISTS(SELECT 1 FROM cron.job WHERE jobname='movrr_shop_recovery' AND active),
  'lastDispatchAt',s.dispatched_at,'httpStatus',s.http_status,'transportError',s.last_error) FROM public.shop_scheduler_state s WHERE singleton);
END $$;
-- Remove only the new, verified-empty network infrastructure from 052.
DROP EXTENSION pg_net;
NOTIFY pgrst,'reload schema';
COMMIT;
