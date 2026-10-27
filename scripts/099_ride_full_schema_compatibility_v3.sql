-- Prepared only. Additive compatibility repair after 093-098; no gate activation or data rewrite.
BEGIN;
-- Qualify the invoker triggers reached by restricted-search-path completion. Keep
-- invoker/definer authority unchanged; no mutable schema is added to RPC search paths.
DO $repair$ DECLARE d text;n text; BEGIN
 FOREACH n IN ARRAY ARRAY['create_impression_events_from_tracking','update_rider_route_status'] LOOP
  d:=pg_get_functiondef(('public.'||n||'()')::regprocedure);
  IF n='create_impression_events_from_tracking' THEN
   IF strpos(d,'FROM route r')=0 OR strpos(d,'INSERT INTO impression_events (')=0 THEN RAISE EXCEPTION 'impression_trigger_contract_drift';END IF;
   d:=replace(replace(d,'FROM route r','FROM public.route r'),'INSERT INTO impression_events (','INSERT INTO public.impression_events (');
  ELSE
   IF strpos(d,'UPDATE rider_route')=0 THEN RAISE EXCEPTION 'route_status_trigger_contract_drift';END IF;
   d:=replace(d,'UPDATE rider_route','UPDATE public.rider_route');
  END IF;
  EXECUTE d;
  EXECUTE format('ALTER FUNCTION public.%I() SET search_path TO %L',n,'');
 END LOOP;
END $repair$;

-- Existing records keep their status. Rejected observations remain evidence, never movement.
ALTER TABLE public.ride_gps_point DROP CONSTRAINT ride_gps_point_filter_status_check;
ALTER TABLE public.ride_gps_point ADD CONSTRAINT ride_gps_point_filter_status_check CHECK
 (filter_status IN ('accepted','accuracy_gate','speed_gate','jump_gate','noise_gate','timestamp_gate','client_rejected'));
ALTER TABLE public.ride_gps_point ADD COLUMN raw_accuracy jsonb;
ALTER TABLE public.ride_gps_point ADD COLUMN raw_speed jsonb;
COMMENT ON COLUMN public.ride_gps_point.raw_accuracy IS 'Original submitted JSON accuracy. Invalid values have NULL validated accuracy_m and are never accepted.';
ALTER TABLE public.ride_session DROP CONSTRAINT ride_session_status_check;
ALTER TABLE public.ride_session ADD CONSTRAINT ride_session_status_check CHECK
 (status IN ('draft','active','paused','completed','cancelled','rejected','under_review'));

-- Preserve raw malformed measurements while storing NULL in validated numeric
-- fields. JSON strings/nonfinite/negative/missing values cannot earn movement.
DO $repair$ DECLARE d text;old text; BEGIN
 d:=pg_get_functiondef('public.ingest_my_ride_evidence_v3(uuid,text,jsonb)'::regprocedure);
 old:='accuracy:=(v->>''accuracyM'')::double precision;speed:=(v->>''speedKmh'')::double precision;';
 IF strpos(d,old)=0 THEN RAISE EXCEPTION 'gps_numeric_anchor_drift';END IF;
 d:=replace(d,old,$new$
  accuracy:=NULL;speed:=NULL;
  IF jsonb_typeof(v->'accuracyM')='number' THEN
   BEGIN accuracy:=(v->>'accuracyM')::double precision; EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN accuracy:=NULL;END;
   IF NOT(accuracy BETWEEN 0 AND 1000000) THEN accuracy:=NULL;END IF;
  END IF;
  IF jsonb_typeof(v->'speedKmh')='number' THEN
   BEGIN speed:=(v->>'speedKmh')::double precision; EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN speed:=NULL;END;
   IF NOT(speed BETWEEN 0 AND 1000000) THEN speed:=NULL;END IF;
  END IF;
 $new$);
 d:=replace(d,'WHEN v->>''clientAccepted''=''false'' THEN ''client_rejected''',
 $new$WHEN v->>'clientRejectionReason' IN ('accuracy_gate','speed_gate','jump_gate','noise_gate') THEN v->>'clientRejectionReason'
   WHEN v->>'clientAccepted'='false' THEN 'client_rejected'$new$);
 d:=replace(d,'WHEN speed IS NOT NULL AND NOT(speed BETWEEN 0 AND 40) THEN ''speed_gate''',
 'WHEN (v ? ''speedKmh'' AND v->''speedKmh''<>''null''::jsonb AND speed IS NULL) OR (speed IS NOT NULL AND NOT(speed BETWEEN 0 AND 40)) THEN ''speed_gate''');
 d:=replace(d,'batch_id,filter_status,evidence_sequence)','batch_id,filter_status,evidence_sequence,raw_accuracy,raw_speed)');
 d:=replace(d,'VALUES(s.id,lat,lon,accuracy,speed,ts,NULL,filter,seq);',
 'VALUES(s.id,lat,lon,accuracy,speed,ts,NULL,filter,seq,v->''accuracyM'',v->''speedKmh'');');
 d:=replace(d,'''status'',''duplicate'',''evidenceDigest''','''status'',''duplicate'',''batchKey'',p_batch_key,''persistedCount'',b.last_sequence-b.first_sequence+1,''evidenceDigest''');
 d:=replace(d,'''status'',''accepted'',''evidenceDigest''','''status'',''accepted'',''batchKey'',p_batch_key,''persistedCount'',expected-first_seq,''evidenceDigest''');
 EXECUTE d;
