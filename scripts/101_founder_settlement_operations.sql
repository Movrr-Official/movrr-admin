-- PREPARED ONLY. Apply after 093-100. No schedules, financial gates or accounts enabled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.ride_ops_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 owner_reference text NOT NULL DEFAULT 'employee-sha256:fda75718291e1b61ff83' CHECK(owner_reference ~ '^employee-sha256:[a-f0-9]{20}$'),
 worker_expected boolean NOT NULL DEFAULT false,
 armed_at timestamptz,
 CHECK(NOT worker_expected OR (enabled AND armed_at IS NOT NULL))
);
INSERT INTO public.ride_ops_control(singleton) VALUES(true);
CREATE TABLE public.ride_ops_heartbeat (
 component text PRIMARY KEY CHECK(component IN ('worker','monitor')),
 last_invoked_at timestamptz NOT NULL,
 last_succeeded_at timestamptz,
 outcome text NOT NULL CHECK(outcome IN ('succeeded','failed')),
 correlation_id uuid NOT NULL
);
-- Operational state links existing incidents and the existing durable notification queue.
-- It is never an award, ledger, recovery approval or financial execution permit.
CREATE TABLE public.ride_ops_alert (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 condition text NOT NULL CHECK(condition IN ('delayed','overdueReviews','retryExhausted','historicalHolds','evidenceAbsent','workerDiagnostics','workerMissing','workerFailed')),
 incident_id text NOT NULL UNIQUE REFERENCES public.ops_incident(id),
 owner_id uuid REFERENCES public."user"(id) ON DELETE SET NULL,
 owner_reference text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 observed_count bigint NOT NULL CHECK(observed_count>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 cleared_at timestamptz,
 acknowledged_at timestamptz,
 acknowledged_by uuid REFERENCES public."user"(id) ON DELETE SET NULL,
 acknowledgement_operation uuid UNIQUE,
 escalated_at timestamptz,
 CHECK((acknowledged_at IS NULL AND acknowledged_by IS NULL AND acknowledgement_operation IS NULL) OR (acknowledged_at IS NOT NULL AND acknowledgement_operation IS NOT NULL))
);
CREATE UNIQUE INDEX ride_ops_alert_active_condition ON public.ride_ops_alert(condition) WHERE active;
-- Truthfully identify service-authored messages. Never impersonate the recipient as actor.
ALTER TABLE public.ops_notification_send ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.ops_notification_send ADD COLUMN principal_kind text NOT NULL DEFAULT 'employee';
ALTER TABLE public.ops_notification_send ADD CONSTRAINT ops_notification_send_principal CHECK(
 (principal_kind='employee' AND actor_user_id IS NOT NULL) OR (principal_kind='ride_settlement_monitor' AND actor_user_id IS NULL));
CREATE TABLE public.ride_ops_delivery (
 operation uuid PRIMARY KEY REFERENCES public.ops_notification_send(id),
 alert_id uuid NOT NULL REFERENCES public.ride_ops_alert(id),
 phase text NOT NULL CHECK(phase IN ('initial','escalation')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 delivered_at timestamptz,
 last_category text CHECK(last_category IN ('schema_contract','authorization','invalid_evidence','transient_infrastructure','internal')),
 dead_letter_at timestamptz,
 UNIQUE(alert_id,phase)
);
ALTER TABLE public.ride_ops_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_ops_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_ops_alert ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_ops_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ride_ops_control,public.ride_ops_heartbeat,public.ride_ops_alert,public.ride_ops_delivery FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.ride_ops_owner() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE owners uuid[];
BEGIN
 SELECT array_agg(a.user_id) INTO owners FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id CROSS JOIN public.ride_ops_control c
 WHERE a.role='super_admin' AND u.status='active' AND au.email_confirmed_at IS NOT NULL AND au.deleted_at IS NULL
 AND (au.banned_until IS NULL OR au.banned_until<statement_timestamp()) AND lower(au.email)=lower(u.email)
 AND EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=a.user_id AND f.status='verified')
 AND 'employee-sha256:'||substr(encode(extensions.digest('movrr-launch-owner:'||a.user_id::text,'sha256'),'hex'),1,20)=c.owner_reference;
 IF cardinality(owners) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'ride_ops_owner_unavailable' USING ERRCODE='42501';END IF;
 RETURN owners[1];
END $$;

CREATE FUNCTION public.ride_ops_service_audit(p_action text,p_id uuid,p_detail jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.audit_log(action,result,performed_by,affected_entity,resource_id,metadata)
 VALUES(p_action,'recorded',jsonb_build_object('kind','service','name','ride_settlement_monitor'),jsonb_build_object('type','ride_operations','id',p_id),p_id::text,p_detail);
$$;

CREATE FUNCTION public.record_ride_worker_heartbeat(p_outcome text,p_correlation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('succeeded','failed') OR p_correlation IS NULL THEN RAISE EXCEPTION 'invalid_heartbeat' USING ERRCODE='22023';END IF;
 IF NOT (SELECT enabled FROM public.ride_ops_control) THEN RETURN jsonb_build_object('enabled',false);END IF;
 INSERT INTO public.ride_ops_heartbeat(component,last_invoked_at,last_succeeded_at,outcome,correlation_id)
 VALUES('worker',clock_timestamp(),CASE WHEN p_outcome='succeeded' THEN clock_timestamp() END,p_outcome,p_correlation)
 ON CONFLICT(component) DO UPDATE SET last_invoked_at=excluded.last_invoked_at,last_succeeded_at=coalesce(excluded.last_succeeded_at,ride_ops_heartbeat.last_succeeded_at),outcome=excluded.outcome,correlation_id=excluded.correlation_id;
 PERFORM public.ride_ops_service_audit('ride_worker_heartbeat',p_correlation,jsonb_build_object('outcome',p_outcome));
 RETURN jsonb_build_object('recorded',true);
END $$;

CREATE FUNCTION public.ride_ops_queue(p_alert uuid,p_phase text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ride_ops_alert;op uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO STRICT a FROM public.ride_ops_alert WHERE id=p_alert;
 IF p_phase NOT IN ('initial','escalation') THEN RAISE EXCEPTION 'invalid_alert_phase';END IF;
 IF EXISTS(SELECT 1 FROM public.ride_ops_delivery WHERE alert_id=p_alert AND phase=p_phase) THEN RETURN;END IF;
 INSERT INTO public.ops_notification_send(id,actor_user_id,principal_kind,payload)
 VALUES(op,NULL,'ride_settlement_monitor',jsonb_build_object('type','system','title',CASE WHEN p_phase='escalation' THEN 'Settlement incident: acknowledgement overdue' ELSE 'Ride settlement requires attention' END,
 'message',a.condition||': '||a.observed_count::text||'. Review the incident; acknowledgement does not authorize financial recovery.',
 'metadata',jsonb_build_object('category','ride_settlement_operations','incidentReference',a.incident_id,'correlationId',a.id,'href','/incidents','action_url','/incidents','phase',p_phase)));
 INSERT INTO public.ops_notification_recipient(operation,user_id) VALUES(op,a.owner_id);
 INSERT INTO public.ride_ops_delivery(operation,alert_id,phase) VALUES(op,a.id,p_phase);
 PERFORM public.ride_ops_service_audit('ride_ops_queued',a.id,jsonb_build_object('operation',op,'phase',p_phase));
END $$;

CREATE FUNCTION public.monitor_ride_operations_v3() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.ride_ops_control;owner uuid;health jsonb;item record;a public.ride_ops_alert;incident public.ops_incident;job record;r public.ops_notification_recipient;category text;state text;delivered integer:=0;failed integer:=0;correlation uuid:=gen_random_uuid();
BEGIN
 -- Serialize collectors; callers cannot inject counts, recipients, content or financial actions.
 SELECT * INTO c FROM public.ride_ops_control FOR UPDATE;
 IF NOT c.enabled THEN RETURN jsonb_build_object('enabled',false);END IF;
 owner:=public.ride_ops_owner();
 health:=public.ride_settlement_health_v3()||jsonb_build_object(
 'workerMissing',CASE WHEN c.worker_expected AND greatest(coalesce((SELECT last_invoked_at FROM public.ride_ops_heartbeat WHERE component='worker'),c.armed_at),c.armed_at)<clock_timestamp()-interval '3 minutes' THEN 1 ELSE 0 END,
 'workerFailed',CASE WHEN c.worker_expected AND EXISTS(SELECT 1 FROM public.ride_ops_heartbeat WHERE component='worker' AND outcome='failed' AND last_invoked_at>=c.armed_at) THEN 1 ELSE 0 END);
 FOR item IN SELECT key,value::text::bigint n FROM jsonb_each(health) WHERE key IN ('delayed','overdueReviews','retryExhausted','historicalHolds','evidenceAbsent','workerDiagnostics','workerMissing','workerFailed') LOOP
  SELECT * INTO a FROM public.ride_ops_alert WHERE condition=item.key AND active FOR UPDATE;
  IF item.n=0 THEN
   IF FOUND THEN UPDATE public.ride_ops_alert SET active=false,observed_count=0,cleared_at=clock_timestamp(),last_observed_at=clock_timestamp() WHERE id=a.id;PERFORM public.ride_ops_service_audit('ride_ops_condition_cleared',a.id,jsonb_build_object('condition',item.key));END IF;
   CONTINUE;
  END IF;
  IF a.id IS NULL THEN
   -- Reuse an unresolved incident if its condition recurs; never duplicate an open incident.
   SELECT x.* INTO a FROM public.ride_ops_alert x JOIN public.ops_incident i ON i.id=x.incident_id WHERE x.condition=item.key AND i.status IN ('open','investigating') ORDER BY x.created_at DESC LIMIT 1 FOR UPDATE OF x;
   IF a.id IS NOT NULL THEN UPDATE public.ride_ops_alert SET active=true,cleared_at=NULL WHERE id=a.id;
   ELSE
    a.id:=gen_random_uuid();a.incident_id:=a.id::text;
    INSERT INTO public.ops_incident(id,title,description,severity,status,created_by)
    VALUES(a.incident_id,'Ride settlement: '||item.key,'Aggregate operational condition. Investigate using authorized ride settlement tools. Financial recovery requires separate independent approval.','critical','open','service:ride_settlement_monitor');
    INSERT INTO public.ride_ops_alert(id,condition,incident_id,owner_id,owner_reference,observed_count) VALUES(a.id,item.key,a.incident_id,owner,c.owner_reference,item.n);
    PERFORM public.ride_ops_service_audit('ride_ops_incident_created',a.id,jsonb_build_object('condition',item.key,'count',item.n));
    PERFORM public.ride_ops_queue(a.id,'initial');
   END IF;
  END IF;
  UPDATE public.ride_ops_alert SET observed_count=item.n,last_observed_at=clock_timestamp() WHERE id=a.id;
 END LOOP;
 -- Escalation goes to the SAME accountable founder. No fictitious team or recipient.
 FOR a IN SELECT x.* FROM public.ride_ops_alert x JOIN public.ops_incident i ON i.id=x.incident_id WHERE x.acknowledged_at IS NULL AND x.escalated_at IS NULL AND x.created_at<clock_timestamp()-interval '15 minutes' AND i.status IN ('open','investigating') FOR UPDATE OF x LOOP
  PERFORM public.ride_ops_queue(a.id,'escalation');UPDATE public.ride_ops_alert SET escalated_at=clock_timestamp() WHERE id=a.id;
 END LOOP;
 FOR job IN SELECT d.*,s.payload FROM public.ride_ops_delivery d JOIN public.ops_notification_send s ON s.id=d.operation WHERE d.delivered_at IS NULL AND d.dead_letter_at IS NULL AND d.next_attempt_at<=clock_timestamp() ORDER BY d.next_attempt_at,d.operation LIMIT 20 FOR UPDATE OF d SKIP LOCKED LOOP
  BEGIN
   SELECT * INTO STRICT r FROM public.ops_notification_recipient WHERE operation=job.operation FOR UPDATE;
   IF r.user_id<>owner THEN RAISE EXCEPTION 'ride_ops_recipient_unavailable' USING ERRCODE='42501';END IF;
   INSERT INTO public.notifications(id,user_id,type,title,message,metadata)
   VALUES(r.notification_id,r.user_id,(job.payload->>'type')::public.notification_type,job.payload->>'title',job.payload->>'message',job.payload->'metadata'||jsonb_build_object('send_operation',job.operation));
   UPDATE public.ops_notification_recipient SET delivered_at=clock_timestamp() WHERE operation=job.operation AND user_id=r.user_id;
   UPDATE public.ops_notification_send SET completed_at=clock_timestamp() WHERE id=job.operation;
   UPDATE public.ride_ops_delivery SET attempts=attempts+1,delivered_at=clock_timestamp(),last_category=NULL WHERE operation=job.operation;
   PERFORM public.ride_ops_service_audit('ride_ops_delivered',job.alert_id,jsonb_build_object('operation',job.operation));delivered:=delivered+1;
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE;
   category:=CASE WHEN state='42501' THEN 'authorization' WHEN left(state,2) IN ('42','23') THEN 'schema_contract' WHEN left(state,2)='22' THEN 'invalid_evidence' WHEN left(state,2) IN ('08','40','53','57') OR state='55P03' THEN 'transient_infrastructure' ELSE 'internal' END;
   UPDATE public.ride_ops_delivery SET attempts=attempts+1,last_category=category,next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),dead_letter_at=CASE WHEN attempts+1>=8 THEN clock_timestamp() END WHERE operation=job.operation;
   PERFORM public.ride_ops_service_audit('ride_ops_delivery_failed',job.alert_id,jsonb_build_object('operation',job.operation,'category',category));failed:=failed+1;
  END;
 END LOOP;
 INSERT INTO public.ride_ops_heartbeat VALUES('monitor',clock_timestamp(),clock_timestamp(),'succeeded',correlation)
 ON CONFLICT(component) DO UPDATE SET last_invoked_at=excluded.last_invoked_at,last_succeeded_at=excluded.last_succeeded_at,outcome=excluded.outcome,correlation_id=excluded.correlation_id;
 RETURN jsonb_build_object('enabled',true,'delivered',delivered,'failed',failed,'pending',(SELECT count(*) FROM public.ride_ops_delivery WHERE delivered_at IS NULL AND dead_letter_at IS NULL),'deadLetters',(SELECT count(*) FROM public.ride_ops_delivery WHERE dead_letter_at IS NOT NULL),'unacknowledged',(SELECT count(*) FROM public.ride_ops_alert pending_alert JOIN public.ops_incident i ON i.id=pending_alert.incident_id WHERE pending_alert.acknowledged_at IS NULL AND i.status IN ('open','investigating')));
END $$;

CREATE FUNCTION public.acknowledge_ride_ops_incident(p_incident text,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;a public.ride_ops_alert;i public.ops_incident;result jsonb;
BEGIN
 actor:=public.ops_assert_capability('incidents.manage');
 IF coalesce(auth.jwt()->>'aal','')<>'aal2' OR actor<>public.ride_ops_owner() THEN RAISE EXCEPTION 'owner_mfa_acknowledgement_required' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL THEN RAISE EXCEPTION 'operation_required' USING ERRCODE='22023';END IF;
 SELECT * INTO a FROM public.ride_ops_alert WHERE incident_id=p_incident FOR UPDATE;
 IF NOT FOUND OR a.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'incident_unavailable' USING ERRCODE='42501';END IF;
 IF a.acknowledged_at IS NOT NULL THEN
  IF a.acknowledgement_operation IS DISTINCT FROM p_operation THEN RAISE EXCEPTION 'incident_already_acknowledged' USING ERRCODE='40001';END IF;
  RETURN (SELECT receipt.result FROM public.ops_command_receipt receipt WHERE receipt.actor_user_id=actor AND receipt.operation=p_operation);
 END IF;
 IF EXISTS(SELECT 1 FROM public.ops_command_receipt WHERE actor_user_id=actor AND operation=p_operation) THEN RAISE EXCEPTION 'operation_conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO STRICT i FROM public.ops_incident WHERE id=p_incident FOR UPDATE;
 UPDATE public.ride_ops_alert SET acknowledged_at=clock_timestamp(),acknowledged_by=actor,acknowledgement_operation=p_operation WHERE id=a.id;
 UPDATE public.ops_incident SET status='investigating',version=version+1,updated_at=clock_timestamp() WHERE id=p_incident RETURNING * INTO i;
 result:=public.ops_incident_json(i);
 PERFORM public.ops_audit('incidents.manage','incident',p_incident,NULL,result,'Explicit MFA human settlement acknowledgement; no financial action',p_operation);
 INSERT INTO public.ops_command_receipt VALUES(actor,p_operation,'ride_ops_acknowledgement',jsonb_build_object('incident',p_incident),result,clock_timestamp());
 RETURN result;
END $$;

CREATE FUNCTION public.guard_ride_ops_incident() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status<>OLD.status AND EXISTS(SELECT 1 FROM public.ride_ops_alert WHERE incident_id=OLD.id AND acknowledged_at IS NULL) THEN RAISE EXCEPTION 'explicit_owner_mfa_acknowledgement_required' USING ERRCODE='42501';END IF;
 IF NEW.status IN ('resolved','closed') AND NEW.status<>OLD.status AND EXISTS(SELECT 1 FROM public.ride_ops_alert WHERE incident_id=OLD.id AND active) THEN RAISE EXCEPTION 'operational_condition_still_active' USING ERRCODE='55000';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_ride_ops_incident BEFORE UPDATE ON public.ops_incident FOR EACH ROW EXECUTE FUNCTION public.guard_ride_ops_incident();

CREATE FUNCTION public.retry_ride_ops_delivery(p_delivery uuid,p_operation uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;d public.ride_ops_delivery;result jsonb;receipt public.ops_command_receipt;
BEGIN
 actor:=public.ops_assert_capability('incidents.manage');
 IF coalesce(auth.jwt()->>'aal','')<>'aal2' OR actor<>public.ride_ops_owner() THEN RAISE EXCEPTION 'owner_mfa_required' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'retry_reason_required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_operation::text,7));
 SELECT * INTO receipt FROM public.ops_command_receipt WHERE actor_user_id=actor AND operation=p_operation;
 IF FOUND THEN
  IF receipt.kind<>'ride_ops_delivery_retry' OR receipt.payload<>jsonb_build_object('delivery',p_delivery,'reason',p_reason) THEN RAISE EXCEPTION 'operation_conflict' USING ERRCODE='40001';END IF;
  RETURN receipt.result;
 END IF;
 SELECT * INTO d FROM public.ride_ops_delivery WHERE operation=p_delivery FOR UPDATE;
 IF NOT FOUND OR d.dead_letter_at IS NULL OR d.delivered_at IS NOT NULL THEN RAISE EXCEPTION 'dead_letter_required' USING ERRCODE='40001';END IF;
 UPDATE public.ride_ops_delivery SET attempts=0,dead_letter_at=NULL,next_attempt_at=clock_timestamp() WHERE operation=p_delivery;
 result:=jsonb_build_object('requeued',true,'operation',p_delivery);
 PERFORM public.ops_audit('incidents.manage','notification_send',p_delivery::text,to_jsonb(d),result,p_reason,p_operation);
 INSERT INTO public.ops_command_receipt VALUES(actor,p_operation,'ride_ops_delivery_retry',jsonb_build_object('delivery',p_delivery,'reason',p_reason),result,clock_timestamp());
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.ops_incident_json(i public.ops_incident) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',i.id,'title',i.title,'description',i.description,'severity',i.severity,'status',i.status,'version',i.version,'createdAt',i.created_at,'updatedAt',i.updated_at,'createdBy',i.created_by,'settlementOperations',
 (SELECT jsonb_build_object('condition',a.condition,'active',a.active,'observedCount',a.observed_count,'acknowledgedAt',a.acknowledged_at,'escalatedAt',a.escalated_at,'ownerRole','super_admin','deliveries',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('operation',d.operation,'phase',d.phase,'attempts',d.attempts,'deliveredAt',d.delivered_at,'nextAttemptAt',d.next_attempt_at,'deadLetterAt',d.dead_letter_at,'category',d.last_category)),'[]') FROM public.ride_ops_delivery d WHERE d.alert_id=a.id)) FROM public.ride_ops_alert a WHERE a.incident_id=i.id))
$$;
-- Existing generic delivery must not bypass the service queue retry/ownership contract.
ALTER FUNCTION public.ops_deliver_notification_batch(uuid,integer) RENAME TO ops_deliver_employee_notification_batch;
REVOKE ALL ON FUNCTION public.ops_deliver_employee_notification_batch(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ops_deliver_notification_batch(p_operation uuid,p_limit integer DEFAULT 500) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.ops_assert_capability('notifications.send');
 IF EXISTS(SELECT 1 FROM public.ops_notification_send WHERE id=p_operation AND principal_kind<>'employee') THEN RAISE EXCEPTION 'service_delivery_interface_required' USING ERRCODE='42501';END IF;
 RETURN public.ops_deliver_employee_notification_batch(p_operation,p_limit);
END $$;
REVOKE ALL ON FUNCTION public.ride_ops_owner(),public.ride_ops_service_audit(text,uuid,jsonb),public.record_ride_worker_heartbeat(text,uuid),public.ride_ops_queue(uuid,text),public.monitor_ride_operations_v3(),public.acknowledge_ride_ops_incident(text,uuid),public.guard_ride_ops_incident(),public.ops_incident_json(public.ops_incident),public.ops_deliver_notification_batch(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.retry_ride_ops_delivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_ride_worker_heartbeat(text,uuid),public.monitor_ride_operations_v3() TO service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_ride_ops_incident(text,uuid),public.retry_ride_ops_delivery(uuid,uuid,text),public.ops_deliver_notification_batch(uuid,integer) TO authenticated;
COMMIT;
