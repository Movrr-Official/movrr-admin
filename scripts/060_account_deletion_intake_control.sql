-- Requires alignment 055/056/057 and the existing deletion contract v1.
-- Intake only: no policy approval, worker execution, retention change or activation.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.account_deletion_contract_gate) <> 1 OR
    EXISTS(SELECT 1 FROM public.account_deletion_contract_gate WHERE requests_enabled) THEN
  RAISE EXCEPTION 'Review and disable intake before installing operating control';
 END IF;
 IF encode(sha256(convert_to(replace(pg_get_functiondef('public.establish_account_deletion_barrier(uuid,integer,boolean)'::regprocedure),E'\r',''),'UTF8')),'hex') <> '8a739505e8466d09ee69fe2c05f9c6a97d5f931e5cadb19a7fdb93e513499c8d' THEN
  RAISE EXCEPTION 'Review changed deletion barrier before migration';
 END IF;
END $$;
ALTER TABLE public.account_deletion_contract_gate
 ADD operating_state text NOT NULL DEFAULT 'disabled' CHECK(operating_state IN ('enabled','disabled','hold')),
 ADD operating_version bigint NOT NULL DEFAULT 0 CHECK(operating_version>=0),
 ADD operating_changed_at timestamptz NOT NULL DEFAULT now(),
 ADD operating_changed_by uuid,
 ADD operating_reason text NOT NULL DEFAULT 'Self-service intake awaits explicit activation approval';
-- Keep the established boolean interface, derived from the single operating authority.
ALTER TABLE public.account_deletion_contract_gate DROP COLUMN requests_enabled;
ALTER TABLE public.account_deletion_contract_gate ADD requests_enabled boolean GENERATED ALWAYS AS (operating_state='enabled') STORED;
ALTER TABLE public.account_deletion_contract_gate ADD CHECK(NOT requests_enabled OR
 (catalog_digest IS NOT NULL AND catalog_verified_at IS NOT NULL AND catalog_review_reference IS NOT NULL AND barrier_verified_at IS NOT NULL AND disposition_verified_at IS NOT NULL));
REVOKE ALL ON public.account_deletion_contract_gate FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.account_deletion_intake_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.ops_assert_capability('privacy.deletion.monitor');
 RETURN (SELECT jsonb_build_object('state',operating_state,'version',operating_version,
  'changedAt',operating_changed_at,'changedBy',operating_changed_by,'reason',operating_reason,
  'requestsEnabled',coalesce((public.account_deletion_contract_status()->>'requestsEnabled')::boolean,false),
  'policyVersion',active_policy_version) FROM public.account_deletion_contract_gate WHERE singleton);
END $$;
CREATE FUNCTION public.set_account_deletion_intake(p_state text,p_expected bigint,p_reason text,p_operation uuid) RETURNS jsonb
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
 -- Serialize all commands on the authority row; same-operation retries return the committed receipt.
 SELECT * INTO gate FROM public.account_deletion_contract_gate WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Intake control unavailable' USING ERRCODE='55000'; END IF;
 SELECT * INTO prior FROM public.ops_command_receipt WHERE actor_user_id=actor AND operation=p_operation;
 IF FOUND THEN
  IF prior.kind<>'deletion.intake' OR prior.payload<>payload THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF;
  RETURN prior.result;
 END IF;
 IF gate.operating_version<>p_expected THEN RAISE EXCEPTION 'Operating state changed' USING ERRCODE='40001'; END IF;
 IF p_state='enabled' AND NOT (
  gate.catalog_digest IS NOT NULL AND gate.catalog_verified_at IS NOT NULL AND gate.catalog_review_reference IS NOT NULL
  AND gate.barrier_verified_at IS NOT NULL AND gate.disposition_verified_at IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.account_deletion_policy_version WHERE version=gate.active_policy_version AND technical_status='approved')
  AND public.account_deletion_rule_allowed(gate.active_policy_version,'personal.erase')
  AND public.account_deletion_rule_allowed(gate.active_policy_version,'external.erase')
  AND public.account_deletion_rule_allowed(gate.active_policy_version,'receipt.complete')
  AND public.account_deletion_rule_allowed(gate.active_policy_version,'restore.suppress')) THEN
  RAISE EXCEPTION 'Existing deletion policy approvals and readiness evidence required' USING ERRCODE='55000'; END IF;
 old_state:=jsonb_build_object('state',gate.operating_state,'version',gate.operating_version);
 UPDATE public.account_deletion_contract_gate SET operating_state=p_state,operating_version=operating_version+1,
  operating_changed_at=clock_timestamp(),operating_changed_by=actor,operating_reason=trim(p_reason) WHERE singleton;
 result:=public.account_deletion_intake_status();
 PERFORM public.ops_audit('settings.security','account_deletion_intake','global',old_state,result,trim(p_reason),p_operation);
 INSERT INTO public.ops_command_receipt(actor_user_id,operation,kind,payload,result) VALUES(actor,p_operation,'deletion.intake',payload,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.account_deletion_intake_status(),public.set_account_deletion_intake(text,bigint,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_intake_status(),public.set_account_deletion_intake(text,bigint,text,uuid) TO authenticated;
-- Preserve the canonical request/receipt implementation. Fence acceptance against a
-- concurrent hold: an accepted request linearizes before the hold or is rejected.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.establish_account_deletion_barrier(uuid,integer,boolean)'::regprocedure);
 definition:=replace(definition,E'BEGIN\n',E'BEGIN\n PERFORM 1 FROM public.account_deletion_contract_gate WHERE singleton FOR SHARE;\n');
 EXECUTE definition;
END $$;
COMMIT;
