-- Production execution requires explicit approval.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_create(p_actor uuid, p_operation uuid, p_kind text, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE caps jsonb; required text; saved public.admin_creation_operation; result jsonb; child_id uuid; children jsonb; hot_children jsonb; child_result jsonb;
  record jsonb:=p_input->'record'; child jsonb; entity_table text; team uuid; member_role text; actor_role text;
  route_ids uuid[]; assigned integer; partner uuid; organisation_result jsonb;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(70001,1);
  required:=CASE p_kind WHEN 'route' THEN 'routes.write' WHEN 'route_stops' THEN 'routes.write' WHEN 'suggested_route' THEN 'routes.write' WHEN 'campaign_geography' THEN 'campaigns.write' WHEN 'campaign' THEN 'campaigns.write'
    WHEN 'workboard_bootstrap' THEN 'workboard.access' WHEN 'workboard_board' THEN 'workboard.access' WHEN 'workboard_card' THEN 'workboard.access'
    WHEN 'organisation' THEN 'rewards.manage' WHEN 'catalog' THEN 'rewards.manage' WHEN 'partner_location' THEN 'rewards.manage'
    WHEN 'community_ride' THEN 'community.manage' WHEN 'pro_tip' THEN 'protips.manage' END;
  IF required IS NULL OR p_operation IS NULL THEN RAISE EXCEPTION 'Invalid creation command'; END IF;
  SELECT a.role,public.ops_employee_capabilities(a.role) INTO actor_role,caps FROM public.admin_users a
    JOIN public."user" u ON u.id=a.user_id JOIN auth.users identity ON identity.id=u.id WHERE a.user_id=p_actor AND u.status='active' AND identity.deleted_at IS NULL AND (identity.banned_until IS NULL OR identity.banned_until<=now());
  -- The advertiser Platform API owns its campaign boundary. No client-selected
  -- advertiser ID can cross an organisation membership boundary.
  IF p_kind='campaign' AND actor_role IS NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id
      JOIN public.advertiser a ON a.organisation_id=o.id JOIN public."user" u ON u.id=m.user_id
      WHERE m.user_id=p_actor AND m.status='active' AND o.type='advertiser' AND o.status='active' AND u.status='active'
      AND public.ops_organisation_capabilities(o.type,m.role) ? 'campaigns.write' AND a.id=(record->>'advertiser_id')::uuid) THEN
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
        IF EXISTS(SELECT 1 FROM public.workboard_teams) OR actor_role<>'super_admin' THEN
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
END $function$;

-- Migrate the explicit historical advertiser.user_id ownership relationship.
-- No membership is inferred from a mixed user_role value.
DO $$
DECLARE advertiser_row record; migration_actor uuid:=nullif(current_setting('movrr.migration_actor',true),'')::uuid; org_id uuid;
BEGIN
 FOR advertiser_row IN SELECT ad.id,ad.user_id,ad.organisation_id,ad.company_name FROM public.advertiser ad
  JOIN public."user" u ON u.id=ad.user_id JOIN auth.users a ON a.id=u.id WHERE u.status='active' AND a.deleted_at IS NULL
  AND (a.banned_until IS NULL OR a.banned_until<=now()) AND NOT EXISTS(SELECT 1 FROM public.organisation_membership m WHERE m.organisation_id=ad.organisation_id AND m.user_id=ad.user_id)
 LOOP
  IF migration_actor IS NULL OR NOT public.is_super_admin(migration_actor) THEN RAISE EXCEPTION 'An explicitly approved active super administrator migration actor is required for historical advertiser ownership'; END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  org_id:=advertiser_row.organisation_id;
  IF org_id IS NULL THEN
   INSERT INTO public.organisation(name,type,status) VALUES(coalesce(nullif(advertiser_row.company_name,''),'Advertiser'),'advertiser','active') RETURNING id INTO org_id;
   UPDATE public.advertiser SET organisation_id=org_id WHERE id=advertiser_row.id;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organisation WHERE id=org_id AND type='advertiser' AND status='active') THEN RAISE EXCEPTION 'Historical advertiser organisation needs explicit review'; END IF;
  PERFORM public.change_organisation_membership(migration_actor,advertiser_row.user_id,org_id,'owner','active');
 END LOOP;
END $$;
COMMIT;
