CREATE OR REPLACE FUNCTION public.shop_authorize(p_actor uuid, p_action text, p_org uuid DEFAULT NULL::uuid, p_rider uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_role text; BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Actor required' USING ERRCODE='42501'; END IF;
 IF p_action='redeem' AND EXISTS(SELECT 1 FROM rider WHERE id=p_rider AND user_id=p_actor) THEN RETURN 'rider'; END IF;
 SELECT role INTO v_role FROM admin_users WHERE user_id=p_actor;
 IF v_role IS NOT NULL AND (
  (p_action='read' AND v_role IN ('super_admin','admin','operations_manager','partner_operations_manager','support_agent','support_lead','security_admin')) OR
  (p_action IN ('cancel','refund','consume','collect','adjust','retry') AND v_role IN ('super_admin','admin','operations_manager','partner_operations_manager'))
 ) THEN RETURN 'admin'; END IF;
 IF p_action='read' AND EXISTS(SELECT 1 FROM rider WHERE id=p_rider AND user_id=p_actor) THEN RETURN 'rider'; END IF;
 IF p_org IS NOT NULL AND EXISTS(SELECT 1 FROM organisation_membership WHERE user_id=p_actor AND organisation_id=p_org AND status='active'
  AND ((p_action='read') OR (p_action IN ('consume','collect') AND role IN ('owner','manager','staff')) OR
  (p_action IN ('cancel','refund','retry') AND role IN ('owner','manager')))) THEN RETURN 'organisation'; END IF;
 RAISE EXCEPTION 'Target not authorized' USING ERRCODE='42501';
END $function$

;
CREATE OR REPLACE FUNCTION public.shop_save_catalog(p_actor uuid, p_id uuid, p_payload jsonb, p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE old reward_catalog; c reward_catalog; editor uuid; rid uuid; who text; target_org uuid; allowed text[]:=ARRAY['sku','title','description','category','status','points_price','partner_id','partner_url','thumbnail_url','gallery_urls','inventory_type','inventory_count','max_per_rider','featured_rank','is_featured','visibility_rules','tags','fulfilment_type','resource_id','published_at','updated_at']; BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Unexpected catalog field' USING ERRCODE='22023'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO STRICT old FROM reward_catalog WHERE id=p_id FOR UPDATE;
  IF p_expected IS NULL OR old.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Catalog changed' USING ERRCODE='40001'; END IF;
  c:=jsonb_populate_record(old,p_payload);rid:=p_id;
 ELSE
  c:=jsonb_populate_record(NULL::reward_catalog,jsonb_build_object('status','draft','inventory_type','unlimited','gallery_urls','[]'::jsonb,'is_featured',false,'visibility_rules','{}'::jsonb,'tags','[]'::jsonb)||p_payload);rid:=gen_random_uuid();
  IF c.status='active' THEN RAISE EXCEPTION 'Create draft before independent approval' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT organisation_id INTO target_org FROM reward_partner WHERE id=c.partner_id;
 who:=shop_authorize(p_actor,'cancel',target_org);
 IF who='organisation' AND (c.status='active' OR (p_id IS NOT NULL AND old.partner_id IS DISTINCT FROM c.partner_id)) THEN RAISE EXCEPTION 'Admin approval required; save as draft' USING ERRCODE='42501'; END IF;
 IF c.resource_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fulfilment_resource r WHERE r.id=c.resource_id AND (r.partner_org_id IS NOT DISTINCT FROM target_org)) THEN RAISE EXCEPTION 'Resource organisation mismatch' USING ERRCODE='42501'; END IF;
 IF c.points_price<0 OR c.inventory_type NOT IN ('limited','unlimited') OR (c.inventory_type='limited' AND coalesce(c.inventory_count,-1)<0) THEN RAISE EXCEPTION 'Invalid catalog pricing or stock' USING ERRCODE='22023'; END IF;
 IF c.status='active' AND old.status='active' AND (c.points_price,c.resource_id,c.fulfilment_type,c.partner_id,c.visibility_rules,c.title,c.description,c.sku,c.inventory_type) IS DISTINCT FROM (old.points_price,old.resource_id,old.fulfilment_type,old.partner_id,old.visibility_rules,old.title,old.description,old.sku,old.inventory_type) THEN RAISE EXCEPTION 'Save material reward changes as draft for independent approval' USING ERRCODE='42501'; END IF;
 IF c.status='active' THEN
  SELECT actor_id INTO editor FROM shop_catalog_editor WHERE catalog_id=rid;
  IF editor=p_actor THEN RAISE EXCEPTION 'Independent catalog approval required' USING ERRCODE='42501'; END IF;
  IF (c.fulfilment_type='qr_barcode' AND target_org IS NULL) OR c.fulfilment_type NOT IN ('instant_digital','qr_barcode') OR c.visibility_rules<>'{}'::jsonb OR
    NOT EXISTS(SELECT 1 FROM fulfilment_resource r WHERE r.id=c.resource_id AND r.status='active' AND r.resource_kind='voucher_pool') THEN RAISE EXCEPTION 'Reward is not launch deliverable' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM set_config('movrr.shop_catalog_command','v1',true);
 INSERT INTO reward_catalog(id,sku,title,description,category,status,points_price,partner_id,partner_url,thumbnail_url,gallery_urls,inventory_type,inventory_count,max_per_rider,featured_rank,is_featured,visibility_rules,tags,fulfilment_type,resource_id,published_at,created_at,updated_at)
 VALUES(rid,c.sku,c.title,c.description,c.category,c.status,c.points_price,c.partner_id,c.partner_url,c.thumbnail_url,coalesce(c.gallery_urls,'[]'),c.inventory_type,c.inventory_count,c.max_per_rider,c.featured_rank,coalesce(c.is_featured,false),coalesce(c.visibility_rules,'{}'),coalesce(c.tags,'{}'),c.fulfilment_type,c.resource_id,c.published_at,coalesce(old.created_at,now()),now())
 ON CONFLICT(id) DO UPDATE SET sku=EXCLUDED.sku,title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,status=EXCLUDED.status,points_price=EXCLUDED.points_price,partner_id=EXCLUDED.partner_id,partner_url=EXCLUDED.partner_url,thumbnail_url=EXCLUDED.thumbnail_url,gallery_urls=EXCLUDED.gallery_urls,inventory_type=EXCLUDED.inventory_type,inventory_count=EXCLUDED.inventory_count,max_per_rider=EXCLUDED.max_per_rider,featured_rank=EXCLUDED.featured_rank,is_featured=EXCLUDED.is_featured,visibility_rules=EXCLUDED.visibility_rules,tags=EXCLUDED.tags,fulfilment_type=EXCLUDED.fulfilment_type,resource_id=EXCLUDED.resource_id,published_at=EXCLUDED.published_at,updated_at=EXCLUDED.updated_at RETURNING * INTO c;
 IF c.status<>'active' THEN INSERT INTO shop_catalog_editor VALUES(rid,p_actor) ON CONFLICT(catalog_id) DO UPDATE SET actor_id=p_actor; END IF;
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(p_actor,who,'rewards.manage','reward_catalog',rid::text,to_jsonb(old),to_jsonb(c),'catalog:'||gen_random_uuid()::text,'catalog_change');
 RETURN to_jsonb(c);
END $function$
