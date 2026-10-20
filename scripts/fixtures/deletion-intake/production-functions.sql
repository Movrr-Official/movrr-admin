-- Read-only production deletion contracts. No customer records.
CREATE OR REPLACE FUNCTION public.account_deletion_rule_allowed(p_policy integer, p_scope text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_action_rule WHERE policy_version=p_policy AND scope=p_scope
 AND technical_status='approved' AND legal_status IN ('approved','not_required')
 AND finance_status IN ('approved','not_required') AND partner_status IN ('approved','not_required') AND approval_reference IS NOT NULL);
$function$;

CREATE OR REPLACE FUNCTION public.establish_account_deletion_barrier(p_user_id uuid, p_policy_version integer, p_acknowledged boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE j public.account_deletion_jobs; prior public.account_deletion_jobs;
BEGIN
 IF p_user_id IS NULL OR p_acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION 'verified disclosure acknowledgement required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_deletion_contract_gate WHERE requests_enabled)
 OR NOT EXISTS(SELECT 1 FROM public.account_deletion_policy_version WHERE version=p_policy_version AND technical_status='approved') THEN RAISE EXCEPTION 'deletion contract approval required'; END IF;
 -- Serialization is shared with every monitored writer. There is no window
 -- between the durable request and the operational restriction.
 INSERT INTO public.account_deletion_write_guard(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.account_deletion_write_guard WHERE user_id=p_user_id FOR UPDATE;
 SELECT * INTO prior FROM public.account_deletion_jobs WHERE user_id=p_user_id;
 IF prior.id IS NOT NULL THEN j:=prior;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'verified identity required'; END IF;
  INSERT INTO public.account_deletion_jobs(user_id,policy_version,stage) VALUES(p_user_id,p_policy_version,'restricted') RETURNING * INTO j;
  INSERT INTO public.account_deletion_audit(job_id,actor_user_id,event_code) VALUES(j.id,p_user_id,'request_acknowledged_barrier_established');
 END IF;
 UPDATE public.account_deletion_write_guard SET restricted=true,job_id=j.id,changed_at=now() WHERE user_id=p_user_id;
 RETURN jsonb_build_object('contractVersion',1,'policyVersion',j.policy_version,'requestId',j.id,'status','restricted');
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_verified_account_deletion(p_user uuid, p_policy integer, p_acknowledged boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;j public.account_deletion_jobs;r public.account_deletion_retention_rule;secret text;deadline timestamptz;
BEGIN
 result:=public.request_verified_account_deletion_core(p_user,p_policy,p_acknowledged);
 SELECT * INTO j FROM public.account_deletion_jobs WHERE id=(result->>'requestId')::uuid AND user_id=p_user FOR UPDATE;
 IF NOT public.account_deletion_rule_allowed(j.policy_version,'receipt.delivery') THEN RETURN result;END IF;
 SELECT * INTO r FROM public.account_deletion_retention_rule WHERE policy_version=j.policy_version AND category='receipt_access';
 IF r.approval_status IS DISTINCT FROM 'approved' OR r.period IS NULL OR r.lawful_basis IS NULL OR r.start_event IS DISTINCT FROM 'barrier_established' OR r.minimum_fields IS DISTINCT FROM ARRAY['token_digest','expires_at'] THEN RETURN result;END IF;
 deadline:=j.requested_at+r.period;
 IF deadline<=clock_timestamp() THEN RETURN result;END IF;
 secret:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 INSERT INTO public.account_deletion_receipt_access VALUES(j.id,sha256(convert_to(secret,'UTF8')),deadline)
 ON CONFLICT(job_id) DO UPDATE SET token_digest=excluded.token_digest,expires_at=excluded.expires_at;
 INSERT INTO public.account_deletion_audit(job_id,event_code) VALUES(j.id,'receipt_only_access_issued');
 RETURN result||jsonb_build_object('receiptAccess',jsonb_build_object('credential',secret,'expiresAt',deadline));
END $function$;

CREATE OR REPLACE FUNCTION public.request_verified_account_deletion_core(p_user uuid, p_policy integer, p_acknowledged boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE contract jsonb;
BEGIN
 IF p_policy<>1 THEN RAISE EXCEPTION 'unsupported disclosure contract';END IF;
 contract:=public.account_deletion_contract_status();
 IF contract->>'requestsEnabled'<>'true' THEN RAISE EXCEPTION 'deletion contract approval required';END IF;
 RETURN public.establish_account_deletion_barrier(p_user,(contract->>'policyVersion')::integer,p_acknowledged);
END $function$;
