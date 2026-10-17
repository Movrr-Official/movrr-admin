-- Disposable/local or approved staging database only, after 051 + 052. All rows roll back.
BEGIN;
DO $test$
DECLARE result jsonb; org uuid; partner uuid; category text; initial_name text; rejected boolean;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.partner_business_category'::regclass) THEN RAISE EXCEPTION 'Category RLS absent'; END IF;
 IF has_table_privilege('authenticated','public.partner_business_category','INSERT') OR has_table_privilege('anon','public.partner_business_category','SELECT') THEN RAISE EXCEPTION 'Category grants exposed'; END IF;
 IF has_function_privilege('authenticated','public.save_organisation_with_partner(uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','public.save_organisation_with_partner(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Mutation RPC exposed'; END IF;
 IF NOT has_function_privilege('service_role','public.save_organisation_with_partner(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Mutation service grant missing'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.save_organisation_with_partner(uuid,jsonb)'::regprocedure) THEN RAISE EXCEPTION 'RPC became definer'; END IF;
 initial_name := 'category-test-' || gen_random_uuid();
 result := save_organisation_with_partner(NULL,jsonb_build_object('name',initial_name,'type','reward_partner'));
 org := (result->'organisation'->>'id')::uuid; partner := (result->'partner'->>'id')::uuid;
 IF result->'partner'->>'business_category' IS NOT NULL THEN RAISE EXCEPTION 'Fabricated initial category'; END IF;
 FOR category IN SELECT code FROM partner_business_category LOOP
  result := save_organisation_with_partner(org,jsonb_build_object('partnerProfile',jsonb_build_object('businessCategory',category)));
  IF result->'partner'->>'business_category' IS DISTINCT FROM category THEN RAISE EXCEPTION 'Wrong readback'; END IF;
  result := save_organisation_with_partner(org,'{}');
  IF result->'partner'->>'business_category' IS DISTINCT FROM category THEN RAISE EXCEPTION 'Omitted category overwritten'; END IF;
 END LOOP;
 rejected:=false;
 BEGIN
  PERFORM save_organisation_with_partner(org,jsonb_build_object('name','must-rollback','partnerProfile',jsonb_build_object('businessCategory','not-supported')));
 EXCEPTION WHEN foreign_key_violation THEN rejected:=true;
 END;
 IF NOT rejected OR (SELECT name FROM organisation WHERE id=org) <> initial_name THEN RAISE EXCEPTION 'Unknown category/atomic rollback failed'; END IF;
 result := save_organisation_with_partner(org,'{"partnerProfile":{"businessCategory":null}}');
 IF result->'partner'->>'business_category' IS NOT NULL THEN RAISE EXCEPTION 'Clear failed'; END IF;
 result := save_organisation_with_partner(NULL,jsonb_build_object('name','category-nonpartner-'||gen_random_uuid(),'type','advertiser'));
 rejected:=false;
 BEGIN
  PERFORM save_organisation_with_partner((result->'organisation'->>'id')::uuid,'{"partnerProfile":{"businessCategory":"cafe"}}');
 EXCEPTION WHEN check_violation THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Non-partner category allowed'; END IF;
 -- Prove column guard even under permissive legacy table UPDATE grants.
 GRANT USAGE ON SCHEMA public TO authenticated;
 GRANT SELECT,UPDATE ON reward_partner TO authenticated;
 rejected:=false;
 BEGIN
  SET LOCAL ROLE authenticated;
  UPDATE reward_partner SET business_category='cafe' WHERE id=partner;
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
 END;
 RESET ROLE;
 IF NOT rejected THEN RAISE EXCEPTION 'Direct unprivileged category write allowed'; END IF;
 rejected:=false;
 BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM save_organisation_with_partner(org,'{"partnerProfile":{"businessCategory":"cafe"}}');
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
 END;
 RESET ROLE;
 IF NOT rejected THEN RAISE EXCEPTION 'Unprivileged RPC allowed'; END IF;
 SET LOCAL ROLE service_role;
 result := save_organisation_with_partner(org,'{"partnerProfile":{"businessCategory":"cafe"}}');
 RESET ROLE;
 IF result->'partner'->>'business_category' <> 'cafe' THEN RAISE EXCEPTION 'Service update failed'; END IF;
END $test$;
ROLLBACK;
