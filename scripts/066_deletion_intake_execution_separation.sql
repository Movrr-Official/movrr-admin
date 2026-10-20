-- Intake-only gate separation. No activation, policy approvals, financial writes,
-- erasure, schedules or changes to existing requests. Requires deployed 060.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guards$
DECLARE r record;
BEGIN
 IF (SELECT count(*) FROM public.account_deletion_contract_gate)<>1 OR EXISTS(
  SELECT 1 FROM public.account_deletion_contract_gate WHERE operating_state<>'disabled' OR managed_resources_execution_enabled
 ) THEN RAISE EXCEPTION 'Install only with intake and irreversible execution disabled';END IF;
 FOR r IN SELECT * FROM (VALUES
  ('set_account_deletion_intake(text,bigint,text,uuid)','666aac1c3305c479a9d8c743c737cfb3fd0b9b74c8d5f564e75f7e0b0df7a3a2'),
  ('account_deletion_contract_status()','d40f42b4e5aeea9c3c141138beb707ef9c19adec6b3194ae58276de5f21f0ba0'),
  ('establish_account_deletion_barrier(uuid,integer,boolean)','2e39c95f1e189c25e28d950c75e4f70c6350b755bd19371a37ac06ec32a70d70'),
  ('account_deletion_activation_authorized(uuid,uuid)','4a434675408460a509afb8cfd4a666aeff9473b6ceca6b0021621178159313de')
 ) AS expected(signature,digest) LOOP
  IF encode(sha256(convert_to(replace(pg_get_functiondef(('public.'||r.signature)::regprocedure),E'\r',''),'UTF8')),'hex')<>r.digest THEN
   RAISE EXCEPTION 'Deletion boundary changed: %',r.signature;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.account_deletion_contract_gate'::regclass
  AND conname='account_deletion_contract_gate_check' AND pg_get_constraintdef(oid)=
  'CHECK (((NOT requests_enabled) OR ((catalog_digest IS NOT NULL) AND (catalog_verified_at IS NOT NULL) AND (catalog_review_reference IS NOT NULL) AND (barrier_verified_at IS NOT NULL) AND (disposition_verified_at IS NOT NULL))))') THEN
  RAISE EXCEPTION 'Unexpected intake/execution constraint; review before applying';
 END IF;
END $guards$;

