-- X09/X14/X15. Private durable operations. Requires 055/056; never enables Shop.
BEGIN;
CREATE OR REPLACE FUNCTION public.ops_assert_capability(p_capability text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); role_name text;
BEGIN
 PERFORM public.assert_active_account();
 IF coalesce((SELECT (value->>'enforceAdminMfa')::boolean FROM public.platform_settings WHERE key='security'),true) AND coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'aal' IS DISTINCT FROM 'aal2' THEN
  RAISE EXCEPTION 'MFA required' USING ERRCODE='42501'; END IF;
 SELECT role::text INTO role_name FROM public.admin_users WHERE user_id=actor;
 IF role_name IS NULL OR NOT (public.ops_employee_capabilities(role_name) ? p_capability) THEN
  RAISE EXCEPTION 'Capability required' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.ops_assert_capability(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ops_assert_capability(text) TO authenticated;
CREATE TABLE public.ops_command_receipt(actor_user_id uuid NOT NULL REFERENCES public."user"(id),operation uuid NOT NULL,kind text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_user_id,operation));
ALTER TABLE public.ops_command_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_command_receipt FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ops_audit(p_cap text,p_type text,p_id text,p_old jsonb,p_new jsonb,p_reason text,p_operation uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(auth.uid(),'admin',p_cap,p_type,p_id,p_old,p_new,p_operation::text,p_reason)
$$;
REVOKE ALL ON FUNCTION public.ops_audit(text,text,text,jsonb,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.ops_incident(id text PRIMARY KEY,title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),description text NOT NULL,severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),status text NOT NULL CHECK(status IN ('open','investigating','resolved','closed')),version bigint NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by text);
-- Only persisted business records migrate. Bundled sample incidents are never loaded.
INSERT INTO public.ops_incident(id,title,description,severity,status,created_at,updated_at,created_by)
SELECT e->>'id',e->>'title',coalesce(e->>'description',''),e->>'severity',e->>'status',(e->>'createdAt')::timestamptz,(e->>'updatedAt')::timestamptz,e->>'createdBy'
FROM public.platform_settings s CROSS JOIN LATERAL jsonb_array_elements(s.value::jsonb->'incidents') e WHERE s.key='ops_incidents';
ALTER TABLE public.ops_incident ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_incident FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ops_block_retired_incident_store() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.key='ops_incidents' THEN RAISE EXCEPTION 'Incident store migrated; refresh application' USING ERRCODE='55000'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER ops_retired_incident_store BEFORE INSERT OR UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.ops_block_retired_incident_store();
CREATE FUNCTION public.ops_incident_json(i public.ops_incident) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('id',i.id,'title',i.title,'description',i.description,'severity',i.severity,'status',i.status,'version',i.version,'createdAt',i.created_at,'updatedAt',i.updated_at,'createdBy',i.created_by)
$$;
REVOKE ALL ON FUNCTION public.ops_incident_json(public.ops_incident) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ops_list_incidents() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.ops_assert_capability('incidents.read');
 RETURN (SELECT coalesce(jsonb_agg(public.ops_incident_json(i) ORDER BY updated_at DESC,id DESC),'[]') FROM public.ops_incident i);
