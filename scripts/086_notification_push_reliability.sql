-- Candidate only. Deploy with the coordinated Edge/Admin/Mobile release.
-- No backfill, replay, financial command, Shop activation or scheduler creation.
BEGIN;
DROP TRIGGER IF EXISTS trg_webhook_send_push_notification ON public.notifications;
-- A coordinated deployment starts held. Only a separately approved database
-- operator can select dedicated test recipients or enable general dispatch.
CREATE TABLE public.notification_push_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 test_user_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(test_user_ids)<=10),
 release_reference text
);
INSERT INTO public.notification_push_control(singleton) VALUES(true);
ALTER TABLE public.notification_push_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_control FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.user_push_tokens
 ADD COLUMN installation_id uuid,
 ADD COLUMN auth_session_id uuid,
 ADD COLUMN project_id uuid,
 ADD COLUMN revoked_at timestamptz;
CREATE UNIQUE INDEX user_push_active_installation ON public.user_push_tokens(installation_id)
 WHERE installation_id IS NOT NULL AND revoked_at IS NULL;
ALTER TABLE public.notification_push_dispatch ADD COLUMN attempt_counted boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_push_receipt
 ADD COLUMN retryable boolean NOT NULL DEFAULT true,
 ADD COLUMN http_status integer,
 ADD COLUMN token_fingerprint text,
 ADD COLUMN recipient_id uuid,
 ADD COLUMN registered_at timestamptz,
 ADD COLUMN receipt_expired_at timestamptz;
CREATE TABLE public.notification_push_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
 device_id uuid, state text NOT NULL, error_code text, http_status integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_push_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_event FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.notification_push_event TO service_role;
