-- Operational cross-monitoring only. Financial and enrollment gates are unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.ride_ops_control
 ADD COLUMN watchdog_expected boolean NOT NULL DEFAULT false,
 ADD COLUMN watchdog_armed_at timestamptz,
 ADD CONSTRAINT ride_ops_watchdog_armed CHECK(NOT watchdog_expected OR (enabled AND watchdog_armed_at IS NOT NULL));
ALTER TABLE public.ride_ops_heartbeat DROP CONSTRAINT ride_ops_heartbeat_component_check;
ALTER TABLE public.ride_ops_heartbeat ADD CONSTRAINT ride_ops_heartbeat_component_check CHECK(component IN ('worker','monitor','watchdog'));
ALTER TABLE public.ride_ops_alert DROP CONSTRAINT ride_ops_alert_condition_check;
ALTER TABLE public.ride_ops_alert ADD CONSTRAINT ride_ops_alert_condition_check CHECK(condition IN ('delayed','overdueReviews','retryExhausted','historicalHolds','evidenceAbsent','workerDiagnostics','workerMissing','workerFailed','watchdogMissing','watchdogFailed'));

CREATE FUNCTION public.record_ride_watchdog_heartbeat(p_outcome text,p_correlation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('succeeded','failed') OR p_correlation IS NULL THEN RAISE EXCEPTION 'invalid_heartbeat' USING ERRCODE='22023';END IF;
 IF NOT (SELECT enabled FROM public.ride_ops_control) THEN RETURN jsonb_build_object('enabled',false);END IF;
 INSERT INTO public.ride_ops_heartbeat(component,last_invoked_at,last_succeeded_at,outcome,correlation_id)
 VALUES('watchdog',clock_timestamp(),CASE WHEN p_outcome='succeeded' THEN clock_timestamp() END,p_outcome,p_correlation)
 ON CONFLICT(component) DO UPDATE SET last_invoked_at=excluded.last_invoked_at,last_succeeded_at=coalesce(excluded.last_succeeded_at,ride_ops_heartbeat.last_succeeded_at),outcome=excluded.outcome,correlation_id=excluded.correlation_id;
 RETURN jsonb_build_object('recorded',true);
END $$;
REVOKE ALL ON FUNCTION public.record_ride_watchdog_heartbeat(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_ride_watchdog_heartbeat(text,uuid) TO service_role;

-- Guarded replacement of the approved monitor body; refuse unexpected source drift.
DO $patch$
DECLARE definition text:=pg_get_functiondef('public.monitor_ride_operations_v3()'::regprocedure);
 anchor text:='health:=public.ride_settlement_health_v3()||jsonb_build_object(';
 conditions text:='''workerDiagnostics'',''workerMissing'',''workerFailed'') LOOP';
BEGIN
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 OR (length(definition)-length(replace(definition,conditions,'')))/length(conditions)<>1
 THEN RAISE EXCEPTION 'approved_monitor_definition_mismatch';END IF;
 definition:=replace(definition,anchor,anchor||$health$
 'watchdogMissing',CASE WHEN c.watchdog_expected AND greatest(coalesce((SELECT last_invoked_at FROM public.ride_ops_heartbeat WHERE component='watchdog'),c.watchdog_armed_at),c.watchdog_armed_at)<clock_timestamp()-interval '3 minutes' THEN 1 ELSE 0 END,
 'watchdogFailed',CASE WHEN c.watchdog_expected AND EXISTS(SELECT 1 FROM public.ride_ops_heartbeat WHERE component='watchdog' AND outcome='failed' AND last_invoked_at>=c.watchdog_armed_at) THEN 1 ELSE 0 END,
 $health$);
 definition:=replace(definition,conditions,'''workerDiagnostics'',''workerMissing'',''workerFailed'',''watchdogMissing'',''watchdogFailed'') LOOP');
 EXECUTE definition;
END $patch$;
COMMIT;
