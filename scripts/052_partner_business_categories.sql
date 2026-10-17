-- Authoritative partner business classification. No partner assignments/backfill.
-- Apply after 051; deploy API/Admin only after this migration is approved and applied.
BEGIN;
DO $prerequisites$ BEGIN
 IF to_regprocedure('public.save_organisation_with_partner(uuid,jsonb)') IS NULL OR to_regclass('public.reward_partner_location') IS NULL THEN
  RAISE EXCEPTION 'Apply 051_partner_physical_locations.sql first';
 END IF;
END $prerequisites$;
CREATE TABLE public.partner_business_category (
 code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9-]{0,63}$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120)
);
INSERT INTO public.partner_business_category(code,label) VALUES
 ('restaurant','Restaurant'),('cafe','Café'),('bicycle-shop','Bicycle shop'),
 ('bookstore','Bookstore'),('retail','Retail'),('fitness','Fitness'),
 ('experiences','Experiences'),('accommodation','Accommodation');
ALTER TABLE public.partner_business_category ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_business_category FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.partner_business_category TO service_role;
ALTER TABLE public.reward_partner ADD COLUMN business_category text
 REFERENCES public.partner_business_category(code);
COMMENT ON COLUMN public.reward_partner.business_category IS 'Verified primary business type; null means uncategorized. Independent of rewards.';
-- Existing table policies/grants stay intact. Protect this column even if a legacy
-- table UPDATE grant permits partner self-service on other profile fields.
CREATE FUNCTION public.guard_partner_business_category() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $guard$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.business_category IS NOT DISTINCT FROM OLD.business_category THEN RETURN NEW; END IF;
 ELSIF NEW.business_category IS NULL THEN RETURN NEW;
 END IF;
 IF NOT pg_has_role(current_user,'service_role','MEMBER') THEN
  RAISE EXCEPTION 'Business category requires the Admin service' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION public.guard_partner_business_category() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_partner_business_category BEFORE INSERT OR UPDATE OF business_category
 ON public.reward_partner FOR EACH ROW EXECUTE FUNCTION public.guard_partner_business_category();

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
END $organisation$;
REVOKE ALL ON FUNCTION public.save_organisation_with_partner(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_organisation_with_partner(uuid,jsonb) TO service_role;
COMMIT;
