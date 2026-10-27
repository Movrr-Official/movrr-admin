-- Prepared pre-launch cutover only. Apply AFTER the separately versioned 093-101
-- package. No activation, historical DML, ledger rewrite or policy change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.get_my_ride_completion_capabilities()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('version',3,'schemaRevision',102,'evidenceAckVersion',1,
  'enabled',evidence_enabled AND worker_enabled AND financial_enabled
   AND approved_policy='movrr-combined-v3' AND approval_reference IS NOT NULL
   AND public.account_is_active())
 FROM public.ride_completion_release_control WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_my_ride_completion_capabilities() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_ride_completion_capabilities() TO authenticated;

-- Reject unsupported app/service enrollment even if the client omits negotiation.
-- Existing rows are not rewritten or auto-enrolled. Canonical Finish/recovery may
-- retain evidence while enrollment is disabled, so activation gates apply at INSERT.
CREATE FUNCTION public.guard_canonical_ride_enrollment_v3() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IN ('anon','authenticated','service_role')
    OR auth.role() IN ('anon','authenticated','service_role') THEN
  IF NEW.metadata->>'completion_protocol' IS DISTINCT FROM '3' THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='canonical_ride_protocol_required';
  END IF;
  IF NOT coalesce((public.get_my_ride_completion_capabilities()->>'enabled')::boolean,false) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='canonical_ride_activation_required';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_canonical_ride_enrollment_v3() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aa_guard_canonical_ride_enrollment_v3 BEFORE INSERT ON public.ride_session
 FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_ride_enrollment_v3();

-- Only complete_my_ride_v3 may create tracking evidence for clients. Its definer
-- authority and private permits are unchanged. Direct legacy tracking writes retire.
REVOKE INSERT,UPDATE,DELETE ON public.route_tracking FROM PUBLIC,anon,authenticated;

-- Retire obsolete client-execution entry points without dropping the private
-- financial kernel used by v3 and account-deletion reconciliation. PostgreSQL
-- owner/internal dependencies remain intact; no CASCADE or historical deletion.
DO $retire$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname IN ('enqueue_my_ride_settlement','claim_my_ride_settlement',
   'finish_my_ride_settlement','execute_my_ride_time_settlement','get_my_recoverable_ride_settlements')
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $retire$;

CREATE OR REPLACE FUNCTION public.get_my_ride_estimate_basis_v3(p_session uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT b.value||jsonb_build_object('policyVersion','movrr-combined-v3',
  'formulaCompatible',((b.value->>'formulaCompatible')::boolean AND p.eligibility_reason IS NULL),
  'dailyRemainingAtStart',p.remaining_at_start,
  'basisDigest',encode(sha256(convert_to((b.value->>'basisDigest')||to_jsonb(p)::text,'UTF8')),'hex'))
 FROM public.ride_session s JOIN public.ride_policy_basis_v3 p ON p.session_id=s.id
 CROSS JOIN LATERAL(SELECT public.get_my_ride_estimate_basis_before_combined(s.id) value) b
 WHERE s.id=p_session AND s.metadata->>'completion_protocol'='3'
  AND p.policy_version='movrr-combined-v3' AND b.value IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_my_ride_estimate_basis_v3(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_ride_estimate_basis_v3(uuid) TO authenticated;
COMMIT;
