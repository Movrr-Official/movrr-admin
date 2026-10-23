-- Extends the existing notification -> send-push-notifications pipeline.
-- Uses the existing shop recovery worker; installs no provider, cron job, secret or extension.
BEGIN;
CREATE TABLE public.notification_push_dispatch (
 notification_id uuid PRIMARY KEY REFERENCES public.notifications(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','suppressed','no_device','review','failed')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, lease_until timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notification_push_receipt (
 notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
 device_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('sending','accepted','failed','unknown','invalid_device')),
 ticket_id text, provider_receipt text CHECK(provider_receipt IN ('ok','error')),
 error_code text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(notification_id,device_id)
);
ALTER TABLE public.notification_push_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_dispatch,public.notification_push_receipt FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.notification_push_dispatch,public.notification_push_receipt TO service_role;

CREATE FUNCTION public.shop_enqueue_notification_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.metadata ? 'redemptionId' THEN INSERT INTO public.notification_push_dispatch(notification_id) VALUES(NEW.id) ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER redemption_notification_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.shop_enqueue_notification_push();

CREATE FUNCTION public.shop_pending_push() RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.notification_push_dispatch SET state='review',last_error='sender_outcome_unknown' WHERE state='sending' AND lease_until<now() AND (attempts>=8 OR created_at<now()-interval '24 hours');
 UPDATE public.notification_push_dispatch SET state='failed',last_error='retry_exhausted' WHERE state='pending' AND (attempts>=8 OR created_at<now()-interval '24 hours');
 RETURN QUERY SELECT to_jsonb(n) FROM public.notification_push_dispatch d JOIN public.notifications n ON n.id=d.notification_id
 WHERE d.state IN ('pending','sending') AND d.available_at<=now() AND (d.lease_until IS NULL OR d.lease_until<now()) AND d.attempts<8 AND d.created_at>now()-interval '24 hours'
 ORDER BY d.available_at,d.notification_id LIMIT 25;
END
$$;

CREATE FUNCTION public.shop_claim_push(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.notification_push_dispatch; lease uuid:=gen_random_uuid(); BEGIN
 SELECT * INTO d FROM public.notification_push_dispatch WHERE notification_id=p_id FOR UPDATE;
 IF NOT FOUND OR d.state NOT IN ('pending','sending') OR d.available_at>now() OR d.lease_until>now() OR d.attempts>=8 OR d.created_at<now()-interval '24 hours' THEN RETURN NULL; END IF;
 -- A crashed sender may have reached Expo. Never blindly resend uncertain device attempts.
 UPDATE public.notification_push_receipt SET state='unknown',error_code='sender_outcome_unknown',updated_at=now() WHERE notification_id=p_id AND state='sending';
 UPDATE public.notification_push_dispatch SET state='sending',lease_token=lease,lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE notification_id=p_id;
 RETURN jsonb_build_object('lease',lease,'notification',(SELECT to_jsonb(n) FROM public.notifications n WHERE n.id=p_id));
END $$;

CREATE FUNCTION public.shop_begin_push_device(p_id uuid,p_lease uuid,p_device uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old text; BEGIN
 PERFORM 1 FROM public.notification_push_dispatch WHERE notification_id=p_id AND lease_token=p_lease AND lease_until>now() AND state='sending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Push lease lost' USING ERRCODE='40001'; END IF;
 SELECT state INTO old FROM public.notification_push_receipt WHERE notification_id=p_id AND device_id=p_device FOR UPDATE;
 IF old IN ('accepted','unknown','invalid_device','sending') THEN RETURN false; END IF;
 INSERT INTO public.notification_push_receipt(notification_id,device_id,state) VALUES(p_id,p_device,'sending') ON CONFLICT(notification_id,device_id) DO UPDATE SET state='sending',error_code=NULL,updated_at=now();
 RETURN true;
END $$;

CREATE FUNCTION public.shop_record_push_device(p_id uuid,p_lease uuid,p_device uuid,p_state text,p_ticket text,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.notification_push_dispatch WHERE notification_id=p_id AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Push lease lost' USING ERRCODE='40001'; END IF;
 IF p_state NOT IN ('accepted','failed','unknown','invalid_device') OR p_state='accepted' AND nullif(p_ticket,'') IS NULL THEN RAISE EXCEPTION 'Invalid push evidence' USING ERRCODE='22023'; END IF;
 UPDATE public.notification_push_receipt SET state=p_state,ticket_id=p_ticket,error_code=left(p_error,100),updated_at=now() WHERE notification_id=p_id AND device_id=p_device AND state='sending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Push attempt missing' USING ERRCODE='40001'; END IF;
END $$;

CREATE FUNCTION public.shop_finish_push(p_id uuid,p_lease uuid,p_state text,p_error text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result text:=p_state; BEGIN
 PERFORM 1 FROM public.notification_push_dispatch WHERE notification_id=p_id AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Push lease lost' USING ERRCODE='40001'; END IF;
 IF p_state NOT IN ('accepted','pending','suppressed','no_device','review','failed') THEN RAISE EXCEPTION 'Invalid push state'; END IF;
 IF EXISTS(SELECT 1 FROM public.notification_push_receipt WHERE notification_id=p_id AND state IN ('unknown','sending')) THEN result:='review';
 ELSIF EXISTS(SELECT 1 FROM public.notification_push_receipt WHERE notification_id=p_id AND state='failed') THEN result:='pending';
 ELSIF p_state='accepted' AND NOT EXISTS(SELECT 1 FROM public.notification_push_receipt WHERE notification_id=p_id AND state='accepted') THEN result:='no_device'; END IF;
 UPDATE public.notification_push_dispatch SET state=result,lease_token=NULL,lease_until=NULL,available_at=now()+interval '15 minutes',last_error=left(p_error,100) WHERE notification_id=p_id;
END $$;

CREATE FUNCTION public.shop_pending_push_receipts() RETURNS SETOF public.notification_push_receipt LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT * FROM public.notification_push_receipt WHERE state='accepted' AND provider_receipt IS NULL AND updated_at<now()-interval '15 minutes' AND updated_at>now()-interval '24 hours' ORDER BY updated_at LIMIT 100
$$;
CREATE FUNCTION public.shop_record_push_receipt(p_id uuid,p_device uuid,p_ticket text,p_status text,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN ('ok','error') THEN RAISE EXCEPTION 'Invalid provider receipt'; END IF;
 UPDATE public.notification_push_receipt SET provider_receipt=p_status,error_code=left(p_error,100),updated_at=now() WHERE notification_id=p_id AND device_id=p_device AND ticket_id=p_ticket AND state='accepted' AND provider_receipt IS NULL;
 -- Provider acceptance still does not prove device display or a rider read.
 IF p_status='error' THEN UPDATE public.notification_push_dispatch SET state='review',last_error=left(p_error,100) WHERE notification_id=p_id; END IF;
END $$;

REVOKE ALL ON FUNCTION public.shop_enqueue_notification_push(),public.shop_pending_push(),public.shop_claim_push(uuid),public.shop_begin_push_device(uuid,uuid,uuid),public.shop_record_push_device(uuid,uuid,uuid,text,text,text),public.shop_finish_push(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.shop_pending_push(),public.shop_claim_push(uuid),public.shop_begin_push_device(uuid,uuid,uuid),public.shop_record_push_device(uuid,uuid,uuid,text,text,text),public.shop_finish_push(uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.shop_pending_push_receipts(),public.shop_record_push_receipt(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shop_pending_push_receipts(),public.shop_record_push_receipt(uuid,uuid,text,text,text) TO service_role;
COMMIT;
