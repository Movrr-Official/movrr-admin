CREATE OR REPLACE FUNCTION public.save_partner_location(p_org uuid, p_input jsonb, p_actor uuid, p_correlation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid; v_id uuid; v_old public.reward_partner_location; v_row public.reward_partner_location; v_reward uuid; v_verified boolean; v_old_rewards jsonb;
BEGIN
 PERFORM 1 FROM organisation WHERE id=p_org AND type='reward_partner' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reward partner not found'; END IF;
 SELECT id INTO v_partner FROM reward_partner WHERE organisation_id=p_org FOR UPDATE;
 IF v_partner IS NULL THEN RAISE EXCEPTION 'Reward partner not found'; END IF;
 v_id := COALESCE((p_input->>'id')::uuid,gen_random_uuid());
 SELECT * INTO v_old FROM reward_partner_location WHERE id=v_id FOR UPDATE;
 IF v_old.id IS NOT NULL AND (v_old.organisation_id <> p_org OR v_old.updated_at IS DISTINCT FROM (p_input->>'expectedUpdatedAt')::timestamptz) THEN RAISE EXCEPTION 'Location version conflict'; END IF;
 IF p_input ? 'id' AND v_old.id IS NULL THEN RAISE EXCEPTION 'Location not found'; END IF;
 SELECT COALESCE(jsonb_agg(catalog_item_id),'[]'::jsonb) INTO v_old_rewards FROM reward_catalog_location WHERE location_id=v_id;
 IF jsonb_array_length(COALESCE(p_input->'rewardIds','[]'::jsonb)) > 30 THEN RAISE EXCEPTION 'Too many reward associations' USING ERRCODE='23514'; END IF;
 v_verified := COALESCE((p_input->>'coordinatesVerified')::boolean,false);
 INSERT INTO reward_partner_location(id,organisation_id,partner_id,name,address,latitude,longitude,status,verified_at,verified_by,created_by,updated_by)
 VALUES(v_id,p_org,v_partner,p_input->>'name',p_input->>'address',(p_input->>'latitude')::double precision,(p_input->>'longitude')::double precision,p_input->>'status',CASE WHEN v_verified THEN now() END,CASE WHEN v_verified THEN p_actor END,p_actor,p_actor)
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,address=EXCLUDED.address,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,status=EXCLUDED.status,verified_at=EXCLUDED.verified_at,verified_by=EXCLUDED.verified_by,updated_by=p_actor,updated_at=GREATEST(clock_timestamp(),reward_partner_location.updated_at + interval '1 microsecond') RETURNING * INTO v_row;
 DELETE FROM reward_catalog_location WHERE location_id=v_id;
 FOR v_reward IN SELECT jsonb_array_elements_text(COALESCE(p_input->'rewardIds','[]'::jsonb))::uuid LOOP
  IF NOT EXISTS(SELECT 1 FROM reward_catalog WHERE id=v_reward AND partner_id=v_partner) THEN RAISE EXCEPTION 'Catalog item belongs to another partner'; END IF;
  INSERT INTO reward_catalog_location VALUES(v_id,v_reward) ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO partner_location_audit(location_id,actor_user_id,correlation_id,previous_state,resulting_state) VALUES(v_id,p_actor,p_correlation,CASE WHEN v_old.id IS NOT NULL THEN to_jsonb(v_old) || jsonb_build_object('rewardIds',v_old_rewards) END,to_jsonb(v_row) || jsonb_build_object('rewardIds',COALESCE(p_input->'rewardIds','[]'::jsonb)));
 RETURN to_jsonb(v_row);
END $function$
