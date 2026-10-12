-- DISPOSABLE/STAGING ONLY: requires migrations through 051 and an administrative test connection.
-- All fixtures and mutations roll back. Never run this against production.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); org uuid; partner uuid; other_org uuid; other_partner uuid;
 location jsonb; edited jsonb; org_result jsonb; reward uuid:=gen_random_uuid(); wrong_reward uuid:=gen_random_uuid();
 suffix text:=gen_random_uuid()::text; before_count integer; after_count integer; caught boolean;
 i integer; page_cursor uuid; page_last uuid; page_count integer; discovered integer:=0;
BEGIN
 IF has_table_privilege('anon','public.reward_partner_location','SELECT') OR has_table_privilege('authenticated','public.reward_partner_location','SELECT') THEN RAISE EXCEPTION 'Direct table privilege exposed'; END IF;
 IF has_function_privilege('authenticated','public.save_partner_location(uuid,jsonb,uuid,text)','EXECUTE') OR has_function_privilege('anon','public.save_organisation_with_partner(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Mutation RPC exposed'; END IF;
 INSERT INTO auth.users(id) VALUES(actor);
 org_result:=save_organisation_with_partner(NULL,jsonb_build_object('name','test-partner-'||suffix,'type','reward_partner','status','active'));
 org:=(org_result->'organisation'->>'id')::uuid; partner:=(org_result->'partner'->>'id')::uuid;
 org_result:=save_organisation_with_partner(NULL,jsonb_build_object('name','test-other-'||suffix,'type','reward_partner'));
 other_org:=(org_result->'organisation'->>'id')::uuid; other_partner:=(org_result->'partner'->>'id')::uuid;
 INSERT INTO reward_catalog(id,sku,title,category,points_price,partner_id,status) VALUES(reward,'loc-test-'||suffix,'Reward','other',10,partner,'active'),(wrong_reward,'loc-wrong-'||suffix,'Other','other',20,other_partner,'active');
 location:=save_partner_location(org,jsonb_build_object('name','Branch','address','Test address','latitude',52,'longitude',4,'status','published','coordinatesVerified',true,'rewardIds',jsonb_build_array(reward)),actor,'sql-test');
 edited:=save_partner_location(org,jsonb_build_object('id',location->>'id','expectedUpdatedAt',location->>'updated_at','name','Edited','address','Test address','latitude',52,'longitude',4,'status','published','coordinatesVerified',true,'rewardIds',jsonb_build_array(reward)),actor,'sql-edit');
 caught:=false;
 BEGIN
  PERFORM save_partner_location(org,jsonb_build_object('id',location->>'id','expectedUpdatedAt',location->>'updated_at','name','Stale','address','Test address','latitude',52,'longitude',4,'status','draft','rewardIds','[]'::jsonb),actor,'stale');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Location version conflict' THEN caught:=true; ELSE RAISE; END IF; END;
 IF NOT caught THEN RAISE EXCEPTION 'Stale edit was accepted'; END IF;
 caught:=false;
 BEGIN
  PERFORM save_partner_location(org,jsonb_build_object('id',edited->>'id','expectedUpdatedAt',edited->>'updated_at','name','Wrong reward','address','Test address','latitude',52,'longitude',4,'status','published','coordinatesVerified',true,'rewardIds',jsonb_build_array(wrong_reward)),actor,'rollback');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Catalog item belongs to another partner' THEN caught:=true; ELSE RAISE; END IF; END;
 IF NOT caught OR (SELECT name FROM reward_partner_location WHERE id=(edited->>'id')::uuid)<>'Edited' OR NOT EXISTS(SELECT 1 FROM reward_catalog_location WHERE location_id=(edited->>'id')::uuid AND catalog_item_id=reward) THEN RAISE EXCEPTION 'Reward rollback failed'; END IF;
 -- More than 100 real test branches, isolated by partner identity and rolled back.
 FOR i IN 1..350 LOOP
  PERFORM save_partner_location(org,jsonb_build_object('name','Dense branch '||i,'address','Test address','latitude',52+(i%20)*0.001,'longitude',4+(i%17)*0.001,'status','published','coordinatesVerified',true,'rewardIds','[]'::jsonb),actor,'dense-fixture');
 END LOOP;
 LOOP
  SELECT count(*),max(id::text)::uuid INTO page_count,page_last FROM (SELECT id FROM reward_partner_location WHERE partner_id=partner AND (page_cursor IS NULL OR id>page_cursor) ORDER BY id LIMIT 100) page;
  EXIT WHEN page_count=0;
  discovered:=discovered+page_count;page_cursor:=page_last;
 END LOOP;
 IF discovered<>351 THEN RAISE EXCEPTION 'Dense cursor traversal incomplete: %',discovered; END IF;
 SELECT count(*) INTO before_count FROM organisation;
 caught:=false;
 BEGIN
  PERFORM save_organisation_with_partner(NULL,jsonb_build_object('name','test-partner-'||suffix,'type','reward_partner'));
 EXCEPTION WHEN check_violation THEN caught:=true; END;
 SELECT count(*) INTO after_count FROM organisation;
 IF NOT caught OR before_count<>after_count THEN RAISE EXCEPTION 'Relink/create rollback failed'; END IF;
 caught:=false;
 BEGIN DELETE FROM organisation WHERE id=org; EXCEPTION WHEN foreign_key_violation THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'Physical identity deletion was allowed'; END IF;
 PERFORM save_organisation_with_partner(org,jsonb_build_object('status','suspended'));
 IF EXISTS(SELECT 1 FROM reward_partner_location l JOIN reward_partner p ON p.id=l.partner_id JOIN organisation o ON o.id=l.organisation_id WHERE l.id=(edited->>'id')::uuid AND l.status='published' AND p.status='active' AND o.status='active') THEN RAISE EXCEPTION 'Suspended partner remains publicly visible'; END IF;
 -- Existing partner with no locations retains the old linking capability.
 INSERT INTO reward_partner(name,status) VALUES('legacy-'||suffix,'active');
 org_result:=save_organisation_with_partner(NULL,jsonb_build_object('name','legacy-'||suffix,'type','reward_partner'));
 IF org_result->'partner'->>'organisation_id' IS DISTINCT FROM org_result->'organisation'->>'id' THEN RAISE EXCEPTION 'Legacy link failed'; END IF;
END $$;
-- Capture plans with representative staging density; this fixture test does not certify production plans.
EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM reward_partner_location WHERE status='published' AND latitude BETWEEN 52 AND 52.1 AND longitude BETWEEN 4 AND 4.1 ORDER BY id LIMIT 101;
ROLLBACK;
