CREATE OR REPLACE FUNCTION public.route_path_valid(metadata jsonb, slat numeric, slng numeric, elat numeric, elng numeric, km numeric, minutes integer)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE p jsonb;g public.geometry;
BEGIN
 IF metadata IS NULL OR NOT(metadata ? 'route_path_v1') THEN RETURN true; END IF;
 p:=metadata->'route_path_v1';g:=public.ST_SetSRID(public.ST_GeomFromGeoJSON(p->'geometry'),4326);
 RETURN coalesce(p->'schemaVersion'='1'::jsonb AND jsonb_typeof(p->'startName')='string' AND length(p->>'startName')>0 AND jsonb_typeof(p->'finishName')='string' AND length(p->>'finishName')>0
 AND p->'geometry'->>'type'='LineString' AND public.ST_NDims(g)=2 AND public.ST_IsValid(g) AND public.ST_IsSimple(g) AND public.ST_NPoints(g) BETWEEN 2 AND 10000
 AND public.ST_XMin(g)>=-180 AND public.ST_XMax(g)<=180 AND public.ST_YMin(g)>=-90 AND public.ST_YMax(g)<=90
 AND public.ST_Equals(public.ST_StartPoint(g),public.ST_SetSRID(public.ST_MakePoint(slng::float8,slat::float8),4326)) AND public.ST_Equals(public.ST_EndPoint(g),public.ST_SetSRID(public.ST_MakePoint(elng::float8,elat::float8),4326))
 AND abs(public.ST_Length(g::public.geography)-(p->>'distanceMetres')::float8)<0.1 AND km=round(((p->>'distanceMetres')::numeric/1000),2) AND km>0 AND minutes>0 AND minutes=(p->>'estimatedDurationMinutes')::integer,false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $function$;

CREATE OR REPLACE FUNCTION public.save_organisation_with_partner(p_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_org public.organisation; v_partner public.reward_partner; v_name text; v_status text;
BEGIN
 IF p_id IS NULL THEN
  INSERT INTO organisation(name,type,status) VALUES(p_input->>'name',p_input->>'type',COALESCE(p_input->>'status','active')) RETURNING * INTO v_org;
 ELSE
  SELECT * INTO v_org FROM organisation WHERE id=p_id FOR UPDATE;
  IF v_org.id IS NULL THEN RETURN NULL; END IF;
 END IF;
 IF v_org.type <> 'reward_partner' AND (p_input->'partnerProfile' ? 'businessCategory') THEN
  RAISE EXCEPTION 'Business category requires a reward partner' USING ERRCODE='23514';
 END IF;
 v_name := COALESCE(NULLIF(btrim(p_input->>'name'),''),v_org.name);
 v_status := COALESCE(p_input->>'status',v_org.status);
 IF v_org.type='reward_partner' THEN
  SELECT * INTO v_partner FROM reward_partner WHERE organisation_id=v_org.id FOR UPDATE;
  IF v_partner.id IS NULL THEN
   -- An ambiguous name must not silently select a different identity.
   IF (SELECT count(*) FROM reward_partner WHERE lower(name)=lower(v_name)) > 1 THEN
    RAISE EXCEPTION 'Ambiguous partner identity' USING ERRCODE='23514';
   END IF;
   SELECT * INTO v_partner FROM reward_partner WHERE lower(name)=lower(v_name) FOR UPDATE;
   IF v_partner.id IS NOT NULL AND v_partner.organisation_id IS DISTINCT FROM v_org.id AND
      EXISTS(SELECT 1 FROM reward_partner_location WHERE partner_id=v_partner.id) THEN
    RAISE EXCEPTION 'Partner with locations cannot be relinked' USING ERRCODE='23514';
   END IF;
  END IF;
  IF v_partner.id IS NULL THEN
   INSERT INTO reward_partner(name,status,organisation_id) VALUES(v_name,CASE WHEN v_status='active' THEN 'active' ELSE 'inactive' END,v_org.id) RETURNING * INTO v_partner;
  ELSE
   UPDATE reward_partner SET organisation_id=v_org.id,name=v_name,
    status=CASE WHEN v_status='active' THEN 'active' ELSE 'inactive' END,updated_at=clock_timestamp()
   WHERE id=v_partner.id RETURNING * INTO v_partner;
  END IF;
  UPDATE reward_partner SET
   contact_email=CASE WHEN p_input->'partnerProfile' ? 'contactEmail' THEN p_input->'partnerProfile'->>'contactEmail' ELSE contact_email END,
   website=CASE WHEN p_input->'partnerProfile' ? 'website' THEN p_input->'partnerProfile'->>'website' ELSE website END,
   business_category=CASE WHEN p_input->'partnerProfile' ? 'businessCategory' THEN p_input->'partnerProfile'->>'businessCategory' ELSE business_category END,
   logo_url=CASE WHEN p_input->'partnerProfile' ? 'logoUrl' THEN p_input->'partnerProfile'->>'logoUrl' ELSE logo_url END
  WHERE id=v_partner.id RETURNING * INTO v_partner;
 END IF;
 UPDATE organisation SET name=v_name,status=v_status,updated_at=clock_timestamp() WHERE id=v_org.id RETURNING * INTO v_org;
 RETURN jsonb_build_object('organisation',to_jsonb(v_org),'partner',CASE WHEN v_partner.id IS NOT NULL THEN to_jsonb(v_partner) END);
END $function$
