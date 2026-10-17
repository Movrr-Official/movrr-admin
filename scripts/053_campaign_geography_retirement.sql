-- Additive capability only. DOES NOT retire any zone. Apply only with separate DB approval.
-- Prerequisite: deployed campaign_zone/GeoJSON, route_stop and ride_session contracts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.route_stop'::regclass
      AND tgname='trg_validate_route_stop_in_campaign_zone' AND tgenabled IN ('O','A')
      AND tgfoid='public.validate_route_stop_in_campaign_zone()'::regprocedure) THEN
    RAISE EXCEPTION 'Existing route-stop validation trigger is required before retirement support';
  END IF;
END $$;

ALTER TABLE public.campaign_zone
  ADD COLUMN retired_at timestamptz,
  ADD COLUMN retirement_reason text,
  ADD COLUMN retirement_operation_id uuid,
  ADD CONSTRAINT campaign_zone_retirement_complete CHECK (
    (retired_at IS NULL AND retirement_reason IS NULL AND retirement_operation_id IS NULL)
    OR (retired_at IS NOT NULL AND retirement_reason IS NOT NULL AND length(btrim(retirement_reason)) > 0 AND retirement_operation_id IS NOT NULL)
  );
CREATE INDEX campaign_zone_current_campaign_idx ON public.campaign_zone(campaign_id) WHERE retired_at IS NULL;

-- Same columns, owner, grants and existing RLS boundaries; old clients also receive current areas only.
CREATE OR REPLACE VIEW public.campaign_zone_geojson AS
SELECT id,campaign_id,name,public.ST_AsGeoJSON(geom)::jsonb AS geojson,created_at
FROM public.campaign_zone WHERE retired_at IS NULL;

-- Historical projection is server-only; Admin actions still require campaigns.read.
CREATE VIEW public.campaign_zone_history_geojson WITH (security_invoker=true) AS
SELECT id,campaign_id,name,public.ST_AsGeoJSON(geom)::jsonb AS geojson,created_at,
  retired_at,retirement_reason,retirement_operation_id FROM public.campaign_zone;
REVOKE ALL ON public.campaign_zone_history_geojson FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.campaign_zone_history_geojson TO service_role;

-- One MVCC snapshot contains both geometry and retirement state: never combine a new summary
-- with cached geometry from a different request. Invoker rights preserve base-table RLS.
CREATE FUNCTION public.get_campaign_geography(p_campaign_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'schemaVersion',1,
    'state',CASE WHEN count(*) FILTER(WHERE z.retired_at IS NULL)>0 THEN 'available'
                 WHEN count(*) FILTER(WHERE z.retired_at IS NOT NULL)>0 THEN 'retired' ELSE 'empty' END,
    'retiredCount',count(*) FILTER(WHERE z.retired_at IS NOT NULL),
    'revision',md5(coalesce(jsonb_agg(jsonb_build_array(z.id,z.name,public.ST_AsEWKB(z.geom),z.retired_at,z.retirement_operation_id) ORDER BY z.id)::text,'[]')),
    'checkedAt',statement_timestamp(),
    'zones',coalesce(jsonb_agg(jsonb_build_object('id',z.id,'name',z.name,'geojson',public.ST_AsGeoJSON(z.geom)::jsonb) ORDER BY z.id)
       FILTER(WHERE z.retired_at IS NULL),'[]'::jsonb))
  FROM public.campaign_zone z WHERE z.campaign_id=p_campaign_id;
$$;
REVOKE ALL ON FUNCTION public.get_campaign_geography(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campaign_geography(uuid) TO anon,authenticated,service_role;

-- Historical membership and every existing award/settlement function remain unchanged.
-- Only new route-stop validation uses current geography.
CREATE OR REPLACE FUNCTION public.validate_route_stop_in_campaign_zone()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cid uuid; lifecycle text;
BEGIN
  SELECT r.campaign_id INTO cid FROM public.route r WHERE r.id=NEW.route_id;
  IF cid IS NULL THEN RAISE EXCEPTION 'Route must be attached to a campaign before adding stops'; END IF;
  SELECT c.lifecycle_status::text INTO lifecycle FROM public.campaign c WHERE c.id=cid FOR SHARE;
  IF lifecycle IN ('completed','cancelled') THEN RAISE EXCEPTION 'Historical campaign cannot validate new route stops'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.campaign_zone z WHERE z.campaign_id=cid AND z.retired_at IS NULL
    AND public.ST_Contains(z.geom,public.ST_SetSRID(public.ST_MakePoint(NEW.lng,NEW.lat),4326))) THEN
    RAISE EXCEPTION 'Stop must be inside a current campaign area';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_campaign_geography_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.lifecycle_status::text='completed' AND NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    RAISE EXCEPTION 'Completed campaigns are historical and cannot be reactivated';
  END IF;
  IF NEW.lifecycle_status::text IN ('active','confirmed') AND NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    IF EXISTS(SELECT 1 FROM public.campaign_zone WHERE campaign_id=NEW.id AND retired_at IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM public.campaign_zone WHERE campaign_id=NEW.id AND retired_at IS NULL) THEN
      RAISE EXCEPTION 'Campaign geography is retired; approved current geography is required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_campaign_geography_activation() FROM PUBLIC;
CREATE TRIGGER guard_campaign_geography_activation BEFORE UPDATE OF lifecycle_status ON public.campaign
FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_geography_activation();

