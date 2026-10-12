-- Additive physical-location capability. No identity backfill or fabricated locations.
BEGIN;
DO $prerequisites$ BEGIN
 IF to_regclass('public.organisation') IS NULL OR to_regclass('public.reward_catalog') IS NULL OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reward_partner' AND column_name='organisation_id') THEN RAISE EXCEPTION 'Apply reward-catalog, 040 and 045 prerequisites first'; END IF;
 IF to_regprocedure('public.platform_rate_limit_hit(text,timestamp with time zone,integer)') IS NULL THEN RAISE EXCEPTION 'Apply atomic rate limiter migration 046 first'; END IF;
END $prerequisites$;
CREATE UNIQUE INDEX IF NOT EXISTS reward_partner_identity_org ON public.reward_partner(id, organisation_id);
CREATE TABLE IF NOT EXISTS public.reward_partner_location (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES public.organisation(id), partner_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), address text NOT NULL CHECK(length(address) BETWEEN 1 AND 500),
 latitude double precision, longitude double precision, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','suspended')),
 verified_at timestamptz, verified_by uuid REFERENCES auth.users(id), created_by uuid NOT NULL REFERENCES auth.users(id), updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(partner_id,organisation_id) REFERENCES public.reward_partner(id,organisation_id),
 CHECK ((latitude IS NULL) = (longitude IS NULL)), CHECK(latitude BETWEEN -90 AND 90), CHECK(longitude BETWEEN -180 AND 180),
 CHECK(status <> 'published' OR (latitude IS NOT NULL AND longitude IS NOT NULL AND verified_at IS NOT NULL AND verified_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS partner_location_discovery ON public.reward_partner_location(latitude,longitude,id) WHERE status='published';
CREATE INDEX IF NOT EXISTS partner_location_org ON public.reward_partner_location(organisation_id,id);
CREATE TABLE IF NOT EXISTS public.reward_catalog_location(location_id uuid NOT NULL REFERENCES public.reward_partner_location(id) ON DELETE CASCADE,catalog_item_id uuid NOT NULL REFERENCES public.reward_catalog(id) ON DELETE CASCADE,PRIMARY KEY(location_id,catalog_item_id));
CREATE TABLE IF NOT EXISTS public.partner_location_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),location_id uuid NOT NULL REFERENCES public.reward_partner_location(id),actor_user_id uuid NOT NULL REFERENCES auth.users(id),correlation_id text NOT NULL,previous_state jsonb,resulting_state jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.reward_partner_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_catalog_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_location_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_partner_location,public.reward_catalog_location,public.partner_location_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.reward_partner_location,public.reward_catalog_location,public.partner_location_audit TO service_role;
-- All publication and association changes are atomic and audited. API authenticates admin first.
CREATE OR REPLACE FUNCTION public.save_partner_location(p_org uuid,p_input jsonb,p_actor uuid,p_correlation text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.save_partner_location(uuid,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_partner_location(uuid,jsonb,uuid,text) TO service_role;

-- Preserve identity: physical-location partners cannot be automatically relinked.
-- Archive uses existing inactive/suspended status. Hard deletion remains RESTRICT;
-- retention/transfer/deletion policy requires explicit product approval.
CREATE OR REPLACE FUNCTION public.save_organisation_with_partner(p_id uuid, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $organisation$
DECLARE v_org public.organisation; v_partner public.reward_partner; v_name text; v_status text;
BEGIN
 IF p_id IS NULL THEN
  INSERT INTO organisation(name,type,status) VALUES(p_input->>'name',p_input->>'type',COALESCE(p_input->>'status','active')) RETURNING * INTO v_org;
 ELSE
  SELECT * INTO v_org FROM organisation WHERE id=p_id FOR UPDATE;
  IF v_org.id IS NULL THEN RETURN NULL; END IF;
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
   logo_url=CASE WHEN p_input->'partnerProfile' ? 'logoUrl' THEN p_input->'partnerProfile'->>'logoUrl' ELSE logo_url END
  WHERE id=v_partner.id RETURNING * INTO v_partner;
 END IF;
 UPDATE organisation SET name=v_name,status=v_status,updated_at=clock_timestamp() WHERE id=v_org.id RETURNING * INTO v_org;
 RETURN jsonb_build_object('organisation',to_jsonb(v_org),'partner',CASE WHEN v_partner.id IS NOT NULL THEN to_jsonb(v_partner) END);
END $organisation$;
REVOKE ALL ON FUNCTION public.save_organisation_with_partner(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_organisation_with_partner(uuid,jsonb) TO service_role;

COMMIT;