CREATE FUNCTION public.account_deletion_intake_ready(p_policy integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_policy_version p
  JOIN public.account_deletion_retention_rule r ON r.policy_version=p.version AND r.category='receipt_access'
  WHERE p.version=p_policy AND p.contract_version=1 AND p.technical_status='approved'
  AND public.account_deletion_rule_allowed(p.version,'receipt.delivery')
  AND r.approval_status='approved' AND r.period>interval '0' AND nullif(trim(r.lawful_basis),'') IS NOT NULL
  AND r.start_event='barrier_established' AND r.minimum_fields=ARRAY['token_digest','expires_at']
  AND nullif(trim(r.approval_reference),'') IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.account_deletion_intake_ready(integer) FROM PUBLIC,anon,authenticated,service_role;

-- Catalog/disposition verification stays mandatory for irreversible execution.
-- Receiving an authenticated request does not authorize that execution.
ALTER TABLE public.account_deletion_contract_gate DROP CONSTRAINT account_deletion_contract_gate_check;
ALTER TABLE public.account_deletion_contract_gate ADD CONSTRAINT account_deletion_execution_readiness CHECK(
 NOT managed_resources_execution_enabled OR (catalog_digest IS NOT NULL AND catalog_verified_at IS NOT NULL
 AND catalog_review_reference IS NOT NULL AND barrier_verified_at IS NOT NULL AND disposition_verified_at IS NOT NULL));
ALTER TABLE public.account_deletion_contract_gate ADD CONSTRAINT account_deletion_intake_readiness CHECK(
 NOT requests_enabled OR public.account_deletion_intake_ready(active_policy_version));

CREATE OR REPLACE FUNCTION public.account_deletion_contract_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('contractVersion',1,'policyVersion',active_policy_version,
  'requestsEnabled',requests_enabled AND public.account_deletion_intake_ready(active_policy_version))
 FROM public.account_deletion_contract_gate WHERE singleton;
$$;

CREATE OR REPLACE FUNCTION public.set_account_deletion_intake(p_state text,p_expected bigint,p_reason text,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; gate public.account_deletion_contract_gate; prior public.ops_command_receipt;
 payload jsonb; result jsonb; old_state jsonb;
BEGIN
 actor:=public.ops_assert_capability('settings.security');
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=actor AND role::text IN ('super_admin','security_admin')) THEN
  RAISE EXCEPTION 'Security administrator required' USING ERRCODE='42501'; END IF;
 IF p_state IS NULL OR p_state NOT IN ('enabled','disabled','hold') OR p_expected IS NULL OR p_expected<0 OR p_operation IS NULL
 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN
  RAISE EXCEPTION 'State, version, operation and reason required' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('state',p_state,'expected',p_expected,'reason',trim(p_reason));
 SELECT * INTO gate FROM public.account_deletion_contract_gate WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Intake control unavailable' USING ERRCODE='55000'; END IF;
 SELECT * INTO prior FROM public.ops_command_receipt WHERE actor_user_id=actor AND operation=p_operation;
 IF FOUND THEN
  IF prior.kind<>'deletion.intake' OR prior.payload<>payload THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF;
  RETURN prior.result;
 END IF;
 IF gate.operating_version<>p_expected THEN RAISE EXCEPTION 'Operating state changed' USING ERRCODE='40001'; END IF;
 IF p_state='enabled' AND NOT public.account_deletion_intake_ready(gate.active_policy_version) THEN
  RAISE EXCEPTION 'Intake contract and approved receipt access required' USING ERRCODE='55000'; END IF;
 old_state:=jsonb_build_object('state',gate.operating_state,'version',gate.operating_version);
 UPDATE public.account_deletion_contract_gate SET operating_state=p_state,operating_version=operating_version+1,
  operating_changed_at=clock_timestamp(),operating_changed_by=actor,operating_reason=trim(p_reason) WHERE singleton;
 result:=public.account_deletion_intake_status();
 PERFORM public.ops_audit('settings.security','account_deletion_intake','global',old_state,result,trim(p_reason),p_operation);
 INSERT INTO public.ops_command_receipt(actor_user_id,operation,kind,payload,result) VALUES(actor,p_operation,'deletion.intake',payload,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.establish_account_deletion_barrier(p_user_id uuid,p_policy_version integer,p_acknowledged boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.account_deletion_jobs; prior public.account_deletion_jobs;
BEGIN
 PERFORM 1 FROM public.account_deletion_contract_gate WHERE singleton FOR SHARE;
 IF p_user_id IS NULL OR p_acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION 'verified disclosure acknowledgement required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_deletion_contract_gate WHERE requests_enabled AND active_policy_version=p_policy_version)
 OR NOT public.account_deletion_intake_ready(p_policy_version) THEN RAISE EXCEPTION 'intake approval required'; END IF;
 INSERT INTO public.account_deletion_write_guard(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.account_deletion_write_guard WHERE user_id=p_user_id FOR UPDATE;
 SELECT * INTO prior FROM public.account_deletion_jobs WHERE user_id=p_user_id;
 IF prior.id IS NOT NULL THEN j:=prior;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM auth.users a JOIN public."user" u ON u.id=a.id
   JOIN public.rider r ON r.user_id=u.id WHERE a.id=p_user_id AND a.deleted_at IS NULL
   AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp()) AND u.status::text='active'
   AND u.deleted_at IS NULL AND u.role::text='rider' AND r.status::text='active') THEN
   RAISE EXCEPTION 'eligible authenticated rider required' USING ERRCODE='42501';END IF;
  INSERT INTO public.account_deletion_jobs(user_id,policy_version,stage,review_required,review_code,review_due_at)
  VALUES(p_user_id,p_policy_version,'restricted',true,'intake_review_required',clock_timestamp()+interval '1 day') RETURNING * INTO j;
  INSERT INTO public.account_deletion_review(job_id,category,reason_code,owner_capability,due_at)
  VALUES(j.id,'technical','intake_review_required','privacy.deletion.operations.review',j.review_due_at);
  INSERT INTO public.account_deletion_audit(job_id,actor_user_id,event_code) VALUES(j.id,p_user_id,'request_acknowledged_barrier_established');
 END IF;
 UPDATE public.account_deletion_write_guard SET restricted=true,job_id=j.id,changed_at=now() WHERE user_id=p_user_id;
 RETURN jsonb_build_object('contractVersion',1,'policyVersion',j.policy_version,'requestId',j.id,'status','restricted');
END $$;
-- CREATE OR REPLACE preserves existing private ACLs. The new helper is internal.
COMMIT;
