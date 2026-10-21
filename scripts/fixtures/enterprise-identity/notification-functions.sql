CREATE OR REPLACE FUNCTION public.assert_active_account()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_is_active() THEN
  RAISE EXCEPTION 'Account access restricted' USING ERRCODE='42501';
 END IF;
END $function$
;
CREATE OR REPLACE FUNCTION public.ops_assert_capability(p_capability text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.ops_audit(p_cap text, p_type text, p_id text, p_old jsonb, p_new jsonb, p_reason text, p_operation uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(auth.uid(),'admin',p_cap,p_type,p_id,p_old,p_new,p_operation::text,p_reason)
$function$
;
CREATE OR REPLACE FUNCTION public.ops_notification_status(p_operation uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('operationId',p_operation,'recipientCount',count(*),'createdCount',count(*) FILTER(WHERE delivered_at IS NOT NULL),'pendingCount',count(*) FILTER(WHERE delivered_at IS NULL AND skipped_at IS NULL),'skippedCount',count(*) FILTER(WHERE skipped_at IS NOT NULL)) FROM public.ops_notification_recipient WHERE operation=p_operation
$function$
;