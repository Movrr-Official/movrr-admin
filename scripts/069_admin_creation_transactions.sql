-- Candidate only: explicit approval required before production application.
BEGIN;
CREATE TABLE public.admin_creation_operation (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  kind text NOT NULL,
  input jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_creation_operation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_creation_operation FROM PUBLIC,anon,authenticated;

-- Private insertion primitive. Table selection belongs to the fixed command
-- dispatcher below. Quoted keys preserve column types/defaults via PostgreSQL's
-- own record input contract, including PostGIS geometry.
CREATE FUNCTION public.admin_insert_creation_record(p_table text,p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE columns_sql text; result jsonb; geo public.geometry;
BEGIN
  IF p_table NOT IN ('route','route_stop','campaign','campaign_zone','campaign_hot_zone','workboard_boards','workboard_cards','community_ride','pro_tips','suggested_routes') THEN
    RAISE EXCEPTION 'Unsupported creation table';
  END IF;
  IF p_table IN ('campaign_zone','campaign_hot_zone') THEN
    geo:=public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_record->'geom'),4326);
    IF geo IS NULL OR public.GeometryType(geo) NOT IN ('POLYGON','MULTIPOLYGON') OR NOT public.ST_IsValid(geo)
      OR public.ST_NDims(geo)<>2 OR public.ST_XMin(geo)<-180 OR public.ST_XMax(geo)>180
      OR public.ST_YMin(geo)<-90 OR public.ST_YMax(geo)>90 THEN RAISE EXCEPTION 'Invalid campaign zone geometry'; END IF;
    p_record:=jsonb_set(p_record,'{geom}',to_jsonb(public.ST_AsEWKT(public.ST_Multi(geo))));
  END IF;
  SELECT string_agg(format('%I',key),',' ORDER BY key) INTO columns_sql FROM jsonb_object_keys(p_record) AS key;
  EXECUTE format('WITH inserted AS (INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) RETURNING *) SELECT to_jsonb(inserted) FROM inserted',p_table,columns_sql,columns_sql,p_table)
    INTO result USING p_record;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_insert_creation_record(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_update_creation_record(p_table text,p_id uuid,p_parent uuid,p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE assignments text; parent_column text; result jsonb; geo public.geometry;
BEGIN
  IF p_table NOT IN ('route_stop','campaign_zone','campaign_hot_zone') THEN RAISE EXCEPTION 'Unsupported child table'; END IF;
  parent_column:=CASE WHEN p_table='route_stop' THEN 'route_id' ELSE 'campaign_id' END;
  IF p_record ?| ARRAY['id','route_id','campaign_id','retired_at','retirement_operation_id','retirement_reason'] THEN RAISE EXCEPTION 'Cannot reparent or retire a child through creation'; END IF;
  IF p_table IN ('campaign_zone','campaign_hot_zone') THEN
    geo:=public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_record->'geom'),4326);
    IF geo IS NULL OR public.GeometryType(geo) NOT IN ('POLYGON','MULTIPOLYGON') OR NOT public.ST_IsValid(geo)
      OR public.ST_NDims(geo)<>2 OR public.ST_XMin(geo)<-180 OR public.ST_XMax(geo)>180
      OR public.ST_YMin(geo)<-90 OR public.ST_YMax(geo)>90 THEN RAISE EXCEPTION 'Invalid campaign zone geometry'; END IF;
    p_record:=jsonb_set(p_record,'{geom}',to_jsonb(public.ST_AsEWKT(public.ST_Multi(geo))));
  END IF;
  SELECT string_agg(format('%1$I=patch.%1$I',key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(p_record) AS key;
  EXECUTE format('WITH changed AS (UPDATE public.%1$I target SET %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1) patch WHERE target.id=$2 AND target.%3$I=$3 %4$s RETURNING target.*) SELECT to_jsonb(changed) FROM changed',
    p_table,assignments,parent_column,CASE WHEN p_table='campaign_zone' THEN 'AND target.retired_at IS NULL' ELSE '' END)
    INTO result USING p_record,p_id,p_parent;
  IF result IS NULL THEN RAISE EXCEPTION 'Child not found in requested parent or already retired'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_creation_record(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_catalog_partner(p_name text,p_website text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE partner uuid; org_result jsonb;
BEGIN
  IF nullif(btrim(p_name),'') IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(p_name),69002));
  IF (SELECT count(*) FROM public.reward_partner WHERE lower(name)=lower(p_name))>1 THEN RAISE EXCEPTION 'Ambiguous partner identity'; END IF;
  SELECT id INTO partner FROM public.reward_partner WHERE lower(name)=lower(p_name);
  IF partner IS NULL OR EXISTS(SELECT 1 FROM public.reward_partner WHERE id=partner AND organisation_id IS NULL) THEN
    org_result:=public.save_organisation_with_partner(NULL,jsonb_build_object('name',p_name,'type','reward_partner',
      'partnerProfile',jsonb_build_object('website',p_website)));
    partner:=(org_result->'partner'->>'id')::uuid;
  ELSIF p_website IS NOT NULL THEN UPDATE public.reward_partner SET website=p_website,updated_at=now() WHERE id=partner; END IF;
  RETURN partner;
END $$;
REVOKE ALL ON FUNCTION public.admin_catalog_partner(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_save_catalog(p_actor uuid,p_id uuid,p_payload jsonb,p_partner_name text,p_partner_website text,p_expected timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id WHERE a.user_id=p_actor AND u.status='active';
  IF NOT coalesce(caps ? 'rewards.manage',false) THEN RAISE EXCEPTION 'Unauthorized catalog write' USING ERRCODE='42501'; END IF;
  p_payload:=p_payload || jsonb_build_object('partner_id',public.admin_catalog_partner(p_partner_name,p_partner_website));
  RETURN public.shop_save_catalog(p_actor,p_id,p_payload,p_expected);
END $$;
REVOKE ALL ON FUNCTION public.admin_save_catalog(uuid,uuid,jsonb,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_catalog(uuid,uuid,jsonb,text,text,timestamptz) TO service_role;

CREATE FUNCTION public.admin_create(p_actor uuid,p_operation uuid,p_kind text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; required text; saved public.admin_creation_operation; result jsonb; child_id uuid; children jsonb; hot_children jsonb; child_result jsonb;
  record jsonb:=p_input->'record'; child jsonb; entity_table text; team uuid; member_role text; actor_role text;
  route_ids uuid[]; assigned integer; partner uuid; organisation_result jsonb;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  required:=CASE p_kind WHEN 'route' THEN 'routes.write' WHEN 'route_stops' THEN 'routes.write' WHEN 'suggested_route' THEN 'routes.write' WHEN 'campaign_geography' THEN 'campaigns.write' WHEN 'campaign' THEN 'campaigns.write'
    WHEN 'workboard_bootstrap' THEN 'workboard.access' WHEN 'workboard_board' THEN 'workboard.access' WHEN 'workboard_card' THEN 'workboard.access'
    WHEN 'organisation' THEN 'rewards.manage' WHEN 'catalog' THEN 'rewards.manage' WHEN 'partner_location' THEN 'rewards.manage'
    WHEN 'community_ride' THEN 'community.manage' WHEN 'pro_tip' THEN 'protips.manage' END;
  IF required IS NULL OR p_operation IS NULL THEN RAISE EXCEPTION 'Invalid creation command'; END IF;
  SELECT a.role,public.ops_employee_capabilities(a.role) INTO actor_role,caps FROM public.admin_users a
    JOIN public."user" u ON u.id=a.user_id WHERE a.user_id=p_actor AND u.status='active';
  -- The advertiser Platform API owns its campaign boundary. No client-selected
  -- advertiser ID can cross an organisation membership boundary.
  IF p_kind='campaign' AND actor_role IS NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id
      JOIN public.advertiser a ON a.organisation_id=o.id JOIN public."user" u ON u.id=m.user_id
      WHERE m.user_id=p_actor AND m.status='active' AND o.type='advertiser' AND o.status='active' AND u.status='active'
      AND a.id=(record->>'advertiser_id')::uuid) THEN
      RAISE EXCEPTION 'Advertiser ownership required' USING ERRCODE='42501';
    END IF;
  ELSIF NOT coalesce(caps ? required,false) THEN RAISE EXCEPTION 'Unauthorized creation command' USING ERRCODE='42501'; END IF;
  -- Generated timestamps are not part of a retried command's intent.
  IF record IS NOT NULL THEN
    record:=record-'created_at'-'updated_at';
    p_input:=jsonb_set(p_input,'{record}',record);
  END IF;
  IF p_kind IN ('workboard_board','workboard_card') AND NOT EXISTS(
    SELECT 1 FROM public.workboard_team_members WHERE team_id=(record->>'team_id')::uuid
      AND user_id=p_actor AND status='active' AND role IN ('owner','admin','editor')) THEN
    RAISE EXCEPTION 'Workboard write membership required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,69));
  SELECT * INTO saved FROM public.admin_creation_operation WHERE id=p_operation;
  IF saved.id IS NOT NULL THEN
    IF saved.actor_id<>p_actor OR saved.kind<>p_kind OR saved.input<>p_input THEN RAISE EXCEPTION 'Conflicting creation retry'; END IF;
    IF p_kind='workboard_bootstrap' THEN
      SELECT jsonb_build_object('teamId',t.id,'teamName',t.name,'role',m.role::text) INTO result
        FROM public.workboard_team_members m JOIN public.workboard_teams t ON t.id=m.team_id
        WHERE m.user_id=p_actor AND m.status='active' AND t.id=(saved.result->>'teamId')::uuid;
      IF result IS NULL THEN RAISE EXCEPTION 'Workboard membership is no longer active' USING ERRCODE='42501'; END IF;
      RETURN result;
    END IF;
    RETURN saved.result;
  END IF;
  IF p_kind='route_stops' THEN
    children:='[]';
    PERFORM 1 FROM public.route WHERE id=(p_input->>'routeId')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Route not found'; END IF;
    FOR child IN SELECT value FROM jsonb_array_elements(p_input->'stops') LOOP
      child_id:=(child->>'id')::uuid; child:=child-'id';
      IF child_id IS NULL THEN child_result:=public.admin_insert_creation_record('route_stop',child || jsonb_build_object('route_id',p_input->>'routeId'));
      ELSE child_result:=public.admin_update_creation_record('route_stop',child_id,(p_input->>'routeId')::uuid,child); END IF;
      children:=children || jsonb_build_array(child_result->>'id');
    END LOOP;
    result:=jsonb_build_object('ids',children);
  ELSIF p_kind='campaign_geography' THEN
    children:='[]';hot_children:='[]';
    PERFORM 1 FROM public.campaign WHERE id=(p_input->>'campaignId')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
    FOR child IN SELECT value FROM jsonb_array_elements(p_input->'zones') LOOP
      child_id:=(child->>'id')::uuid; child:=child-'id';
      IF child_id IS NULL THEN child_result:=public.admin_insert_creation_record('campaign_zone',child || jsonb_build_object('campaign_id',p_input->>'campaignId'));
      ELSE child_result:=public.admin_update_creation_record('campaign_zone',child_id,(p_input->>'campaignId')::uuid,child); END IF;
      children:=children || jsonb_build_array(child_result->>'id');
    END LOOP;
    FOR child IN SELECT value FROM jsonb_array_elements(p_input->'hotZones') LOOP
      child_id:=(child->>'id')::uuid; child:=child-'id';
      IF child_id IS NULL THEN child_result:=public.admin_insert_creation_record('campaign_hot_zone',child || jsonb_build_object('campaign_id',p_input->>'campaignId'));
      ELSE child_result:=public.admin_update_creation_record('campaign_hot_zone',child_id,(p_input->>'campaignId')::uuid,child); END IF;
      hot_children:=hot_children || jsonb_build_array(child_result->>'id');
    END LOOP;
    result:=jsonb_build_object('zoneIds',children,'hotZoneIds',hot_children);
  ELSIF p_kind LIKE 'workboard_%' THEN
    IF p_kind='workboard_bootstrap' THEN
      PERFORM pg_advisory_xact_lock(69001);
      SELECT m.team_id,m.role INTO team,member_role FROM public.workboard_team_members m WHERE m.user_id=p_actor AND m.status='active' LIMIT 1;
      IF team IS NULL THEN
        IF EXISTS(SELECT 1 FROM public.workboard_teams) OR actor_role NOT IN ('super_admin','admin') THEN
          RAISE EXCEPTION 'Not authorized to bootstrap a workboard team' USING ERRCODE='42501';
        END IF;
        INSERT INTO public.workboard_teams(name,created_by) VALUES('MOVRR HQ',p_actor) RETURNING id INTO team;
        INSERT INTO public.workboard_team_members(team_id,user_id,role,status) VALUES(team,p_actor,'owner','active');
        member_role:='owner';
      END IF;
      SELECT jsonb_build_object('teamId',id,'teamName',name,'role',member_role) INTO result FROM public.workboard_teams WHERE id=team;
    ELSE
      team:=(record->>'team_id')::uuid;
      IF NOT EXISTS(SELECT 1 FROM public.workboard_team_members WHERE team_id=team AND user_id=p_actor AND status='active' AND role IN ('owner','admin','editor')) THEN
        RAISE EXCEPTION 'Workboard write membership required' USING ERRCODE='42501';
      END IF;
      IF p_kind='workboard_card' AND NOT EXISTS(SELECT 1 FROM public.workboard_boards WHERE id=(record->>'board_id')::uuid AND team_id=team) THEN
        RAISE EXCEPTION 'Board does not belong to requested team';
      END IF;
      record:=record || jsonb_build_object('id',p_operation,'created_by',p_actor,'updated_by',p_actor);
      result:=public.admin_insert_creation_record(CASE WHEN p_kind='workboard_card' THEN 'workboard_cards' ELSE 'workboard_boards' END,record);
    END IF;
  ELSIF p_kind='organisation' THEN
    IF p_input->>'type'='reward_partner' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(lower(p_input->>'name'),69002));
      IF EXISTS(SELECT 1 FROM public.reward_partner WHERE lower(name)=lower(p_input->>'name') AND organisation_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Partner already belongs to an organisation; use the existing organisation';
      END IF;
    END IF;
    result:=public.save_organisation_with_partner(NULL,p_input);
  ELSIF p_kind='partner_location' THEN
    result:=public.save_partner_location((p_input->>'organisationId')::uuid,p_input->'location',p_actor,p_operation::text);
  ELSIF p_kind='catalog' THEN
    IF record->>'status'='active' THEN RAISE EXCEPTION 'Create a draft before approval'; END IF;
    record:=record || jsonb_build_object('partner_id',public.admin_catalog_partner(p_input->>'partnerName',p_input->>'partnerWebsite'));
    result:=public.shop_save_catalog(p_actor,NULL,record,NULL);
    INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
      VALUES(p_actor,'admin','rewards.manage','reward_catalog',result->>'id','{"action":"reward_catalog.create"}',p_operation::text,'entity_initiator');
  ELSE
    entity_table:=CASE p_kind WHEN 'route' THEN 'route' WHEN 'campaign' THEN 'campaign' WHEN 'community_ride' THEN 'community_ride' WHEN 'suggested_route' THEN 'suggested_routes' ELSE 'pro_tips' END;
    record:=record || jsonb_build_object('id',p_operation);
    IF p_kind='campaign' THEN record:=record || '{"lifecycle_status":"draft"}'; END IF;
    IF p_kind='community_ride' THEN record:=record || jsonb_build_object('created_by_user_id',p_actor); END IF;
    IF p_kind='suggested_route' THEN record:=record || jsonb_build_object('created_by',p_actor); END IF;
    result:=public.admin_insert_creation_record(entity_table,record);
    IF p_kind='campaign' THEN
      SELECT coalesce(array_agg(value::uuid),'{}') INTO route_ids FROM jsonb_array_elements_text(coalesce(p_input->'routeIds','[]'));
      IF cardinality(route_ids)>0 THEN
        PERFORM 1 FROM public.route WHERE id=ANY(route_ids) FOR UPDATE;
        IF (SELECT count(*) FROM public.route WHERE id=ANY(route_ids) AND campaign_id IS NULL)<>cardinality(route_ids) THEN
          RAISE EXCEPTION 'Every route must exist and be unassigned';
        END IF;
        IF actor_role IS NULL THEN RAISE EXCEPTION 'Route assignment requires Admin authorization' USING ERRCODE='42501'; END IF;
        UPDATE public.route SET campaign_id=p_operation WHERE id=ANY(route_ids);
      END IF;
      IF actor_role IS NOT NULL THEN
        INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason) VALUES(p_actor,'admin','campaigns.write','campaign',p_operation::text,'{"action":"campaign.create"}',p_operation::text,'entity_initiator');
      END IF;
    ELSIF p_kind='route' THEN
      FOR child IN SELECT value FROM jsonb_array_elements(coalesce(p_input->'stops','[]')) LOOP
        PERFORM public.admin_insert_creation_record('route_stop',child || jsonb_build_object('route_id',p_operation));
      END LOOP;
      IF jsonb_array_length(coalesce(p_input->'zones','[]'))+jsonb_array_length(coalesce(p_input->'hotZones','[]'))>0 THEN
        IF NOT coalesce(caps ? 'campaigns.write',false) OR record->>'campaign_id' IS NULL THEN
          RAISE EXCEPTION 'Campaign authorization and identity required for zones' USING ERRCODE='42501';
        END IF;
        FOR child IN SELECT value FROM jsonb_array_elements(coalesce(p_input->'zones','[]')) LOOP
          PERFORM public.admin_insert_creation_record('campaign_zone',child || jsonb_build_object('campaign_id',record->>'campaign_id'));
        END LOOP;
        FOR child IN SELECT value FROM jsonb_array_elements(coalesce(p_input->'hotZones','[]')) LOOP
          PERFORM public.admin_insert_creation_record('campaign_hot_zone',child || jsonb_build_object('campaign_id',record->>'campaign_id'));
        END LOOP;
      END IF;
      INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason) VALUES(p_actor,'admin','routes.write','route',p_operation::text,'{"action":"route.create"}',p_operation::text,'entity_initiator');
    END IF;
  END IF;
  INSERT INTO public.admin_creation_operation(id,actor_id,kind,input,result) VALUES(p_operation,p_actor,p_kind,p_input,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_create(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create(uuid,uuid,text,jsonb) TO service_role;

CREATE FUNCTION public.assign_admin_route(p_actor uuid,p_route uuid,p_riders uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; template public.route; v_rider_id uuid; assignment_id uuid; inserted_riders uuid[]:='{}'; requested integer;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id WHERE a.user_id=p_actor AND u.status='active';
  IF NOT coalesce(caps ? 'routes.write',false) THEN RAISE EXCEPTION 'Unauthorized route assignment' USING ERRCODE='42501'; END IF;
  SELECT * INTO template FROM public.route WHERE id=p_route FOR UPDATE;
  IF template.id IS NULL THEN RAISE EXCEPTION 'Route not found'; END IF;
  SELECT count(DISTINCT x) INTO requested FROM unnest(p_riders) x;
  IF requested=0 THEN RAISE EXCEPTION 'Riders required'; END IF;
  FOR v_rider_id IN SELECT DISTINCT x FROM unnest(p_riders) x ORDER BY x LOOP
    IF NOT EXISTS(SELECT 1 FROM public.rider WHERE id=v_rider_id) THEN RAISE EXCEPTION 'Rider not found'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.rider_route rr WHERE rr.route_id=p_route AND rr.rider_id=v_rider_id) THEN
      INSERT INTO public.rider_route(rider_id,route_id,campaign_id,status,assigned_at,updated_at)
        VALUES(v_rider_id,p_route,template.campaign_id,'assigned',now(),now()) RETURNING id INTO assignment_id;
      INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
        VALUES(p_actor,'admin','routes.write','rider_route',assignment_id::text,'{"action":"rider_route.create"}',assignment_id::text,'entity_initiator');
      inserted_riders:=array_append(inserted_riders,v_rider_id);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('assignedCount',cardinality(inserted_riders),'skippedCount',requested-cardinality(inserted_riders),'riderIds',to_jsonb(inserted_riders));
END $$;
REVOKE ALL ON FUNCTION public.assign_admin_route(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_admin_route(uuid,uuid,uuid[]) TO service_role;
-- The RETURNS TABLE team_id variable made the old ON CONFLICT column target
-- ambiguous; its exception handler hid that error as transaction_failed.
-- Use the existing unique constraint and revalidate employee eligibility.
CREATE OR REPLACE FUNCTION public.accept_workboard_platform_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
RETURNS TABLE(
  success boolean,
  error_code text,
  error_message text,
  invitation_id uuid,
  team_id uuid,
  membership_id uuid,
  membership_role text,
  result_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row public.platform_invitations%ROWTYPE;
  member_id uuid;
  member_role text;
  normalized_email text := lower(trim(COALESCE(p_email, '')));
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RETURN QUERY SELECT false, 'invalid_token', 'Invitation token is required',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', 'Authenticated user is required',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF normalized_email = '' THEN
    RETURN QUERY SELECT false, 'email_missing', 'User email not found',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
      JOIN auth.users au ON au.id=a.user_id
    WHERE a.user_id=p_user_id AND u.status='active' AND lower(au.email)=normalized_email
      AND public.ops_employee_capabilities(a.role) ? 'workboard.access'
  ) THEN
    RETURN QUERY SELECT false, 'ineligible_role', 'An active eligible employee account is required',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  PERFORM public.expire_platform_invitations();

  SELECT *
  INTO invite_row
  FROM public.platform_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF invite_row.id IS NULL THEN
    RETURN QUERY SELECT false, 'not_found', 'Invite not found',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF invite_row.scope <> 'workboard_team' THEN
    RETURN QUERY SELECT false, 'wrong_scope', 'Invitation is not a Workboard invite',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, invite_row.status::text;
    RETURN;
  END IF;

  IF invite_row.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked', 'This invitation has been revoked',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'revoked';
    RETURN;
  END IF;

  IF invite_row.status = 'rejected' THEN
    RETURN QUERY SELECT false, 'rejected', 'This invitation was rejected',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'rejected';
    RETURN;
  END IF;

  IF invite_row.status = 'expired'
     OR (invite_row.expires_at IS NOT NULL AND invite_row.expires_at < now()) THEN
    IF invite_row.status = 'pending' THEN
      UPDATE public.platform_invitations
      SET status = 'expired', updated_at = now()
      WHERE id = invite_row.id;
    END IF;
    RETURN QUERY SELECT false, 'expired', 'Invite expired',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'expired';
    RETURN;
  END IF;

  IF invite_row.email <> normalized_email THEN
    RETURN QUERY SELECT false, 'email_mismatch', 'Invite email does not match current user',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, invite_row.status::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workboard_teams t WHERE t.id = invite_row.target_entity_id
  ) THEN
    RETURN QUERY SELECT false, 'board_deleted', 'This workboard no longer exists',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, invite_row.status::text;
    RETURN;
  END IF;

  IF invite_row.status = 'accepted' THEN
    SELECT m.id, m.role::text
    INTO member_id, member_role
    FROM public.workboard_team_members m
    WHERE m.team_id = invite_row.target_entity_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
    LIMIT 1;

    IF member_id IS NULL THEN
      RETURN QUERY SELECT false, 'accepted_without_membership',
        'Invitation was already used but you are not an active member',
        invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'accepted';
      RETURN;
    END IF;

    RETURN QUERY SELECT true, NULL::text, NULL::text,
      invite_row.id, invite_row.target_entity_id, member_id, member_role, 'already_accepted';
    RETURN;
  END IF;

  IF invite_row.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'invalid_status', 'Invitation cannot be accepted in its current state',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, invite_row.status::text;
    RETURN;
  END IF;

  INSERT INTO public.workboard_team_members (
    team_id,
    user_id,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    invite_row.target_entity_id,
    p_user_id,
    invite_row.role::public.workboard_member_role,
    'active',
    now(),
    now()
  )
  ON CONFLICT ON CONSTRAINT workboard_team_members_team_id_user_id_key DO UPDATE
  SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = now()
  RETURNING id, role::text INTO member_id, member_role;

  IF member_id IS NULL THEN
    RETURN QUERY SELECT false, 'membership_failed', 'Failed to create or activate membership',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'pending';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workboard_team_members m
    WHERE m.id = member_id
      AND m.status = 'active'
      AND m.user_id = p_user_id
      AND m.team_id = invite_row.target_entity_id
  ) THEN
    RAISE EXCEPTION 'membership verification failed';
  END IF;

  UPDATE public.platform_invitations
  SET
    status = 'accepted',
    accepted_at = now(),
    accepted_by = p_user_id,
    updated_at = now()
  WHERE id = invite_row.id;

  RETURN QUERY SELECT true, NULL::text, NULL::text,
    invite_row.id, invite_row.target_entity_id, member_id, member_role, 'accepted';

EXCEPTION
  WHEN others THEN
    -- Never leak sqlerrm to clients
    RETURN QUERY SELECT false, 'transaction_failed', 'Invitation acceptance failed',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
END;
$$;
COMMIT;