END $$;
CREATE FUNCTION public.ops_incident_command(p_id text,p_status text,p_expected bigint,p_payload jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; cap text:=CASE WHEN p_id IS NULL THEN 'incidents.create' ELSE 'incidents.manage' END; i public.ops_incident; old jsonb; result jsonb; receipt public.ops_command_receipt; payload jsonb:=jsonb_build_object('id',p_id,'status',p_status,'expected',p_expected,'payload',p_payload);
BEGIN
 actor:=public.ops_assert_capability(cap);
 IF p_operation IS NULL THEN RAISE EXCEPTION 'Operation required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_operation::text,7));
 SELECT * INTO receipt FROM public.ops_command_receipt WHERE ops_command_receipt.actor_user_id=actor AND operation=p_operation;
 IF FOUND THEN
  IF receipt.actor_user_id IS DISTINCT FROM actor OR receipt.kind<>'incident' OR receipt.payload<>payload THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN receipt.result;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.ops_incident(id,title,description,severity,status,created_by) VALUES(p_operation::text,trim(p_payload->>'title'),coalesce(p_payload->>'description',''),p_payload->>'severity','open',actor::text) RETURNING * INTO i;
 ELSE
  SELECT * INTO i FROM public.ops_incident WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident unavailable' USING ERRCODE='P0002'; END IF;
  IF p_expected IS NULL OR i.version<>p_expected THEN RAISE EXCEPTION 'Incident changed; refresh' USING ERRCODE='40001'; END IF;
  old:=public.ops_incident_json(i);
  IF NOT ((i.status='open' AND p_status IN ('investigating','resolved','closed')) OR (i.status='investigating' AND p_status IN ('resolved','closed')) OR (i.status='resolved' AND p_status IN ('investigating','closed')) OR i.status=p_status) THEN RAISE EXCEPTION 'Invalid incident transition' USING ERRCODE='22023'; END IF;
  UPDATE public.ops_incident SET status=p_status,version=version+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO i;
 END IF;
 result:=public.ops_incident_json(i);
 PERFORM public.ops_audit(cap,'incident',i.id,old,result,'Incident command',p_operation);
 INSERT INTO public.ops_command_receipt VALUES(actor,p_operation,'incident',payload,result,now());
 RETURN result;
END $$;
CREATE TABLE public.ops_notification_send(id uuid PRIMARY KEY,actor_user_id uuid NOT NULL REFERENCES public."user"(id),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE TABLE public.ops_notification_recipient(operation uuid NOT NULL REFERENCES public.ops_notification_send(id),user_id uuid NOT NULL REFERENCES public."user"(id),notification_id uuid NOT NULL DEFAULT gen_random_uuid(),delivered_at timestamptz,skipped_at timestamptz,PRIMARY KEY(operation,user_id),UNIQUE(notification_id));
CREATE INDEX ops_notification_pending ON public.ops_notification_recipient(operation,user_id) WHERE delivered_at IS NULL AND skipped_at IS NULL;
ALTER TABLE public.ops_notification_send ENABLE ROW LEVEL SECURITY;ALTER TABLE public.ops_notification_recipient ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_notification_send,public.ops_notification_recipient FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ops_notification_status(p_operation uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('operationId',p_operation,'recipientCount',count(*),'createdCount',count(*) FILTER(WHERE delivered_at IS NOT NULL),'pendingCount',count(*) FILTER(WHERE delivered_at IS NULL AND skipped_at IS NULL),'skippedCount',count(*) FILTER(WHERE skipped_at IS NOT NULL)) FROM public.ops_notification_recipient WHERE operation=p_operation
$$;
REVOKE ALL ON FUNCTION public.ops_notification_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ops_queue_notifications(p_operation uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; job public.ops_notification_send;
BEGIN
 actor:=public.ops_assert_capability('notifications.send');
 IF p_operation IS NULL OR length(trim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_payload->>'message',''))) NOT BETWEEN 1 AND 10000 OR p_payload->>'type' NOT IN ('campaign_assigned','campaign_completed','route_assigned','route_completed','system','reward','status') OR p_payload->>'target' NOT IN ('all','role','userIds') OR jsonb_typeof(p_payload->'respectPreferences') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid notification request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,8));
 SELECT * INTO job FROM public.ops_notification_send WHERE id=p_operation FOR UPDATE;
 IF FOUND THEN
  IF job.actor_user_id<>actor OR job.payload<>p_payload THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN public.ops_notification_status(p_operation);
 END IF;
 IF p_payload->>'target'='role' AND nullif(p_payload->>'role','') IS NULL OR p_payload->>'target'='userIds' AND (jsonb_typeof(p_payload->'userIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'userIds')=0) THEN RAISE EXCEPTION 'Audience required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.ops_notification_send(id,actor_user_id,payload) VALUES(p_operation,actor,p_payload);
 -- No PostgREST row cap. Preference-query failure rolls back the entire operation.
 INSERT INTO public.ops_notification_recipient(operation,user_id)
 SELECT p_operation,u.id FROM public."user" u LEFT JOIN public.user_preferences pref ON pref.user_id=u.id
 WHERE u.status::text='active' AND (p_payload->>'target'='all' OR p_payload->>'target'='role' AND u.role::text=p_payload->>'role' OR p_payload->>'target'='userIds' AND (p_payload->'userIds') ? u.id::text)
 AND (NOT (p_payload->>'respectPreferences')::boolean OR coalesce(pref.notifications,true));
 PERFORM public.ops_audit('notifications.send','notification_send',p_operation::text,NULL,jsonb_build_object('audience',p_payload->>'target','counts',public.ops_notification_status(p_operation)),'Notification send queued',p_operation);
 RETURN public.ops_notification_status(p_operation);
END $$;
CREATE FUNCTION public.ops_deliver_notification_batch(p_operation uuid,p_limit integer DEFAULT 500) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; job public.ops_notification_send; r record; eligible boolean;
BEGIN
 actor:=public.ops_assert_capability('notifications.send');
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='22023'; END IF;
 SELECT * INTO job FROM public.ops_notification_send WHERE id=p_operation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Notification operation unavailable' USING ERRCODE='42501'; END IF;
 FOR r IN SELECT * FROM public.ops_notification_recipient WHERE operation=p_operation AND delivered_at IS NULL AND skipped_at IS NULL ORDER BY user_id LIMIT p_limit FOR UPDATE LOOP
  SELECT coalesce(u.status::text='active',false) AND (NOT (job.payload->>'respectPreferences')::boolean OR coalesce(pref.notifications,true)) INTO eligible FROM public."user" u LEFT JOIN public.user_preferences pref ON pref.user_id=u.id WHERE u.id=r.user_id;
  IF coalesce(eligible,false) THEN
   INSERT INTO public.notifications(id,user_id,type,title,message,metadata) VALUES(r.notification_id,r.user_id,job.payload->>'type',job.payload->>'title',job.payload->>'message',coalesce(job.payload->'metadata','{}')||jsonb_build_object('send_operation',p_operation));
   UPDATE public.ops_notification_recipient SET delivered_at=clock_timestamp() WHERE operation=p_operation AND user_id=r.user_id;
  ELSE UPDATE public.ops_notification_recipient SET skipped_at=clock_timestamp() WHERE operation=p_operation AND user_id=r.user_id;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.ops_notification_recipient WHERE operation=p_operation AND delivered_at IS NULL AND skipped_at IS NULL) THEN UPDATE public.ops_notification_send SET completed_at=coalesce(completed_at,now()) WHERE id=p_operation; END IF;
 PERFORM public.ops_audit('notifications.send','notification_send',p_operation::text,NULL,public.ops_notification_status(p_operation),'Notification delivery batch',p_operation);
 RETURN public.ops_notification_status(p_operation);
END $$;
CREATE FUNCTION public.ops_pending_notification_sends() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; BEGIN
 actor:=public.ops_assert_capability('notifications.send');
 RETURN (SELECT coalesce(jsonb_agg(public.ops_notification_status(id) ORDER BY created_at),'[]') FROM public.ops_notification_send WHERE completed_at IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.ops_list_incidents(),public.ops_incident_command(text,text,bigint,jsonb,uuid),public.ops_queue_notifications(uuid,jsonb),public.ops_deliver_notification_batch(uuid,integer),public.ops_pending_notification_sends() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ops_list_incidents(),public.ops_incident_command(text,text,bigint,jsonb,uuid),public.ops_queue_notifications(uuid,jsonb),public.ops_deliver_notification_batch(uuid,integer),public.ops_pending_notification_sends() TO authenticated;
CREATE FUNCTION public.ops_accessory_page(p_rider uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE result jsonb; BEGIN
 PERFORM public.ops_assert_capability('riders.read');
 WITH page AS (SELECT a.*,i.asset_code,i.status inventory_status FROM public.rider_campaign_accessory_assignment a JOIN public.campaign_accessory_inventory_item i ON i.id=a.inventory_item_id WHERE (p_rider IS NULL OR a.rider_id=p_rider) AND (p_cursor IS NULL OR a.id>p_cursor) ORDER BY a.id LIMIT 101),
 numbered AS (SELECT *,row_number() OVER(ORDER BY id) rn FROM page)
 SELECT jsonb_build_object('assignments',coalesce(jsonb_agg((to_jsonb(n)-'rn')||jsonb_build_object('events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id),'[]') FROM public.rider_campaign_accessory_event e WHERE e.assignment_id=n.id)) ORDER BY id) FILTER(WHERE rn<=100),'[]'),'nextCursor',CASE WHEN count(*)>100 THEN (SELECT id FROM numbered WHERE rn=100) ELSE NULL END) INTO result FROM numbered n;
 RETURN result;
END $$;
CREATE FUNCTION public.ops_accessory_command(p_assignment uuid,p_action text,p_expected timestamptz,p_operation uuid,p_reason text,p_replacement uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; a public.rider_campaign_accessory_assignment; item public.campaign_accessory_inventory_item; replacement public.campaign_accessory_inventory_item; receipt public.ops_command_receipt; payload jsonb:=jsonb_build_object('assignment',p_assignment,'action',p_action,'expected',p_expected,'reason',p_reason,'replacement',p_replacement); result jsonb; before_state jsonb; new_assignment uuid;
BEGIN
 actor:=public.ops_assert_capability('riders.manage');
 IF p_operation IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 OR p_action IS NULL OR p_action NOT IN ('return','cancel','replace','return_due') THEN RAISE EXCEPTION 'Invalid accessory command' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_operation::text,7));
 SELECT * INTO receipt FROM public.ops_command_receipt WHERE ops_command_receipt.actor_user_id=actor AND operation=p_operation;
 IF FOUND THEN
  IF receipt.kind<>'accessory' OR receipt.payload<>payload THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN receipt.result;
 END IF;
 SELECT * INTO a FROM public.rider_campaign_accessory_assignment WHERE id=p_assignment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='P0002'; END IF;
 IF a.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Assignment changed; refresh' USING ERRCODE='40001'; END IF;
 -- Stable inventory lock order prevents opposing replacements from deadlocking.
 PERFORM 1 FROM public.campaign_accessory_inventory_item WHERE id IN (a.inventory_item_id,p_replacement) ORDER BY id FOR UPDATE;
 SELECT * INTO item FROM public.campaign_accessory_inventory_item WHERE id=a.inventory_item_id;
 IF item.current_rider_id IS DISTINCT FROM a.rider_id OR item.current_campaign_id IS DISTINCT FROM a.campaign_id THEN RAISE EXCEPTION 'Custody changed' USING ERRCODE='40001'; END IF;
 IF a.status IN ('returned','cancelled') THEN RAISE EXCEPTION 'Assignment closed' USING ERRCODE='22023'; END IF;
 before_state:=to_jsonb(a);
 IF p_action='return_due' THEN
  UPDATE public.rider_campaign_accessory_assignment SET status='return_due',updated_at=clock_timestamp() WHERE id=a.id;
  INSERT INTO public.rider_campaign_accessory_event(assignment_id,event_type,actor_user_id,note) VALUES(a.id,'return_due',actor,p_reason);
 ELSE
  IF p_action='cancel' AND a.status NOT IN ('assigned','ready_for_install') THEN RAISE EXCEPTION 'Installed equipment must be returned or replaced' USING ERRCODE='22023'; END IF;
  IF p_action='replace' THEN
   SELECT * INTO replacement FROM public.campaign_accessory_inventory_item WHERE id=p_replacement;
   IF NOT FOUND OR replacement.id=a.inventory_item_id OR replacement.accessory_type_id<>item.accessory_type_id OR replacement.status<>'available' OR replacement.current_rider_id IS NOT NULL OR replacement.current_campaign_id IS NOT NULL THEN RAISE EXCEPTION 'Replacement unavailable' USING ERRCODE='40001'; END IF;
  END IF;
  UPDATE public.rider_campaign_accessory_assignment SET status=CASE WHEN p_action='cancel' THEN 'cancelled'::public.movrr_accessory_assignment_status ELSE 'returned'::public.movrr_accessory_assignment_status END,returned_at=CASE WHEN p_action<>'cancel' THEN now() ELSE returned_at END,updated_at=clock_timestamp() WHERE id=a.id;
  UPDATE public.campaign_accessory_inventory_item SET current_rider_id=NULL,current_campaign_id=NULL,status=CASE WHEN p_action='replace' OR item.status IN ('lost','maintenance') THEN 'maintenance'::public.movrr_accessory_inventory_status ELSE 'available'::public.movrr_accessory_inventory_status END,updated_at=clock_timestamp() WHERE id=item.id;
  INSERT INTO public.rider_campaign_accessory_event(assignment_id,event_type,actor_user_id,note,metadata) VALUES(a.id,CASE WHEN p_action='cancel' THEN 'cancelled'::public.movrr_accessory_event_type ELSE 'returned'::public.movrr_accessory_event_type END,actor,p_reason,jsonb_build_object('operation',p_operation));
  IF p_action='replace' THEN
   INSERT INTO public.rider_campaign_accessory_assignment(rider_id,campaign_id,inventory_item_id,requirement_id,status,install_instructions,return_instructions) VALUES(a.rider_id,a.campaign_id,replacement.id,a.requirement_id,'assigned',a.install_instructions,a.return_instructions) RETURNING id INTO new_assignment;
   UPDATE public.campaign_accessory_inventory_item SET status='assigned',current_rider_id=a.rider_id,current_campaign_id=a.campaign_id,updated_at=clock_timestamp() WHERE id=replacement.id;
   INSERT INTO public.rider_campaign_accessory_event(assignment_id,event_type,actor_user_id,note,metadata) VALUES(new_assignment,'assigned',actor,p_reason,jsonb_build_object('replacesAssignment',a.id,'operation',p_operation));
  END IF;
 END IF;
 SELECT to_jsonb(x)||jsonb_build_object('replacementAssignmentId',new_assignment) INTO result FROM public.rider_campaign_accessory_assignment x WHERE id=a.id;
 PERFORM public.ops_audit('riders.manage','accessory_assignment',a.id::text,before_state,result,p_reason,p_operation);
 INSERT INTO public.ops_command_receipt VALUES(actor,p_operation,'accessory',payload,result,now());
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.ops_accessory_page(uuid,uuid),public.ops_accessory_command(uuid,text,timestamptz,uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ops_accessory_page(uuid,uuid),public.ops_accessory_command(uuid,text,timestamptz,uuid,text,uuid) TO authenticated;
-- Preserve closed assignment history while permitting a later legitimate reassignment.
DO $unique$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.rider_campaign_accessory_assignment'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (rider_id, campaign_id, inventory_item_id)' LOOP
  EXECUTE format('ALTER TABLE public.rider_campaign_accessory_assignment DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $unique$;
CREATE UNIQUE INDEX ops_one_active_inventory_assignment ON public.rider_campaign_accessory_assignment(inventory_item_id) WHERE status NOT IN ('returned','cancelled');
CREATE FUNCTION public.ops_inventory_page(p_cursor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.ops_assert_capability('riders.read');
 RETURN (WITH page AS (SELECT * FROM public.campaign_accessory_inventory_item WHERE current_rider_id IS NULL AND current_campaign_id IS NULL AND status IN ('available','maintenance') AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT 101),n AS (SELECT *,row_number() OVER(ORDER BY id) rn FROM page)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(n)-'rn' ORDER BY id) FILTER(WHERE rn<=100),'[]'),'nextCursor',CASE WHEN count(*)>100 THEN (SELECT id FROM n WHERE rn=100) ELSE NULL END) FROM n);
END $$;
CREATE FUNCTION public.ops_assign_accessory(p_inventory uuid,p_rider uuid,p_campaign uuid,p_expected timestamptz,p_operation uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; item public.campaign_accessory_inventory_item; receipt public.ops_command_receipt; result jsonb; payload jsonb:=jsonb_build_object('inventory',p_inventory,'rider',p_rider,'campaign',p_campaign,'expected',p_expected,'reason',p_reason); aid uuid;
BEGIN
 actor:=public.ops_assert_capability('riders.manage');
 IF p_operation IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Reason and operation required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_operation::text,7));
 SELECT * INTO receipt FROM public.ops_command_receipt WHERE ops_command_receipt.actor_user_id=actor AND operation=p_operation;
 IF FOUND THEN IF receipt.kind<>'assign_accessory' OR receipt.payload<>payload THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;RETURN receipt.result;END IF;
 SELECT * INTO item FROM public.campaign_accessory_inventory_item WHERE id=p_inventory FOR UPDATE;
 IF NOT FOUND OR item.updated_at IS DISTINCT FROM p_expected OR item.status<>'available' OR item.current_rider_id IS NOT NULL OR item.current_campaign_id IS NOT NULL THEN RAISE EXCEPTION 'Inventory changed or unavailable' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM public.rider r WHERE r.id=p_rider AND EXISTS(SELECT 1 FROM public."user" u WHERE u.id=r.user_id AND lower(u.status::text) IN ('active','pending')) FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.campaign_assignment WHERE rider_id=p_rider AND campaign_id=p_campaign) THEN RAISE EXCEPTION 'Confirmed campaign assignment required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.rider_campaign_accessory_assignment(rider_id,campaign_id,inventory_item_id,status) VALUES(p_rider,p_campaign,p_inventory,'assigned') RETURNING id INTO aid;
 UPDATE public.campaign_accessory_inventory_item SET status='assigned',current_rider_id=p_rider,current_campaign_id=p_campaign,updated_at=clock_timestamp() WHERE id=p_inventory;
 INSERT INTO public.rider_campaign_accessory_event(assignment_id,event_type,actor_user_id,note) VALUES(aid,'assigned',actor,p_reason);
 result:=jsonb_build_object('assignmentId',aid);
 PERFORM public.ops_audit('riders.manage','accessory_inventory',p_inventory::text,to_jsonb(item),result,p_reason,p_operation);
 INSERT INTO public.ops_command_receipt VALUES(actor,p_operation,'assign_accessory',payload,result,now());RETURN result;
END $$;
CREATE FUNCTION public.ops_inventory_disposition(p_inventory uuid,p_status text,p_expected timestamptz,p_operation uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; item public.campaign_accessory_inventory_item; receipt public.ops_command_receipt; result jsonb; payload jsonb:=jsonb_build_object('inventory',p_inventory,'status',p_status,'expected',p_expected,'reason',p_reason);
BEGIN
 actor:=public.ops_assert_capability('riders.manage');
 IF p_status IS NULL OR p_status NOT IN ('available','retired') OR p_operation IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Invalid inventory disposition' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_operation::text,7));
 SELECT * INTO receipt FROM public.ops_command_receipt WHERE ops_command_receipt.actor_user_id=actor AND operation=p_operation;
 IF FOUND THEN IF receipt.kind<>'inventory_disposition' OR receipt.payload<>payload THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;RETURN receipt.result;END IF;
 SELECT * INTO item FROM public.campaign_accessory_inventory_item WHERE id=p_inventory FOR UPDATE;
 IF NOT FOUND OR item.updated_at IS DISTINCT FROM p_expected OR item.current_rider_id IS NOT NULL OR item.current_campaign_id IS NOT NULL OR item.status NOT IN ('maintenance','available') OR EXISTS(SELECT 1 FROM public.rider_campaign_accessory_assignment WHERE inventory_item_id=p_inventory AND status NOT IN ('returned','cancelled')) THEN RAISE EXCEPTION 'Inventory changed or still in custody' USING ERRCODE='40001'; END IF;
 UPDATE public.campaign_accessory_inventory_item SET status=p_status::public.movrr_accessory_inventory_status,updated_at=clock_timestamp(),retired_at=CASE WHEN p_status='retired' THEN current_date ELSE NULL END WHERE id=p_inventory RETURNING to_jsonb(campaign_accessory_inventory_item.*) INTO result;
 PERFORM public.ops_audit('riders.manage','accessory_inventory',p_inventory::text,to_jsonb(item),result,p_reason,p_operation);
 INSERT INTO public.ops_command_receipt VALUES(actor,p_operation,'inventory_disposition',payload,result,now());RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.ops_inventory_page(uuid),public.ops_assign_accessory(uuid,uuid,uuid,timestamptz,uuid,text),public.ops_inventory_disposition(uuid,text,timestamptz,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ops_inventory_page(uuid),public.ops_assign_accessory(uuid,uuid,uuid,timestamptz,uuid,text),public.ops_inventory_disposition(uuid,text,timestamptz,uuid,text) TO authenticated;
COMMIT;