-- Native clients already possess their own token. Do not expose tokens from
-- another installation, or let direct writes bypass the session contract.
REVOKE ALL ON public.user_push_tokens FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.register_push_installation(p_installation uuid,p_token text,p_platform text,p_project uuid,p_model text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
BEGIN
 IF me IS NULL OR sid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=sid AND user_id=me AND (not_after IS NULL OR not_after>now()))
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=me AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<now()))
 OR NOT EXISTS(SELECT 1 FROM public."user" WHERE id=me AND status::text='active' AND role::text='rider')
 THEN RAISE EXCEPTION 'Active rider session required' USING ERRCODE='28000'; END IF;
 IF p_installation IS NULL OR p_platform NOT IN ('ios','android') OR p_platform IS NULL
 OR p_project IS DISTINCT FROM '913519ff-a7bc-40bd-8078-17c302564956'::uuid
 OR p_token IS NULL OR length(p_token)>256 OR p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
 THEN RAISE EXCEPTION 'Invalid push registration' USING ERRCODE='22023'; END IF;
 -- Serialize installation and token transfers. Old receipt identities are retained.
 PERFORM pg_advisory_xact_lock(hashtextextended('push-registration',0));
 UPDATE public.user_push_tokens SET revoked_at=now() WHERE revoked_at IS NULL
 AND (installation_id=p_installation OR expo_push_token=p_token);
 INSERT INTO public.user_push_tokens(user_id,expo_push_token,platform,device_id,device_model,last_seen_at,updated_at,installation_id,auth_session_id,project_id,revoked_at)
 VALUES(me,p_token,p_platform,p_installation::text,left(p_model,100),now(),now(),p_installation,sid,p_project,NULL)
 ON CONFLICT(expo_push_token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,
 device_id=EXCLUDED.device_id,device_model=EXCLUDED.device_model,last_seen_at=now(),updated_at=now(),
 installation_id=p_installation,auth_session_id=sid,project_id=p_project,revoked_at=NULL;
END $$;

CREATE FUNCTION public.revoke_push_installation(p_installation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('push-registration',0));
 UPDATE public.user_push_tokens SET revoked_at=now(),updated_at=now()
 WHERE installation_id=p_installation AND user_id=auth.uid() AND revoked_at IS NULL;
END $$;
-- Legacy binaries retain inbox access but cannot re-enable unbound push tokens.
CREATE OR REPLACE FUNCTION public.register_user_push_token(p_expo_push_token text,p_platform text,p_device_id text DEFAULT NULL,p_device_model text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Notification client update required' USING ERRCODE='55000'; END $$;

CREATE OR REPLACE FUNCTION public.shop_enqueue_notification_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.type::text IN ('reward','route_assigned','route_completed','ride_completed','campaign_assigned','campaign_completed','achievement_unlocked','system','status','community_activity')
 AND EXISTS(SELECT 1 FROM public."user" WHERE id=NEW.user_id AND role::text='rider' AND status::text='active')
 THEN INSERT INTO public.notification_push_dispatch(notification_id) VALUES(NEW.id) ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.notification_eligible_push_tokens(p_id uuid)
RETURNS TABLE(id uuid,expo_push_token text,platform text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT t.id,t.expo_push_token,t.platform FROM public.user_push_tokens t
 JOIN public.notifications n ON n.user_id=t.user_id AND n.id=p_id
 JOIN public."user" u ON u.id=t.user_id AND u.status::text='active' AND u.role::text='rider'
 JOIN auth.users a ON a.id=t.user_id AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<now())
 JOIN auth.sessions s ON s.id=t.auth_session_id AND s.user_id=t.user_id
 WHERE t.revoked_at IS NULL AND t.installation_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.notification_push_control c WHERE c.enabled OR t.user_id=ANY(c.test_user_ids))
 AND t.project_id='913519ff-a7bc-40bd-8078-17c302564956'::uuid
 AND t.platform IN ('ios','android') AND (s.not_after IS NULL OR s.not_after>now())
$$;

CREATE OR REPLACE FUNCTION public.shop_pending_push() RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.notification_push_dispatch SET state='review',last_error='sender_outcome_unknown'
 WHERE state='sending' AND lease_until<now() AND (attempts>=8 OR created_at<=now()-interval '24 hours');
 UPDATE public.notification_push_dispatch SET state='failed',last_error='retry_exhausted'
 WHERE state='pending' AND (attempts>=8 OR created_at<=now()-interval '24 hours');
 -- Missing provider evidence has an explicit terminal review state, never delivery success.
 UPDATE public.notification_push_receipt SET receipt_expired_at=now(),error_code=coalesce(error_code,'receipt_expired')
 WHERE state='accepted' AND provider_receipt IS NULL AND receipt_expired_at IS NULL AND updated_at<=now()-interval '24 hours';
 UPDATE public.notification_push_dispatch d SET state='review',last_error='receipt_expired'
 WHERE EXISTS(SELECT 1 FROM public.notification_push_receipt r WHERE r.notification_id=d.notification_id AND r.receipt_expired_at IS NOT NULL)
 AND d.state<>'review';
 RETURN QUERY SELECT to_jsonb(n) FROM public.notification_push_dispatch d JOIN public.notifications n ON n.id=d.notification_id
 WHERE d.state IN ('pending','sending') AND d.available_at<=now() AND (d.lease_until IS NULL OR d.lease_until<now())
 AND EXISTS(SELECT 1 FROM public.notification_push_control c WHERE c.enabled OR n.user_id=ANY(c.test_user_ids))
 AND d.attempts<8 AND d.created_at>now()-interval '24 hours' ORDER BY d.available_at,d.notification_id LIMIT 25;
END $$;

CREATE OR REPLACE FUNCTION public.shop_claim_push(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.notification_push_dispatch; lease uuid:=gen_random_uuid(); BEGIN
 SELECT * INTO d FROM public.notification_push_dispatch WHERE notification_id=p_id FOR UPDATE;
 IF NOT FOUND OR d.state NOT IN ('pending','sending') OR d.available_at>now() OR d.lease_until>now() OR d.attempts>=8 OR d.created_at<=now()-interval '24 hours' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.notification_push_control c JOIN public.notifications n ON n.id=p_id WHERE c.enabled OR n.user_id=ANY(c.test_user_ids)) THEN RETURN NULL; END IF;
 UPDATE public.notification_push_receipt SET state='unknown',error_code='sender_outcome_unknown',updated_at=now() WHERE notification_id=p_id AND state='sending';
 IF EXISTS(SELECT 1 FROM public.notification_push_receipt WHERE notification_id=p_id AND state='unknown') THEN
  UPDATE public.notification_push_dispatch SET state='review',lease_token=NULL,lease_until=NULL,last_error='sender_outcome_unknown' WHERE notification_id=p_id;
  RETURN NULL;
 END IF;
 UPDATE public.notification_push_dispatch SET state='sending',lease_token=lease,lease_until=now()+interval '2 minutes',attempt_counted=false WHERE notification_id=p_id;
 RETURN jsonb_build_object('lease',lease,'notification',(SELECT to_jsonb(n) FROM public.notifications n WHERE id=p_id));
END $$;

CREATE OR REPLACE FUNCTION public.shop_begin_push_device(p_id uuid,p_lease uuid,p_device uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.notification_push_receipt; tok public.user_push_tokens; BEGIN
 PERFORM 1 FROM public.notification_push_dispatch WHERE notification_id=p_id AND lease_token=p_lease AND lease_until>now() AND state='sending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Push lease lost' USING ERRCODE='40001'; END IF;
 SELECT t.* INTO tok FROM public.user_push_tokens t JOIN public.notification_eligible_push_tokens(p_id) e ON e.id=t.id WHERE t.id=p_device FOR UPDATE OF t;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO prior FROM public.notification_push_receipt WHERE notification_id=p_id AND device_id=p_device FOR UPDATE;
 IF prior.state IN ('accepted','unknown','invalid_device','sending') OR (prior.state='failed' AND NOT prior.retryable) THEN RETURN false; END IF;
 UPDATE public.notification_push_dispatch SET attempts=attempts+1,attempt_counted=true WHERE notification_id=p_id AND NOT attempt_counted;
 INSERT INTO public.notification_push_receipt(notification_id,device_id,state,token_fingerprint,recipient_id,registered_at)
 VALUES(p_id,p_device,'sending',md5(tok.expo_push_token),tok.user_id,tok.updated_at)
 ON CONFLICT(notification_id,device_id) DO UPDATE SET state='sending',error_code=NULL,http_status=NULL,updated_at=now(),token_fingerprint=EXCLUDED.token_fingerprint,recipient_id=EXCLUDED.recipient_id,registered_at=EXCLUDED.registered_at;
 RETURN true;
END $$;

CREATE FUNCTION public.notification_record_push_device(p_id uuid,p_lease uuid,p_device uuid,p_state text,p_ticket text,p_error text,p_http integer,p_retryable boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_error IS NOT NULL AND p_error !~ '^[A-Za-z0-9_]{1,100}$' THEN RAISE EXCEPTION 'Invalid diagnostic code'; END IF;
 PERFORM public.shop_record_push_device(p_id,p_lease,p_device,p_state,p_ticket,p_error);
 UPDATE public.notification_push_receipt SET http_status=p_http,retryable=p_retryable WHERE notification_id=p_id AND device_id=p_device;
 INSERT INTO public.notification_push_event(notification_id,device_id,state,error_code,http_status) VALUES(p_id,p_device,p_state,p_error,p_http);
END $$;

CREATE FUNCTION public.notification_invalidate_attempt_device(p_id uuid,p_device uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.user_push_tokens t SET revoked_at=now(),updated_at=now()
 FROM public.notification_push_receipt r WHERE r.notification_id=p_id AND r.device_id=p_device
 AND (r.state='invalid_device' OR r.error_code='DeviceNotRegistered')
 AND t.id=r.device_id AND md5(t.expo_push_token)=r.token_fingerprint AND t.user_id=r.recipient_id
 AND t.updated_at<=r.registered_at AND t.revoked_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.shop_finish_push(p_id uuid,p_lease uuid,p_state text,p_error text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result text:=p_state; BEGIN
 PERFORM 1 FROM public.notification_push_dispatch WHERE notification_id=p_id AND lease_token=p_lease AND lease_until>now() AND state='sending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Push lease lost' USING ERRCODE='40001'; END IF;
 IF p_state NOT IN ('accepted','pending','suppressed','no_device','review','failed') THEN RAISE EXCEPTION 'Invalid push state'; END IF;
 IF EXISTS(SELECT 1 FROM public.notification_push_receipt WHERE notification_id=p_id AND state IN ('unknown','sending')) THEN result:='review';
 ELSIF p_state='no_device' THEN result:='no_device';
 ELSIF EXISTS(SELECT 1 FROM public.notification_push_receipt WHERE notification_id=p_id AND state='failed' AND retryable) THEN result:='pending';
 ELSIF EXISTS(SELECT 1 FROM public.notification_push_receipt WHERE notification_id=p_id AND state='failed' AND NOT retryable) THEN result:='failed';
 ELSIF p_state='accepted' AND NOT EXISTS(SELECT 1 FROM public.notification_push_receipt WHERE notification_id=p_id AND state='accepted') THEN result:='no_device'; END IF;
 UPDATE public.notification_push_dispatch SET state=result,lease_token=NULL,lease_until=NULL,available_at=now()+interval '15 minutes',last_error=left(p_error,100) WHERE notification_id=p_id;
END $$;

CREATE FUNCTION public.notification_defer_push(p_id uuid,p_lease uuid,p_until timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.notification_push_dispatch SET state='pending',available_at=greatest(now()+interval '1 minute',least(p_until,now()+interval '24 hours')),last_error='quiet_hours',lease_token=NULL,lease_until=NULL
 WHERE notification_id=p_id AND lease_token=p_lease AND lease_until>now() AND state='sending' AND NOT attempt_counted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Push deferral lease lost' USING ERRCODE='40001'; END IF;
END $$;

CREATE FUNCTION public.notification_push_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'dispatchEnabled',(SELECT enabled FROM public.notification_push_control WHERE singleton),
 'testRecipients',(SELECT cardinality(test_user_ids) FROM public.notification_push_control WHERE singleton),
 'backlog',(SELECT count(*) FROM public.notification_push_dispatch WHERE state IN ('pending','sending')),
 'failed',(SELECT count(*) FROM public.notification_push_dispatch WHERE state='failed'),
 'held',(SELECT count(*) FROM public.notification_push_dispatch WHERE state='review'),
 'noDevice',(SELECT count(*) FROM public.notification_push_dispatch WHERE state='no_device'),
 'unknownAttempts',(SELECT count(*) FROM public.notification_push_receipt WHERE state='unknown'),
 'providerAccepted',(SELECT count(*) FROM public.notification_push_receipt WHERE ticket_id IS NOT NULL),
 'providerHandoffOk',(SELECT count(*) FROM public.notification_push_receipt WHERE provider_receipt='ok'),
 'providerHandoffError',(SELECT count(*) FROM public.notification_push_receipt WHERE provider_receipt='error'),
 'agedPending',(SELECT count(*) FROM public.notification_push_dispatch WHERE state IN ('pending','sending') AND available_at<now()-interval '15 minutes'),
 'missingReceipts',(SELECT count(*) FROM public.notification_push_receipt WHERE state='accepted' AND provider_receipt IS NULL AND updated_at<now()-interval '15 minutes'),
 'expiredReceipts',(SELECT count(*) FROM public.notification_push_receipt WHERE receipt_expired_at IS NOT NULL),
 'invalidDevices',(SELECT count(*) FROM public.notification_push_receipt WHERE state='invalid_device' OR error_code='DeviceNotRegistered'),
 'unboundRegistrations',(SELECT count(*) FROM public.user_push_tokens WHERE installation_id IS NULL OR auth_session_id IS NULL),
 'revokedRegistrations',(SELECT count(*) FROM public.user_push_tokens WHERE revoked_at IS NOT NULL),
 'invalidSessions',(SELECT count(*) FROM public.user_push_tokens t WHERE t.revoked_at IS NULL AND t.auth_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=t.auth_session_id AND s.user_id=t.user_id AND (s.not_after IS NULL OR s.not_after>now()))),
 'staleRegistrations',(SELECT count(*) FROM public.user_push_tokens WHERE revoked_at IS NULL AND last_seen_at<now()-interval '30 days'))
$$;

CREATE OR REPLACE FUNCTION public.shop_record_push_receipt(p_id uuid,p_device uuid,p_ticket text,p_status text,p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN ('ok','error') OR (p_error IS NOT NULL AND p_error !~ '^[A-Za-z0-9_]{1,100}$') THEN RAISE EXCEPTION 'Invalid provider receipt'; END IF;
 UPDATE public.notification_push_receipt SET provider_receipt=p_status,error_code=p_error,updated_at=now()
 WHERE notification_id=p_id AND device_id=p_device AND ticket_id=p_ticket AND state='accepted' AND provider_receipt IS NULL;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO public.notification_push_event(notification_id,device_id,state,error_code) VALUES(p_id,p_device,'receipt_'||p_status,p_error);
 IF p_status='error' THEN UPDATE public.notification_push_dispatch SET state='review',last_error=coalesce(p_error,'provider_rejected') WHERE notification_id=p_id; END IF;
END $$;

-- All new privileged functions are service-only except the two installation RPCs.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('register_push_installation','revoke_push_installation','notification_eligible_push_tokens','notification_record_push_device','notification_invalidate_attempt_device','notification_defer_push','notification_push_health') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',f.sig,CASE WHEN f.proname IN ('register_push_installation','revoke_push_installation') THEN 'authenticated' ELSE 'service_role' END);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.register_user_push_token(text,text,text,text) FROM PUBLIC,anon,service_role;
COMMIT;
