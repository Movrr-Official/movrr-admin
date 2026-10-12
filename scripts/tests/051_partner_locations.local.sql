-- LOCAL DISPOSABLE DATABASE ONLY. All synthetic data and temporary grants roll back.
\set ON_ERROR_STOP on
SET timezone='UTC';
BEGIN;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); org uuid; other_org uuid; partner uuid; other_partner uuid;
 result jsonb; branch jsonb; edited jsonb; payload jsonb; before_row jsonb; before_partner jsonb;
 expected timestamptz; caught boolean; audits integer; i integer; accepted integer:=0; key text:=gen_random_uuid()::text;
BEGIN
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('reward_partner_location'::regclass,'reward_catalog_location'::regclass,'partner_location_audit'::regclass) AND relrowsecurity)=3 IS NOT TRUE THEN RAISE EXCEPTION 'RLS not enabled'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('save_partner_location(uuid,jsonb,uuid,text)'::regprocedure,'save_organisation_with_partner(uuid,jsonb)'::regprocedure) AND (prosecdef OR NOT ('search_path=public'=ANY(proconfig)))) THEN RAISE EXCEPTION 'RPC security contract changed'; END IF;
 FOR i IN 1..2 LOOP
  IF has_function_privilege(CASE WHEN i=1 THEN 'anon' ELSE 'authenticated' END,'save_partner_location(uuid,jsonb,uuid,text)','EXECUTE') OR has_function_privilege(CASE WHEN i=1 THEN 'anon' ELSE 'authenticated' END,'save_organisation_with_partner(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'RPC exposed'; END IF;
 END LOOP;
 IF NOT has_function_privilege('service_role','save_partner_location(uuid,jsonb,uuid,text)','EXECUTE') OR NOT has_function_privilege('service_role','save_organisation_with_partner(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Service RPC grant missing'; END IF;
 INSERT INTO auth.users(id) VALUES(actor);
 SET LOCAL ROLE service_role;
 result:=save_organisation_with_partner(NULL,jsonb_build_object('name','local-a-'||key,'type','reward_partner'));
 org:=(result->'organisation'->>'id')::uuid;partner:=(result->'partner'->>'id')::uuid;
 result:=save_organisation_with_partner(NULL,jsonb_build_object('name','local-b-'||key,'type','reward_partner'));
 other_org:=(result->'organisation'->>'id')::uuid;other_partner:=(result->'partner'->>'id')::uuid;
 payload:=jsonb_build_object('name','Draft branch','address','Synthetic address','status','draft','rewardIds','[]'::jsonb);
 branch:=save_partner_location(org,payload,actor,'local-create');
 IF branch->>'latitude' IS NOT NULL OR branch->>'verified_at' IS NOT NULL THEN RAISE EXCEPTION 'Invented draft coordinates/verification'; END IF;
 RAISE NOTICE 'PASS service-role RPC create and draft defaults';
 FOR i IN 1..5 LOOP
  caught:=false;
  BEGIN
   PERFORM save_partner_location(org,payload || CASE i WHEN 1 THEN jsonb_build_object('latitude',91,'longitude',4) WHEN 2 THEN jsonb_build_object('latitude',52,'longitude',181) WHEN 3 THEN jsonb_build_object('latitude','NaN','longitude',4) WHEN 4 THEN jsonb_build_object('latitude',52) ELSE jsonb_build_object('status','published') END,actor,'invalid');
  EXCEPTION WHEN check_violation THEN caught:=true; END;
  IF NOT caught THEN RAISE EXCEPTION 'Invalid coordinates/publication accepted case %',i; END IF;
 END LOOP;
 RAISE NOTICE 'PASS invalid latitude, longitude, NaN, one-sided coordinates and unverified publication';
 UPDATE reward_partner_location SET updated_at='2026-10-12T12:00:00.123456+02:00' WHERE id=(branch->>'id')::uuid;
 SELECT to_jsonb(l) INTO branch FROM reward_partner_location l WHERE id=(branch->>'id')::uuid;
 IF branch->>'updated_at' <> '2026-10-12T10:00:00.123456+00:00' THEN RAISE EXCEPTION 'Microsecond JSON serialization changed: %',branch->>'updated_at'; END IF;
 payload:=payload||jsonb_build_object('id',branch->>'id','expectedUpdatedAt','2026-10-12T12:00:00.123456+02:00','latitude',52,'longitude',4,'status','published','coordinatesVerified',true);
 edited:=save_partner_location(org,payload,actor,'precision-edit');
 IF (edited->>'updated_at')::timestamptz <= (branch->>'updated_at')::timestamptz OR edited->>'verified_by' <> actor::text THEN RAISE EXCEPTION 'Precision increment/verification actor invalid'; END IF;
 caught:=false;
 BEGIN PERFORM save_partner_location(org,payload,actor,'stale'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='Location version conflict' THEN caught:=true; ELSE RAISE; END IF; END;
 IF NOT caught THEN RAISE EXCEPTION 'Stale edit accepted'; END IF;
 RAISE NOTICE 'PASS actual PostgreSQL microseconds, offset equivalent expected version and stale conflict';
 caught:=false;
 BEGIN PERFORM save_partner_location(other_org,payload||jsonb_build_object('expectedUpdatedAt',edited->>'updated_at'),actor,'cross-org'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='Location version conflict' THEN caught:=true; ELSE RAISE; END IF; END;
 IF NOT caught THEN RAISE EXCEPTION 'Cross-org edit accepted'; END IF;
 caught:=false;
 BEGIN UPDATE reward_partner_location SET organisation_id=other_org WHERE id=(edited->>'id')::uuid; EXCEPTION WHEN foreign_key_violation THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'Composite partner/org FK missing'; END IF;
 RAISE NOTICE 'PASS cross-organisation RPC access and composite FK';
 SELECT to_jsonb(o) INTO before_row FROM organisation o WHERE id=org;
 SELECT to_jsonb(p) INTO before_partner FROM reward_partner p WHERE id=partner;
 caught:=false;
 BEGIN PERFORM save_organisation_with_partner(org,jsonb_build_object('name','Should roll back','status','invalid')); EXCEPTION WHEN check_violation THEN caught:=true; END;
 IF NOT caught OR (SELECT to_jsonb(o) FROM organisation o WHERE id=org) IS DISTINCT FROM before_row OR (SELECT to_jsonb(p) FROM reward_partner p WHERE id=partner) IS DISTINCT FROM before_partner THEN RAISE EXCEPTION 'Multi-record update rollback failed'; END IF;
 SELECT count(*) INTO audits FROM partner_location_audit;
 caught:=false;
 BEGIN PERFORM save_partner_location(org,payload||jsonb_build_object('expectedUpdatedAt',edited->>'updated_at','name','Partial write','rewardIds',jsonb_build_array(gen_random_uuid())),actor,'partial'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='Catalog item belongs to another partner' THEN caught:=true; ELSE RAISE; END IF; END;
 IF NOT caught OR (SELECT to_jsonb(l) FROM reward_partner_location l WHERE id=(edited->>'id')::uuid) IS DISTINCT FROM edited OR (SELECT count(*) FROM partner_location_audit)<>audits THEN RAISE EXCEPTION 'Location/audit rollback failed'; END IF;
 RAISE NOTICE 'PASS partial organisation/partner and location/audit transaction rollback';
 caught:=false;
 BEGIN UPDATE reward_partner SET organisation_id=other_org WHERE id=partner; EXCEPTION WHEN integrity_constraint_violation THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'Referenced partner relink accepted'; END IF;
 caught:=false;
 BEGIN DELETE FROM reward_partner WHERE id=partner; EXCEPTION WHEN foreign_key_violation THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'Referenced partner deletion accepted'; END IF;
 caught:=false;
 BEGIN DELETE FROM organisation WHERE id=org; EXCEPTION WHEN foreign_key_violation THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'Referenced organisation deletion accepted'; END IF;
 PERFORM save_organisation_with_partner(org,jsonb_build_object('status','suspended'));
 IF EXISTS(SELECT 1 FROM reward_partner_location l JOIN reward_partner p ON p.id=l.partner_id JOIN organisation o ON o.id=l.organisation_id WHERE l.id=(edited->>'id')::uuid AND l.status='published' AND p.status='active' AND o.status='active') THEN RAISE EXCEPTION 'Suspended partner visible'; END IF;
 PERFORM save_organisation_with_partner(org,jsonb_build_object('status','active'));
 IF (SELECT count(*) FROM reward_partner_location l JOIN reward_partner p ON p.id=l.partner_id JOIN organisation o ON o.id=l.organisation_id WHERE l.latitude BETWEEN 51.9 AND 52.1 AND l.longitude BETWEEN 3.9 AND 4.1 AND l.status='published' AND p.status='active' AND o.status='active')<>1 THEN RAISE EXCEPTION 'Geographic discovery wrong'; END IF;
 PERFORM save_partner_location(org,payload||jsonb_build_object('expectedUpdatedAt',edited->>'updated_at','status','suspended'),actor,'location-suspend');
 IF EXISTS(SELECT 1 FROM reward_partner_location WHERE id=(edited->>'id')::uuid AND status='published') THEN RAISE EXCEPTION 'Suspended location discoverable'; END IF;
 RAISE NOTICE 'PASS restrictive lifecycle, partner/location suspension and geographic bounds';
 RESET ROLE;
 FOR i IN 1..2 LOOP
  caught:=false;
  BEGIN
   IF i=1 THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
   PERFORM * FROM reward_partner_location;
  EXCEPTION WHEN insufficient_privilege THEN caught:=true; END;
  RESET ROLE;
  IF NOT caught THEN RAISE EXCEPTION 'App role direct table access allowed'; END IF;
  caught:=false;
  BEGIN
   IF i=1 THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
   PERFORM save_organisation_with_partner(NULL,jsonb_build_object('name','Unauthorized','type','reward_partner'));
  EXCEPTION WHEN insufficient_privilege THEN caught:=true; END;
  RESET ROLE;
  IF NOT caught THEN RAISE EXCEPTION 'App role RPC access allowed'; END IF;
 END LOOP;
 -- Isolate RLS from privileges: temporary SELECT grant still reveals no rows.
 GRANT SELECT ON reward_partner_location,reward_catalog_location,partner_location_audit TO authenticated;
 SET LOCAL ROLE authenticated;
 IF (SELECT count(*) FROM reward_partner_location)<>0 OR (SELECT count(*) FROM partner_location_audit)<>0 THEN RAISE EXCEPTION 'RLS failed independently of privileges'; END IF;
 RESET ROLE;
 FOR i IN 1..35 LOOP IF platform_rate_limit_hit(key,date_trunc('minute',now()),30) THEN accepted:=accepted+1; END IF; END LOOP;
 IF accepted<>30 THEN RAISE EXCEPTION 'Atomic quota accepted % rather than 30',accepted; END IF;
 RAISE NOTICE 'PASS actual app-role denial, independent RLS filtering and 046 quota';
END $test$;
ROLLBACK;
DO $clean$
BEGIN
 IF EXISTS(SELECT 1 FROM reward_partner_location) OR EXISTS(SELECT 1 FROM partner_location_audit) OR EXISTS(SELECT 1 FROM reward_catalog_location) OR EXISTS(SELECT 1 FROM organisation) OR EXISTS(SELECT 1 FROM reward_partner) THEN RAISE EXCEPTION 'Fixture rollback left data behind'; END IF;
 IF has_table_privilege('authenticated','reward_partner_location','SELECT') THEN RAISE EXCEPTION 'Temporary grant did not roll back'; END IF;
 RAISE NOTICE 'PASS complete fixture and temporary-grant rollback';
END $clean$;