END $repair$;

-- Narrow lifecycle transitions for v3 only; historical rows/holds are not transitioned.
CREATE FUNCTION public.guard_ride_lifecycle_v3() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.metadata->>'completion_protocol'='3' AND NEW.status IS DISTINCT FROM OLD.status THEN
  IF NOT ((OLD.status='draft' AND NEW.status IN ('active','cancelled'))
   OR (OLD.status IN ('active','paused') AND NEW.status IN ('active','paused','cancelled','under_review','completed'))
   OR (OLD.status='under_review' AND NEW.status IN ('completed','rejected'))
   OR (OLD.status='completed' AND NEW.status IN ('rejected','under_review'))) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ride_lifecycle_transition_invalid';
  END IF;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_ride_lifecycle_v3() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_ride_lifecycle_v3 BEFORE UPDATE ON public.ride_session FOR EACH ROW EXECUTE FUNCTION public.guard_ride_lifecycle_v3();

CREATE TABLE public.ride_worker_diagnostic (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.ride_session(id),correlation_id uuid NOT NULL,
 stage text NOT NULL CHECK(stage IN ('account','evidence','verification','tracking','financial','projection')),
 category text NOT NULL CHECK(category IN ('schema_contract','invalid_evidence','authorization','transient_infrastructure','financial_review','internal')),
 sqlstate text NOT NULL CHECK(sqlstate ~ '^[0-9A-Z]{5}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.ride_worker_diagnostic ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ride_worker_diagnostic FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ride_worker_diagnostic TO service_role;
-- Patch the installed version-aware worker, preserving migration097's policy adapter.
DO $repair$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.process_ride_settlements_v3(integer,uuid,uuid)'::regprocedure);
 IF strpos(d,'verification_status=verdict WHERE')=0 OR strpos(d,'EXCEPTION WHEN OTHERS THEN')=0 THEN RAISE EXCEPTION 'worker_compatibility_anchor_drift';END IF;
 d:=replace(d,'failed integer:=0;','failed integer:=0;stage text;error_state text;error_category text;');
 d:=replace(d,'PERFORM public.account_deletion_assert_writable(owner);','stage:=''account'';PERFORM public.account_deletion_assert_writable(owner);stage:=''evidence'';');
 d:=replace(d,'verdict:=CASE','stage:=''verification'';verdict:=CASE');
 d:=replace(d,'UPDATE public.route_tracking SET total_distance=',
 $new$IF verdict IS NULL OR verdict NOT IN ('pending','verified','rejected','manual_review') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verification_verdict_invalid';END IF;
    stage:='tracking';UPDATE public.route_tracking SET total_distance=$new$);
 d:=replace(d,'verification_status=verdict WHERE','verification_status=verdict::public.movrr_verification_status WHERE');
 d:=replace(d,'result:=public.execute_ride_time_settlement','stage:=''financial'';result:=public.execute_ride_time_settlement');
 d:=replace(d,'IF result->>''settlementStatus''','stage:=''projection'';IF result->>''settlementStatus''');
 d:=replace(d,'EXCEPTION WHEN OTHERS THEN',$new$EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE;
   error_category:=CASE WHEN left(error_state,2)='42' AND error_state<>'42501' OR error_state IN ('23514','42804') THEN 'schema_contract'
    WHEN error_state='42501' THEN 'authorization' WHEN left(error_state,2)='22' THEN 'invalid_evidence'
    WHEN left(error_state,2) IN ('08','40','53','57') OR error_state='55P03' THEN 'transient_infrastructure'
    WHEN error_state='P0001' THEN 'financial_review' ELSE 'internal' END;
   INSERT INTO public.ride_worker_diagnostic(session_id,correlation_id,stage,category,sqlstate)
    VALUES(s.id,m.completion_key,coalesce(stage,'account'),error_category,error_state);
 $new$);
 d:=replace(d,'''processing_failed'',''processing_failed'',m.completion_key','''processing_failed'',error_category,m.completion_key');
 EXECUTE d;
END $repair$;
-- Restricted operational reader adds safe category/stage, never raw SQL text/state.
CREATE OR REPLACE FUNCTION public.ops_ride_processing_details(p_sessions uuid[]) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $ops$
 SELECT coalesce(jsonb_object_agg(s.id,public.ride_processing_details(s.id)||jsonb_build_object('diagnostic',
  (SELECT jsonb_build_object('stage',d.stage,'category',d.category,'correlationId',d.correlation_id,'at',d.created_at)
   FROM public.ride_worker_diagnostic d WHERE d.session_id=s.id ORDER BY d.id DESC LIMIT 1))),'{}')
 FROM public.ride_session s WHERE s.id=ANY(p_sessions) AND cardinality(p_sessions)<=200;
$ops$;
REVOKE ALL ON FUNCTION public.ops_ride_processing_details(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_ride_processing_details(uuid[]) TO service_role;
-- Aggregate evidence diagnostics, without rider IDs, raw errors or trails.
DO $health$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.ride_settlement_health_v3()'::regprocedure);
 IF strpos(d,'''historicalHolds'',')=0 THEN RAISE EXCEPTION 'health_anchor_drift';END IF;
 d:=replace(d,'''historicalHolds'',',$add$'evidenceAbsent',(SELECT count(*) FROM public.ride_session s WHERE s.metadata->>'completion_protocol'='3' AND s.status IN ('active','paused','completed','under_review') AND s.started_at<statement_timestamp()-interval '30 minutes' AND NOT EXISTS(SELECT 1 FROM public.ride_gps_point g WHERE g.session_id=s.id)),
 'workerDiagnostics',(SELECT count(*) FROM public.ride_worker_diagnostic WHERE created_at>statement_timestamp()-interval '30 minutes'),
 'historicalHolds',$add$);
 EXECUTE d;
END $health$;
DO $state$ DECLARE d text;needle text; BEGIN
 d:=pg_get_functiondef('public.ride_reward_processing_state_v3(uuid)'::regprocedure);
 needle:='WHEN state.r->>''status''=''awaiting_verification'' OR';
 IF strpos(d,needle)=0 THEN RAISE EXCEPTION 'processing_state_anchor_drift';END IF;
 d:=replace(d,needle,'WHEN s.status=''under_review'' OR s.verification_result->>''status''=''manual_review'' OR state.r->>''award_status''=''manual_review'' OR state.r->>''status''=''awaiting_verification'' OR');
 EXECUTE d;
END $state$;
-- Existing Admin page reader receives the same restricted diagnostics as detail reads.
DO $ops$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.ops_ride_processing_page_v3(jsonb)'::regprocedure);
 IF strpos(d,'public.ride_processing_details(s.id)')=0 THEN RAISE EXCEPTION 'ops_page_anchor_drift';END IF;
 d:=replace(d,'public.ride_processing_details(s.id)','(public.ops_ride_processing_details(ARRAY[s.id])->s.id::text)');
 EXECUTE d;
END $ops$;
-- Additive negotiation: older clients ignore fields; revised clients refuse incomplete schema.
CREATE OR REPLACE FUNCTION public.get_my_ride_completion_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $cap$
 SELECT jsonb_build_object('version',3,'schemaRevision',99,'evidenceAckVersion',1,'enabled',evidence_enabled AND public.account_is_active()) FROM public.ride_completion_release_control WHERE auth.uid() IS NOT NULL;
$cap$;
REVOKE ALL ON FUNCTION public.get_my_ride_completion_capabilities() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_ride_completion_capabilities() TO authenticated;
COMMIT;
