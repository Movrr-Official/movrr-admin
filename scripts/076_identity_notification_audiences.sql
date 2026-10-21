-- Domain and scoped staff audiences derive from explicit memberships, never user_role.
BEGIN;
CREATE OR REPLACE FUNCTION public.ops_queue_notifications(p_operation uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF p_payload->>'target'='role' AND p_payload->>'role' NOT IN ('rider','partner','advertiser','government','staff') AND jsonb_array_length(public.ops_employee_capabilities(p_payload->>'role'))=0 THEN
   RAISE EXCEPTION 'Canonical recipient role required' USING ERRCODE='22023'; END IF;
 IF p_payload->>'target'='role' AND nullif(p_payload->>'role','') IS NULL OR p_payload->>'target'='userIds' AND (jsonb_typeof(p_payload->'userIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'userIds')=0) THEN RAISE EXCEPTION 'Audience required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.ops_notification_send(id,actor_user_id,payload) VALUES(p_operation,actor,p_payload);
 -- No PostgREST row cap. Preference-query failure rolls back the entire operation.
 INSERT INTO public.ops_notification_recipient(operation,user_id)
 SELECT p_operation,u.id FROM public."user" u LEFT JOIN public.user_preferences pref ON pref.user_id=u.id
 WHERE public.account_identity_active(u.id) AND (p_payload->>'target'='all' OR p_payload->>'target'='role' AND ((p_payload->>'role'='rider' AND EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=u.id AND r.status='active')) OR
 EXISTS(SELECT 1 FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id WHERE m.user_id=u.id AND m.status='active' AND o.status='active' AND
  (CASE WHEN o.type='reward_partner' THEN 'partner' ELSE o.type END)=p_payload->>'role') OR
 EXISTS(SELECT 1 FROM public.admin_users employee WHERE employee.user_id=u.id AND jsonb_array_length(public.ops_employee_capabilities(employee.role))>0 AND (p_payload->>'role'='staff' OR employee.role=p_payload->>'role'))) OR p_payload->>'target'='userIds' AND (p_payload->'userIds') ? u.id::text)
 AND (NOT (p_payload->>'respectPreferences')::boolean OR coalesce(pref.notifications,true));
 PERFORM public.ops_audit('notifications.send','notification_send',p_operation::text,NULL,jsonb_build_object('audience',p_payload->>'target','counts',public.ops_notification_status(p_operation)),'Notification send queued',p_operation);
 RETURN public.ops_notification_status(p_operation);
END $$;

COMMIT;