-- Validate new starts only: resuming/completing an existing ride must retain its frozen evidence.
CREATE FUNCTION public.guard_new_campaign_ride_geography()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid; route_cid uuid; assignment_cid uuid; c record;
BEGIN
  IF NEW.status::text NOT IN ('active','paused') THEN RETURN NEW; END IF;
  SELECT campaign_id INTO route_cid FROM public.route WHERE id=NEW.route_id;
  SELECT campaign_id INTO assignment_cid FROM public.rider_route WHERE id=NEW.rider_route_id;
  cid:=coalesce(NEW.campaign_id,route_cid,assignment_cid);
  IF cid IS NULL THEN RETURN NEW; END IF;
  IF (route_cid IS NOT NULL AND route_cid<>cid) OR (assignment_cid IS NOT NULL AND assignment_cid<>cid) THEN
    RAISE EXCEPTION 'Campaign ride identity does not match its route or assignment';
  END IF;
  SELECT * INTO c FROM public.campaign WHERE id=cid FOR SHARE;
  IF NOT FOUND OR c.lifecycle_status::text IS DISTINCT FROM 'active' OR c.start_date>current_date OR c.end_date<current_date THEN
    RAISE EXCEPTION 'Campaign is not available for a new ride';
  END IF;
  IF EXISTS(SELECT 1 FROM public.campaign_zone WHERE campaign_id=cid AND retired_at IS NOT NULL)
     AND NOT EXISTS(SELECT 1 FROM public.campaign_zone WHERE campaign_id=cid AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'Campaign geography is retired';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_new_campaign_ride_geography() FROM PUBLIC;
CREATE TRIGGER guard_new_campaign_ride_geography BEFORE INSERT ON public.ride_session
FOR EACH ROW EXECUTE FUNCTION public.guard_new_campaign_ride_geography();

-- Retired rows cannot be renamed, moved, deleted or have their original geometry rewritten.
-- Retirement itself is an audited operator action, not a rider-facing mutation endpoint.
CREATE FUNCTION public.guard_campaign_zone_retirement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; op uuid; cid uuid; lifecycle text; previous jsonb; resulting jsonb;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.retired_at IS NOT NULL THEN RAISE EXCEPTION 'Retired campaign geography is historical evidence and cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.retired_at IS NOT NULL THEN RAISE EXCEPTION 'Create current geography first; retirement requires the guarded operation'; END IF;
    IF EXISTS(SELECT 1 FROM public.campaign_zone WHERE campaign_id=NEW.campaign_id AND retired_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Retired campaign geography cannot be replaced implicitly; use a separately approved campaign';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.retired_at IS NOT NULL OR NEW.retired_at IS NOT NULL) AND (
      ROW(NEW.id,NEW.campaign_id,NEW.name,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.campaign_id,OLD.name,OLD.created_at)
      OR public.ST_AsEWKB(NEW.geom) IS DISTINCT FROM public.ST_AsEWKB(OLD.geom)) THEN
    RAISE EXCEPTION 'Retirement must preserve the original zone identity, name, timestamp and geometry';
  END IF;
  IF ROW(NEW.retired_at,NEW.retirement_reason,NEW.retirement_operation_id)
      IS DISTINCT FROM ROW(OLD.retired_at,OLD.retirement_reason,OLD.retirement_operation_id) THEN
    cid:=OLD.campaign_id;
    SELECT lifecycle_status::text INTO lifecycle FROM public.campaign WHERE id=cid FOR UPDATE;
    IF lifecycle IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'Only completed campaign geography can be retired or restored'; END IF;
    IF EXISTS(SELECT 1 FROM public.ride_session WHERE campaign_id=cid AND status::text IN ('active','paused'))
      OR EXISTS(SELECT 1 FROM public.route_tracking WHERE campaign_id=cid AND end_time IS NULL) THEN
      RAISE EXCEPTION 'Campaign has ongoing ride evidence; retirement requires a new review';
    END IF;
    actor:=nullif(current_setting('movrr.geography_actor_id',true),'')::uuid;
    IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN
      RAISE EXCEPTION 'An approved operator identity is required for the retirement audit';
    END IF;
    op:=coalesce(NEW.retirement_operation_id,OLD.retirement_operation_id);
    previous:=jsonb_build_object('retiredAt',OLD.retired_at,'reason',OLD.retirement_reason,'operationId',OLD.retirement_operation_id);
    resulting:=jsonb_build_object('retiredAt',NEW.retired_at,'reason',NEW.retirement_reason,'operationId',NEW.retirement_operation_id,
      'geometryMd5',md5(public.ST_AsEWKB(NEW.geom)));
    INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,
      previous_state,resulting_state,correlation_id,reason)
    VALUES(actor,'admin','campaigns.write','campaign_zone',NEW.id::text,previous,resulting,op::text,
      coalesce(NEW.retirement_reason,'Explicitly approved geography retirement rollback'));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_campaign_zone_retirement() FROM PUBLIC;
CREATE TRIGGER guard_campaign_zone_retirement BEFORE INSERT OR UPDATE OR DELETE ON public.campaign_zone
FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_zone_retirement();

COMMENT ON COLUMN public.campaign_zone.retired_at IS 'Soft retirement: current-area APIs exclude this record; original geographic evidence is retained.';
NOTIFY pgrst,'reload schema';
COMMIT;
