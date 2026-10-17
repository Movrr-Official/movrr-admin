-- PREPARED, NOT EXECUTED IN PRODUCTION. Project kzdvunpuxaxlphqvmzxw only.
-- ROLLBACK exact 80 original zones of campaign 34a54a90-a399-46b7-b446-9d4e57db0759.
-- This script aborts unless an explicitly approved operator sets both session settings:
--   SET movrr.geography_execution='rollback:2eabec27-003b-47a4-99a8-8d0090000cfe';
--   SET movrr.geography_actor_id='<approved admin auth.users UUID>';
-- Verify the configured DB project, operator campaigns.write authority and approval record first.
-- No geometry, IDs, names, associations, creation dates or historical reward evidence are changed.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Use the approved database operator role'; END IF;
 IF current_setting('movrr.geography_execution',true) IS DISTINCT FROM 'rollback:2eabec27-003b-47a4-99a8-8d0090000cfe' THEN
  RAISE EXCEPTION 'Explicit rollback approval is absent';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261017160000') THEN
  RAISE EXCEPTION 'Approved migration 053 is not registered';
 END IF;
END $$;
LOCK TABLE public.campaign_zone IN SHARE ROW EXCLUSIVE MODE;
SELECT id FROM public.campaign WHERE id='34a54a90-a399-46b7-b446-9d4e57db0759' FOR UPDATE;
CREATE TEMP TABLE geography_retirement_targets(id uuid PRIMARY KEY,geometry_md5 text NOT NULL,original_name text,original_created_at timestamptz) ON COMMIT DROP;
INSERT INTO geography_retirement_targets VALUES
('b555686f-1929-4496-a34f-d3b7796c4cb3'::uuid,'7875e04a97589be49c9cd990812da6d4','Route Scheveningen Promenade Run segment after stop 0','2026-04-11T19:10:27.024Z'::timestamptz),
('8623186d-9388-4943-9ffb-aa80d828924f'::uuid,'6b24549843e3308923c35955491239f0','Route Scheveningen Promenade Run segment after stop 1','2026-04-11T19:10:27.024Z'::timestamptz),
('4709be30-fca6-439c-bed6-d6b70f4b2f05'::uuid,'8484fa8e04677e51ba4283565ea4693b','Route Scheveningen Promenade Run segment after stop 2','2026-04-11T19:10:27.024Z'::timestamptz),
('bdb699c9-482d-4630-b3e4-240f34af8df5'::uuid,'293613234780ce05b3112ef9c67976ef','Route Scheveningen Promenade Run segment after stop 3','2026-04-11T19:10:27.024Z'::timestamptz),
('4db48807-775a-4af4-9a36-701aa5ba20c0'::uuid,'9b5b62fefd21d75fa7adaf251df8b6b9','Route Scheveningen Promenade Run segment after stop 4','2026-04-11T19:10:27.024Z'::timestamptz),
('72ccacbc-0d30-47de-af7e-5f96246ba2a8'::uuid,'cfc0072bc5198c90a24bda5ad188237b','Route Scheveningen Promenade Run segment after stop 5','2026-04-11T19:10:27.024Z'::timestamptz),
('c74f4c41-4e3f-4924-80b4-aa4605549085'::uuid,'b2ff0dc2c376db4971d92dd3a697d67e','Route Scheveningen Promenade Run segment after stop 6','2026-04-11T19:10:27.024Z'::timestamptz),
('4cad0eb3-1c63-4fdf-9621-45c3c1a2cd69'::uuid,'ee8cb161caf85b3406c161fb8d3c0b10','Route Scheveningen Promenade Run segment after stop 7','2026-04-11T19:10:27.024Z'::timestamptz),
('3bbb7eae-f30f-40fe-87d9-48f72beb68d0'::uuid,'50cbca1a3a4229e986d319116537652d','Route Scheveningen Promenade Run segment after stop 8','2026-04-11T19:10:27.024Z'::timestamptz),
('55b280ab-a726-4afa-8f38-ebc882fcf17b'::uuid,'eee50a9ae6b3bea3e6d9f74489c9f7ef','Route Scheveningen Promenade Run segment after stop 9','2026-04-11T19:10:27.024Z'::timestamptz),
('040acea5-7987-4c68-9511-63ee78550d11'::uuid,'3a436ecb48a087808340ebffa95b29ea','Route Scheveningen Promenade Run segment after stop 10','2026-04-11T19:10:27.024Z'::timestamptz),
('f99441d8-b1d6-461e-8853-76afbf05fdda'::uuid,'5edfbef3e084cae0e515f3b693d5536e','Route Scheveningen Promenade Run segment after stop 11','2026-04-11T19:10:27.024Z'::timestamptz),
('2945bc13-7c4c-4383-8a34-621fd2f44c83'::uuid,'37d485e691dad1f5e5e7a7e882332e8b','Route Scheveningen Promenade Run segment after stop 12','2026-04-11T19:10:27.024Z'::timestamptz),
('cd4433ed-cdfa-4911-bc5d-bda14a9ee3be'::uuid,'ad45945cb82db33f850c765f12eab1fb','Route Scheveningen Promenade Run segment after stop 13','2026-04-11T19:10:27.024Z'::timestamptz),
('86fed8ce-7349-4992-bfb0-64dbbd11ef3c'::uuid,'50fee7900677f26aea6cbeaf82c72a0f','Route Scheveningen Promenade Run segment after stop 14','2026-04-11T19:10:27.024Z'::timestamptz),
('ef3c06e4-a5f3-4c65-8eb3-762db8ac6c95'::uuid,'c0e5cb76c19d4787398bb2bc0973dade','Route Scheveningen Promenade Run segment after stop 15','2026-04-11T19:10:27.024Z'::timestamptz),
('9cc1469c-c97a-4572-8c39-30964282796a'::uuid,'62caa3e3dd7c2a3122fb226ffab88b8a','Route Scheveningen Promenade Run segment after stop 16','2026-04-11T19:10:27.024Z'::timestamptz),
('72108289-7e13-495b-a6fe-d113aa915f72'::uuid,'559f3c0abb84a24dc66fff491680aa03','Route Scheveningen Promenade Run segment after stop 17','2026-04-11T19:10:27.024Z'::timestamptz),
('567a69fd-68fd-40f8-8a12-0e28b107905f'::uuid,'b1a05c90059e9e4cfd5b16ddd1a53a9a','Route Scheveningen Promenade Run segment after stop 18','2026-04-11T19:10:27.024Z'::timestamptz),
('01f15110-d823-472c-b522-f5cbb5a64bcd'::uuid,'b1970181d696c99f4663c86953c8ff28','Route Scheveningen Promenade Run segment after stop 19','2026-04-11T19:10:27.024Z'::timestamptz),
('8fea2cba-b4af-4625-822b-53c7a2c99e2a'::uuid,'b6ca8ffbc438dbb321311a8f55d8a23b','Route Scheveningen Promenade Run segment after stop 20','2026-04-11T19:10:27.024Z'::timestamptz),
('9bb15d87-cce6-412c-b731-5ad389065cc3'::uuid,'80e6da0b412df8bc95f72c6bd89088a0','Route Scheveningen Promenade Run segment after stop 21','2026-04-11T19:10:27.024Z'::timestamptz),
('305fd211-a52d-49af-a5ea-5b3901797fd8'::uuid,'ef9edb8127d9073affceedef6b5012bc','Route Scheveningen Promenade Run segment after stop 22','2026-04-11T19:10:27.024Z'::timestamptz),
('774f4411-a251-48dd-8359-5c54342129f9'::uuid,'d32bc3cf7aa90940671786b37ef1a9ba','Route Scheveningen Promenade Run segment after stop 23','2026-04-11T19:10:27.024Z'::timestamptz),
('a29a2542-a243-45ae-894d-8d4bd09839d6'::uuid,'601b05c385024e0f820b59f4fb6fad81','Route Scheveningen Promenade Run segment after stop 24','2026-04-11T19:10:27.024Z'::timestamptz),
('316b5ef2-b67e-4ab2-a189-b39a0d7a84ba'::uuid,'bd89ddb0a424ce996bbf61f52da7467e','Route Scheveningen Promenade Run segment after stop 25','2026-04-11T19:10:27.024Z'::timestamptz),
('1e5f8d45-ebeb-4220-afe9-d588752374fe'::uuid,'ced63d3f77e97405e9b008afe01aa2b9','Route Scheveningen Promenade Run segment after stop 26','2026-04-11T19:10:27.024Z'::timestamptz),
('c8eaac14-4039-4dfd-8176-82522dca8214'::uuid,'71a6894808a5e5eb72e80c2ae71db374','Route Scheveningen Promenade Run segment after stop 27','2026-04-11T19:10:27.024Z'::timestamptz),
('e772468f-5d15-4251-b4da-59074dc2bf62'::uuid,'75c33575f4164a6d10fa99b180dc354b','Route Scheveningen Promenade Run segment after stop 28','2026-04-11T19:10:27.024Z'::timestamptz),
('17beda24-0c2a-44fb-86aa-05f960cc2099'::uuid,'60920604c46d1bc1e99ac95596cc89e8','Route Scheveningen Promenade Run segment after stop 29','2026-04-11T19:10:27.024Z'::timestamptz),
('58f76c1b-f1a1-4fec-8b06-a11a4959ce38'::uuid,'ee333791e2616e9db95be360c657c2b0','Route Scheveningen Promenade Run segment after stop 30','2026-04-11T19:10:27.024Z'::timestamptz),
('75b47b7b-dc4d-4b82-b4dd-b13ecb7730cd'::uuid,'a0bd216a438f435f4e45eac00f6a9a55','Route Scheveningen Promenade Run segment after stop 31','2026-04-11T19:10:27.024Z'::timestamptz),
('9d24921f-44ad-4eb6-a964-5f463c0b8ec7'::uuid,'6afa001f9338788ca3c81358c5caabf0','Route Scheveningen Promenade Run segment after stop 32','2026-04-11T19:10:27.024Z'::timestamptz),
('5b4fc101-b75f-4261-93ea-8812f44faa82'::uuid,'cf8ca52992dc96bb603400e7f8cefe94','Route Scheveningen Promenade Run segment after stop 33','2026-04-11T19:10:27.024Z'::timestamptz),
('bdda41d0-d030-487f-b57d-8ccf9d440828'::uuid,'abd06453ddf45df1428b55c0b3bec5bb','Route Scheveningen Promenade Run segment after stop 34','2026-04-11T19:10:27.024Z'::timestamptz),
('f317de33-b629-4e65-86ba-9ace468ac77f'::uuid,'9a6a787c842fbcc6e0197e1bc3304465','Route Scheveningen Promenade Run segment after stop 35','2026-04-11T19:10:27.024Z'::timestamptz),
('87ed6443-e9c1-4ede-92f1-5e6ba82bdbc4'::uuid,'5d825df51698095d33d4061d97dde996','Route Scheveningen Promenade Run segment after stop 36','2026-04-11T19:10:27.024Z'::timestamptz),
('5e16ec8a-34c1-448e-a831-f8a6739c1f16'::uuid,'4d14f3977274e7524f10431e25d89a6d','Route Scheveningen Promenade Run segment after stop 37','2026-04-11T19:10:27.024Z'::timestamptz),
('5f19f066-6f63-425d-9174-994a0ef02c47'::uuid,'411abc7d2a71b7b4132998d59b2e9f8c','Route Scheveningen Promenade Run segment after stop 38','2026-04-11T19:10:27.024Z'::timestamptz),
('2be7ee2b-08cc-4f8a-a63d-3ac6d330a66f'::uuid,'1463e13dfd5741154ee1710225651bca','Route Scheveningen Promenade Run segment after stop 39','2026-04-11T19:10:27.024Z'::timestamptz),
('475d99d1-dfb7-41d4-9f9e-002fccd820c8'::uuid,'c595e05356e4438d134444ff9f5905e9','Route Scheveningen Promenade Run segment after stop 40','2026-04-11T19:10:27.024Z'::timestamptz),
('7c804b03-3554-4ed1-8d6d-b4a38b67a73b'::uuid,'a328bb6de32cc37404ceca2a3c4ae738','Route Scheveningen Promenade Run segment after stop 41','2026-04-11T19:10:27.024Z'::timestamptz),
('760374b6-b679-4afc-b64d-92181b290f7e'::uuid,'da65f5b27fa969b0a5d30ad2f9935e00','Route Scheveningen Promenade Run segment after stop 42','2026-04-11T19:10:27.024Z'::timestamptz),
('91c3ecf5-59e8-4eac-b96a-7a2731dba9ee'::uuid,'378a546c3f17c52680f27eee61452815','Route Scheveningen Promenade Run segment after stop 43','2026-04-11T19:10:27.024Z'::timestamptz),
('4562e455-13a5-4fe7-8e25-a2ec58be0d4a'::uuid,'df71f21483bc8e82638dd9d6e26c149a','Route Scheveningen Promenade Run segment after stop 44','2026-04-11T19:10:27.024Z'::timestamptz),
('7fb0172e-1472-489e-a929-08d2e457d6f4'::uuid,'df899c4f2a5bb08c4097f67003bc76c7','Route Scheveningen Promenade Run segment after stop 45','2026-04-11T19:10:27.024Z'::timestamptz),
('713b4eee-ffb4-4fb0-b505-4a562bdd5eb2'::uuid,'9b97e284afbe7de9ad21f9eca839abf3','Route Scheveningen Promenade Run segment after stop 46','2026-04-11T19:10:27.024Z'::timestamptz),
('12d76cb0-0963-41fa-8424-fe4f2dcb008c'::uuid,'47bccbfd01d53cef0364c50599468f90','Route Scheveningen Promenade Run segment after stop 47','2026-04-11T19:10:27.024Z'::timestamptz),
('50803958-526e-4b4f-8a34-657ebe6d3d00'::uuid,'bcb4e8b069671b63a7a9856858f0fb43','Route Scheveningen Promenade Run segment after stop 48','2026-04-11T19:10:27.024Z'::timestamptz),
('9a6f8e38-6660-4ad5-a56a-5ff5c1a3c6c6'::uuid,'fb885237d647a8d10b2bd1c46499ab2d','Route Scheveningen Promenade Run segment after stop 49','2026-04-11T19:10:27.024Z'::timestamptz),
('7bc6fc15-7a57-493b-a658-cc2fdb9a2a08'::uuid,'258fd9b1bf466c0d10bbd29bba49926b','Route Scheveningen Promenade Run segment after stop 50','2026-04-11T19:10:27.024Z'::timestamptz),
('f7d9751c-ee0a-4344-8d2f-54894b5dc6ef'::uuid,'795adf886fc4267a78c9016b8fde4e25','Route Scheveningen Promenade Run segment after stop 51','2026-04-11T19:10:27.024Z'::timestamptz),
('43f43a24-3de1-43c4-b895-94bdc84a8b95'::uuid,'a1fe0e285cd5a45c69997f8625a79993','Route Scheveningen Promenade Run segment after stop 52','2026-04-11T19:10:27.024Z'::timestamptz),
('4fe372c5-8b3f-4af3-b6c6-0adac097e874'::uuid,'0dc4b69d421ecc81c3b8efb1ff1fd6b5','Route Scheveningen Promenade Run segment after stop 53','2026-04-11T19:10:27.024Z'::timestamptz),
('075b3c0b-115c-48ee-88d7-5faadb207c76'::uuid,'8d2f94b54fec73b16b82dcfbbba7a18d','Route Scheveningen Promenade Run segment after stop 54','2026-04-11T19:10:27.024Z'::timestamptz),
('8f6bba15-574a-41c7-9677-04e939b6cf0c'::uuid,'833924eea0aafd5a46554b12ebc04da7','Route Scheveningen Promenade Run segment after stop 55','2026-04-11T19:10:27.024Z'::timestamptz),
('c3f6b239-8470-4a92-9493-73e3fe6919b6'::uuid,'eb78101e6294d608a4604aa0a9fb1154','Route Scheveningen Promenade Run segment after stop 56','2026-04-11T19:10:27.024Z'::timestamptz),
('c3547e8c-55cb-4a16-9f3d-59633ae8efec'::uuid,'86921d3cdb52ccbf11026bdb70cda9ed','Route Scheveningen Promenade Run segment after stop 57','2026-04-11T19:10:27.024Z'::timestamptz),
('29ba50cd-502c-446a-9dcc-f6d05f471cdb'::uuid,'f3683302a8f3b0a797001e74670b273b','Route Scheveningen Promenade Run segment after stop 58','2026-04-11T19:10:27.024Z'::timestamptz),
('554935dc-11a4-4f3d-a6f8-4f729ba8262d'::uuid,'cc9beb98835ec8d3a11c0b45ca2d97ca','Route Scheveningen Promenade Run segment after stop 59','2026-04-11T19:10:27.024Z'::timestamptz),
('20f7bcca-344a-4aad-b403-26912bbb3334'::uuid,'92900524f5a0c3c4f06e9f903f5f0633','Route Scheveningen Promenade Run segment after stop 60','2026-04-11T19:10:27.024Z'::timestamptz),
('c9f78ac8-991e-415c-a328-62a1ac3994ef'::uuid,'b9f10b4eaaa209317c02a3a6ba186ece','Route Scheveningen Promenade Run segment after stop 61','2026-04-11T19:10:27.024Z'::timestamptz),
('f2c57708-a139-441b-9e16-96fb7fd82cf1'::uuid,'8cf82abdb5d24d470db8e468daa6cc36','Route Scheveningen Promenade Run segment after stop 62','2026-04-11T19:10:27.024Z'::timestamptz),
('23808909-c52c-459e-8638-6a854460ca5d'::uuid,'c829c42763fd48069f7fb89e1261b9f4','Route Scheveningen Promenade Run segment after stop 63','2026-04-11T19:10:27.024Z'::timestamptz),
('90331b6e-1083-413a-93cf-3bd3a2a4befb'::uuid,'0fc8506bcde69c084af5f89a0760ac56','Route Scheveningen Promenade Run segment after stop 64','2026-04-11T19:10:27.024Z'::timestamptz),
('a0d6c680-6b7d-4029-8aac-81396ec92df6'::uuid,'b32f7cafaf0dacf107fd58a1b9ad46d7','Route Scheveningen Promenade Run segment after stop 65','2026-04-11T19:10:27.024Z'::timestamptz),
('e1ab2002-0df4-4909-947b-0dc2c64e4ee7'::uuid,'4b9437069c62a83987fe04432d5b240a','Route Scheveningen Promenade Run segment after stop 66','2026-04-11T19:10:27.024Z'::timestamptz),
('7b0b7c35-eb89-43e2-9ee5-2af99215c51f'::uuid,'db8fcc026ed7cea8d4572113b7b775f6','Route Scheveningen Promenade Run segment after stop 67','2026-04-11T19:10:27.024Z'::timestamptz),
('77a8fcbf-12b2-45e7-9fdc-d1e6927ec9d8'::uuid,'75d7173007047b05c8d7a72a0741d69e','Route Scheveningen Promenade Run segment after stop 68','2026-04-11T19:10:27.024Z'::timestamptz),
('fcf81fb5-fe08-4e47-ac9b-95bd779f7f04'::uuid,'7ac2618c064b5b76f18520272933008d','Route Scheveningen Promenade Run segment after stop 69','2026-04-11T19:10:27.024Z'::timestamptz),
('7a2a80e2-8ec9-4528-b462-5e550da818ed'::uuid,'211e329278a81077dcc159fb615e07fe','Route Scheveningen Promenade Run segment after stop 70','2026-04-11T19:10:27.024Z'::timestamptz),
('68626672-a97b-48a8-9488-efe3d63e40e2'::uuid,'d2d37ff87ba9023741805e69965270b8','Route Scheveningen Promenade Run segment after stop 71','2026-04-11T19:10:27.024Z'::timestamptz),
('f62bb7ce-08e4-452d-8113-e6636bdccd63'::uuid,'f7fdd88c0eae7b7b06f4ece0dcd2d7ab','Route Scheveningen Promenade Run segment after stop 72','2026-04-11T19:10:27.024Z'::timestamptz),
('5b8ca331-bbc3-42df-b806-0c3c1ba62321'::uuid,'e53a4cdba9d7b71ccb6ce7d90012e70f','Route Scheveningen Promenade Run segment after stop 73','2026-04-11T19:10:27.024Z'::timestamptz),
('4658add9-f226-4e40-a171-79783c9fb51b'::uuid,'f0ede38fad2dc48df0833f136609f980','Route Scheveningen Promenade Run segment after stop 74','2026-04-11T19:10:27.024Z'::timestamptz),
('5b945d5d-2712-4848-bc73-1b2583da0c52'::uuid,'8d2fd058c5fa5bfb5c60c65e8d0ead7f','Route Scheveningen Promenade Run segment after stop 75','2026-04-11T19:10:27.024Z'::timestamptz),
('e5602562-9faf-4b35-8b3a-ae0ee402c77f'::uuid,'f7b9978a69fadecd550f1071e4addad9','Route Scheveningen Promenade Run segment after stop 76','2026-04-11T19:10:27.024Z'::timestamptz),
('d4025af8-7f93-4c6a-93c0-2371577a2f39'::uuid,'a6f7336ec007a03ce1d3f569961090b0','Route Scheveningen Promenade Run segment after stop 77','2026-04-11T19:10:27.024Z'::timestamptz),
('b7696f77-07ff-4dbb-89e5-a4cfd9e506f2'::uuid,'f9a723be0909fb69cd6131425de1f9b1','Route Scheveningen Promenade Run segment after stop 78','2026-04-11T19:10:27.024Z'::timestamptz),
('b2981fa5-9474-4d29-ac83-a63b4d5ad271'::uuid,'35a63a3da050a57ec529a0d8ff1139df','Route Scheveningen Promenade Run segment after stop 79','2026-04-11T19:10:27.024Z'::timestamptz);
-- Fingerprint all original evidence; audit baselines include all pre-existing audit IDs.
CREATE TEMP TABLE geography_existing_audit_ids ON COMMIT DROP AS SELECT id FROM public.platform_audit_record;
CREATE FUNCTION pg_temp.geography_protected_fingerprints() RETURNS TABLE(entity text,fingerprint text)
LANGUAGE plpgsql AS $$ DECLARE r record; filter_clause text; BEGIN
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN('r','p') AND (
  c.relname IN('campaign','campaign_zone','campaign_hot_zone','route','route_stop','campaign_assignment','rider_route','ride_session','route_tracking','zone_visit','reward_transactions','platform_audit_record')
  OR c.relname LIKE 'ride_reward_%' OR c.relname LIKE 'ride_time_%' OR c.relname LIKE 'wallet_%') ORDER BY c.relname
 LOOP
  filter_clause:=CASE WHEN r.relname='campaign_zone' THEN ' WHERE campaign_id<>''34a54a90-a399-46b7-b446-9d4e57db0759''::uuid'
   WHEN r.relname='platform_audit_record' THEN ' WHERE id IN(SELECT id FROM geography_existing_audit_ids)' ELSE '' END;
  entity:=r.relname;
  EXECUTE format('SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY to_jsonb(t)::text),'''')) FROM public.%I t%s',r.relname,filter_clause) INTO fingerprint;
  RETURN NEXT;
 END LOOP;
END $$;
CREATE TEMP TABLE geography_protected_before ON COMMIT DROP AS SELECT * FROM pg_temp.geography_protected_fingerprints();

DO $$ DECLARE n integer; actual_state jsonb; before_hash text; after_hash text; BEGIN
 IF (SELECT lifecycle_status::text FROM public.campaign WHERE id='34a54a90-a399-46b7-b446-9d4e57db0759') IS DISTINCT FROM 'completed' THEN
  RAISE EXCEPTION 'Campaign is no longer completed'; END IF;
 IF (SELECT count(*) FROM public.campaign_zone WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759')<>80
  OR (SELECT count(*) FROM public.campaign_zone WHERE campaign_id<>'34a54a90-a399-46b7-b446-9d4e57db0759')<>56 THEN
  RAISE EXCEPTION 'Zone population changed; re-review the operation'; END IF;
 IF (SELECT count(*) FROM public.campaign)<>3 THEN RAISE EXCEPTION 'Campaign baseline changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.route WHERE id='839cb18b-c452-49c5-832a-1d8d6acbe79b' AND campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759' AND status='pending')
  OR (SELECT count(*) FROM public.route WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759')<>1
  OR (SELECT count(*) FROM public.route_stop WHERE route_id='839cb18b-c452-49c5-832a-1d8d6acbe79b')<>81 THEN RAISE EXCEPTION 'Route or stop baseline changed'; END IF;
 IF (SELECT count(*) FROM public.campaign_assignment WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759')<>1
  OR NOT EXISTS(SELECT 1 FROM public.campaign_assignment WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759' AND status='assigned')
  OR (SELECT count(*) FROM public.rider_route WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759')<>1
  OR NOT EXISTS(SELECT 1 FROM public.rider_route WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759' AND status='completed') THEN
  RAISE EXCEPTION 'Assignment baseline changed; do not silently revoke or alter it'; END IF;
 IF EXISTS(SELECT 1 FROM public.ride_session WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759' OR route_id='839cb18b-c452-49c5-832a-1d8d6acbe79b')
  OR EXISTS(SELECT 1 FROM public.route_tracking WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759' OR route_id='839cb18b-c452-49c5-832a-1d8d6acbe79b')
  OR EXISTS(SELECT 1 FROM public.reward_transactions WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759')
  OR EXISTS(SELECT 1 FROM public.zone_visit WHERE campaign_zone_id IN(SELECT id FROM geography_retirement_targets))
  OR EXISTS(SELECT 1 FROM public.campaign_hot_zone WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759') THEN
  RAISE EXCEPTION 'Ride, reward, zone-visit or Hot Zone baseline changed; re-review'; END IF;
 SELECT count(*) INTO n FROM geography_retirement_targets e JOIN public.campaign_zone z USING(id)
 WHERE z.campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759' AND md5(public.ST_AsEWKB(z.geom))=e.geometry_md5
  AND z.name IS NOT DISTINCT FROM e.original_name AND z.created_at=e.original_created_at AND z.retired_at IS NOT NULL AND z.retirement_operation_id='2eabec27-003b-47a4-99a8-8d0090000cfe';
 IF n<>80 THEN RAISE EXCEPTION 'Original IDs, hashes, names, timestamps or retirement baseline changed'; END IF;
 actual_state:=public.get_campaign_geography('34a54a90-a399-46b7-b446-9d4e57db0759');
 IF actual_state->>'state'<>'retired' THEN RAISE EXCEPTION 'Current-area state drift'; END IF;
 SELECT md5(string_agg((to_jsonb(z)-ARRAY['retired_at','retirement_reason','retirement_operation_id'])::text,'' ORDER BY z.id))
 INTO before_hash FROM public.campaign_zone z JOIN geography_retirement_targets e USING(id);
 UPDATE public.campaign_zone z SET retired_at=NULL,retirement_reason=NULL,retirement_operation_id=NULL FROM geography_retirement_targets e
 WHERE z.id=e.id AND z.campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759' AND md5(public.ST_AsEWKB(z.geom))=e.geometry_md5;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>80 THEN RAISE EXCEPTION 'Expected exactly 80 metadata updates, got %',n; END IF;
 SELECT md5(string_agg((to_jsonb(z)-ARRAY['retired_at','retirement_reason','retirement_operation_id'])::text,'' ORDER BY z.id))
 INTO after_hash FROM public.campaign_zone z JOIN geography_retirement_targets e USING(id);
 IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'Original geographic evidence changed'; END IF;
 IF EXISTS((SELECT * FROM geography_protected_before EXCEPT SELECT * FROM pg_temp.geography_protected_fingerprints())
  UNION ALL (SELECT * FROM pg_temp.geography_protected_fingerprints() EXCEPT SELECT * FROM geography_protected_before)) THEN
  RAISE EXCEPTION 'Unrelated campaigns, geography, relationships, historical evidence, rewards or pre-existing audit records changed'; END IF;
 actual_state:=public.get_campaign_geography('34a54a90-a399-46b7-b446-9d4e57db0759');
 IF actual_state->>'state'<>'available' OR jsonb_array_length(actual_state->'zones')<>80
  OR (actual_state->>'retiredCount')::int<>0 THEN RAISE EXCEPTION 'Retirement read contract failed'; END IF;
 IF (SELECT count(*) FROM public.campaign_zone_geojson WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759')<>80
  OR (SELECT count(*) FROM public.campaign_zone_history_geojson WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759')<>80 THEN
  RAISE EXCEPTION 'Current/historical projections disagree'; END IF;
 IF (SELECT count(*) FROM public.platform_audit_record WHERE id NOT IN(SELECT id FROM geography_existing_audit_ids)
   AND correlation_id='2eabec27-003b-47a4-99a8-8d0090000cfe' AND target_entity_type='campaign_zone' AND target_entity_id IN(SELECT id::text FROM geography_retirement_targets))<>80 THEN
  RAISE EXCEPTION 'Expected exactly 80 appended retirement audit records'; END IF;
END $$;
SELECT count(*) AS retained_original_rows,count(*) FILTER(WHERE retired_at IS NULL) AS current_rows,
 count(*) FILTER(WHERE retired_at IS NOT NULL) AS retired_rows FROM public.campaign_zone WHERE campaign_id='34a54a90-a399-46b7-b446-9d4e57db0759';
COMMIT;
RESET movrr.geography_execution;
RESET movrr.geography_actor_id;
