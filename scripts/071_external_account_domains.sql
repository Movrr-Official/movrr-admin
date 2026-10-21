-- Production execution requires explicit approval. Preserve historical enum data.
BEGIN;
-- BEGIN GENERATED ORGANISATION CAPABILITIES
CREATE OR REPLACE FUNCTION public.ops_organisation_capabilities(p_type text,p_role text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $cap$ SELECT coalesce('{"reward_partner":{"owner":["staff.manage","resources.manage","rewards.manage","rewards.catalog.read","fulfilment.validate","fulfilment.confirm","fulfilment.read","fulfilment.cancel","fulfilment.refund","analytics.view"],"manager":["resources.manage","rewards.manage","rewards.catalog.read","fulfilment.validate","fulfilment.confirm","fulfilment.read","fulfilment.cancel","fulfilment.refund","analytics.view"],"partner_operations_manager":["resources.manage","rewards.manage","rewards.catalog.read","fulfilment.validate","fulfilment.confirm","fulfilment.read","fulfilment.cancel","fulfilment.refund","analytics.view","staff.manage"],"staff":["fulfilment.validate","fulfilment.confirm","fulfilment.read","analytics.view","rewards.catalog.read"],"viewer":["fulfilment.read","analytics.view","rewards.catalog.read"]},"advertiser":{"owner":["campaigns.read","campaigns.write","campaigns.launch","campaigns.pause","analytics.view","billing.read","staff.manage","org.settings"],"manager":["campaigns.read","campaigns.write","campaigns.launch","campaigns.pause","analytics.view"],"staff":["campaigns.read","campaigns.write","analytics.view"],"viewer":["campaigns.read","analytics.view"]},"government":{"owner":["programmes.read","compliance.read","impact.read","org.settings","analytics.view","staff.manage"],"viewer":["programmes.read","compliance.read","impact.read","analytics.view"]}}'::jsonb->p_type->p_role,'[]'::jsonb) $cap$;
REVOKE ALL ON FUNCTION public.ops_organisation_capabilities(text,text) FROM PUBLIC,anon,authenticated,service_role;
-- END GENERATED ORGANISATION CAPABILITIES
CREATE OR REPLACE FUNCTION public.account_identity_active(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public."user" u JOIN auth.users a ON a.id=u.id WHERE u.id=p_user AND u.status='active'
 AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now()))
$$;
REVOKE ALL ON FUNCTION public.account_identity_active(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_identity_active(uuid) TO service_role;
-- Historical coarse roles cannot grant live platform authority.
CREATE OR REPLACE FUNCTION public.is_movrr_admin(p_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users s JOIN public."user" u ON u.id=s.user_id JOIN auth.users a ON a.id=u.id
 WHERE u.id=p_uid AND u.status='active' AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now())
 AND public.ops_employee_capabilities(s.role) ? 'users.manage')
$$;
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users s JOIN public."user" u ON u.id=s.user_id JOIN auth.users a ON a.id=u.id
 WHERE u.id=check_user_id AND s.role='super_admin' AND u.status='active' AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now()))
$$;
CREATE OR REPLACE FUNCTION public.account_is_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_identity_active(auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.enforce_user_role_immutable_for_clients() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Historical account classification is immutable; manage explicit memberships' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.shop_authorize(p_actor uuid,p_action text,p_org uuid DEFAULT NULL,p_rider uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; required text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."user" u JOIN auth.users a ON a.id=u.id WHERE u.id=p_actor AND u.status='active'
 AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now())) THEN RAISE EXCEPTION 'Active actor required' USING ERRCODE='42501'; END IF;
 IF p_action IN ('read','redeem') AND EXISTS(SELECT 1 FROM public.rider WHERE id=p_rider AND user_id=p_actor AND status='active') THEN RETURN 'rider'; END IF;
 required:=CASE p_action WHEN 'read' THEN 'fulfilment.read' WHEN 'cancel' THEN 'fulfilment.cancel' WHEN 'refund' THEN 'fulfilment.refund'
  WHEN 'consume' THEN 'fulfilment.validate' WHEN 'collect' THEN 'fulfilment.confirm' WHEN 'adjust' THEN 'fulfilment.override' WHEN 'retry' THEN 'fulfilment.cancel' END;
 SELECT public.ops_employee_capabilities(role) INTO caps FROM public.admin_users WHERE user_id=p_actor;
 IF required IS NOT NULL AND coalesce(caps ? required,false) THEN RETURN 'admin'; END IF;
 IF EXISTS(SELECT 1 FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id
   WHERE m.user_id=p_actor AND m.organisation_id=p_org AND m.status='active' AND o.status='active' AND o.type='reward_partner'
    AND public.ops_organisation_capabilities(o.type,m.role) ? required) THEN RETURN 'organisation'; END IF;
 RAISE EXCEPTION 'Target not authorized' USING ERRCODE='42501';
END $$;
ALTER TABLE public."user" ALTER COLUMN role DROP NOT NULL;
ALTER TABLE public."user" ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.organisation_membership DROP CONSTRAINT IF EXISTS organisation_membership_role_check;
ALTER TABLE public.organisation_membership ADD CONSTRAINT organisation_membership_role_check
 CHECK(role IN ('owner','manager','partner_operations_manager','staff','viewer'));
INSERT INTO public.permission_bundle(key,name) VALUES('org.partner_operations_manager','Partner Operations Manager');
CREATE FUNCTION public.protect_account_security_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'') IN ('anon','authenticated') AND
  (NEW.status IS DISTINCT FROM OLD.status OR NEW.role IS DISTINCT FROM OLD.role OR NEW.email IS DISTINCT FROM OLD.email OR
   NEW.is_verified IS DISTINCT FROM OLD.is_verified OR NEW.email_verified IS DISTINCT FROM OLD.email_verified OR
   NEW.verification_level IS DISTINCT FROM OLD.verification_level) THEN
   RAISE EXCEPTION 'Account security fields require the authorized account command' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_account_security_fields BEFORE UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.protect_account_security_fields();

CREATE TABLE public.external_account_provisioning (
 user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 actor_id uuid NOT NULL REFERENCES auth.users(id), input jsonb NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','ready','complete')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.external_account_provisioning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_account_provisioning FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.change_organisation_membership(p_actor uuid,p_user uuid,p_organisation uuid,p_role text,p_status text,p_expected timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.organisation_membership; result public.organisation_membership; caps jsonb; actor_membership public.organisation_membership; org public.organisation;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organisation::text,71));
 SELECT * INTO org FROM public.organisation WHERE id=p_organisation FOR UPDATE;
 IF org.id IS NULL OR org.status<>'active' OR org.type NOT IN ('reward_partner','advertiser','government') THEN RAISE EXCEPTION 'Active external organisation required'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('owner','manager','partner_operations_manager','staff','viewer') OR p_status IS NULL OR p_status NOT IN ('active','invited','revoked') THEN RAISE EXCEPTION 'Invalid membership contract'; END IF;
 IF jsonb_array_length(public.ops_organisation_capabilities(org.type,p_role))=0 THEN RAISE EXCEPTION 'Role is invalid for the organisation domain'; END IF;
 SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id
 WHERE a.user_id=p_actor AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now());
 SELECT * INTO prior FROM public.organisation_membership WHERE organisation_id=p_organisation AND user_id=p_user FOR UPDATE;
 IF NOT coalesce(caps ? (CASE WHEN p_role='owner' OR prior.role='owner' THEN 'users.role.approve' ELSE 'users.role.assign' END),false) THEN
  SELECT m.* INTO actor_membership FROM public.organisation_membership m JOIN public."user" u ON u.id=m.user_id JOIN auth.users au ON au.id=m.user_id
  WHERE m.organisation_id=p_organisation AND m.user_id=p_actor AND m.role IN ('owner','partner_operations_manager') AND m.status='active'
   AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now());
  IF actor_membership.id IS NULL OR p_role='owner' OR prior.role='owner' THEN RAISE EXCEPTION 'Unauthorized membership change' USING ERRCODE='42501'; END IF;
  IF actor_membership.role='partner_operations_manager' AND (org.type<>'reward_partner' OR p_role NOT IN ('staff','viewer') OR (prior.id IS NOT NULL AND prior.role NOT IN ('staff','viewer'))) THEN
   RAISE EXCEPTION 'Partner Operations Managers may administer only operational staff and viewers' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public."user" u JOIN auth.users a ON a.id=u.id WHERE u.id=p_user AND a.deleted_at IS NULL AND
   ((u.status='active' AND (a.banned_until IS NULL OR a.banned_until<=now())) OR p_status='revoked' OR
    EXISTS(SELECT 1 FROM public.external_account_provisioning r WHERE r.user_id=p_user AND r.actor_id=p_actor AND r.state='reserved' AND
      r.input->>'organisationId'=p_organisation::text AND r.input->>'role'=p_role AND a.banned_until>now()) OR
    EXISTS(SELECT 1 FROM public.product_provisioning r JOIN public.advertiser ad ON ad.user_id=r.user_id WHERE r.user_id=p_user AND r.actor_id=p_actor
      AND r.state='reserved' AND r.input->>'role'='advertiser' AND ad.organisation_id=p_organisation AND p_role='owner' AND a.banned_until>now()))) THEN RAISE EXCEPTION 'Active target account required'; END IF;
 IF prior.id IS NOT NULL THEN
  IF prior.role=p_role AND prior.status=p_status THEN RETURN to_jsonb(prior); END IF;
  IF p_expected IS NULL OR prior.updated_at<>p_expected THEN RAISE EXCEPTION 'Stale membership command; reload before changing access' USING ERRCODE='40001'; END IF;
  IF prior.role='owner' AND prior.status='active' AND (p_role<>'owner' OR p_status<>'active') AND NOT EXISTS(
   SELECT 1 FROM public.organisation_membership m JOIN public."user" u ON u.id=m.user_id JOIN auth.users a ON a.id=m.user_id
   WHERE m.organisation_id=p_organisation AND m.user_id<>p_user AND m.role='owner' AND m.status='active' AND u.status='active'
    AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now())) THEN RAISE EXCEPTION 'Cannot remove last active organisation owner'; END IF;
  UPDATE public.organisation_membership SET role=p_role,bundle_key='org.'||p_role,status=p_status,updated_at=clock_timestamp() WHERE id=prior.id RETURNING * INTO result;
 ELSE
  IF p_expected IS NOT NULL OR p_status='revoked' THEN RAISE EXCEPTION 'Membership not found'; END IF;
  INSERT INTO public.organisation_membership(organisation_id,user_id,role,bundle_key,status) VALUES(p_organisation,p_user,p_role,'org.'||p_role,p_status) RETURNING * INTO result;
 END IF;
 -- Any changed grant invalidates outstanding invitations for its prior version.
 -- Acceptance marks its own receipt accepted in the same transaction first.
 UPDATE public.platform_invitations SET status='revoked',revoked_at=now(),revoked_by=p_actor,updated_at=now()
 WHERE scope='organisation' AND status='pending' AND metadata->>'membershipId'=result.id::text;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(p_actor,CASE WHEN actor_membership.id IS NULL THEN 'admin' ELSE 'organisation' END,
  CASE WHEN actor_membership.id IS NOT NULL THEN 'staff.manage' WHEN p_role='owner' OR prior.role='owner' THEN 'users.role.approve' ELSE 'users.role.assign' END,
  'organisation_membership',result.id::text,to_jsonb(prior),to_jsonb(result),gen_random_uuid()::text,'organisation_membership.change');
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.change_organisation_membership(uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.change_organisation_membership(uuid,uuid,uuid,text,text,timestamptz) TO service_role;

CREATE FUNCTION public.provision_external_account(p_actor uuid,p_input jsonb,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.external_account_provisioning; caps jsonb; org public.organisation; membership public.organisation_membership; desired text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id
 WHERE a.user_id=p_actor AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now());
 IF NOT coalesce(caps ? 'users.manage',false) OR NOT coalesce(caps ? (CASE WHEN p_input->>'role'='owner' THEN 'users.role.approve' ELSE 'users.role.assign' END),false) THEN RAISE EXCEPTION 'Unauthorized external provisioning' USING ERRCODE='42501'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN
   ('domain','organisationId','role','email','name','status','isVerified','languagePreference','phone','accountNotes','membershipStatus')) OR
   coalesce(p_input->>'domain','') NOT IN ('partner','advertiser','government') OR coalesce(p_input->>'role','') NOT IN ('owner','manager','partner_operations_manager','staff','viewer') OR
   coalesce(p_input->>'membershipStatus','') NOT IN ('active','invited') OR coalesce(p_input->>'status','') NOT IN ('active','inactive','pending') OR coalesce(btrim(p_input->>'name'),'')='' OR
   coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_input->>'email'<>lower(btrim(p_input->>'email')) OR
   coalesce(p_phase,'') NOT IN ('reserve','persist','complete') THEN RAISE EXCEPTION 'Invalid external provisioning contract'; END IF;
 SELECT * INTO org FROM public.organisation WHERE id=(p_input->>'organisationId')::uuid FOR UPDATE;
 IF org.id IS NULL OR org.status<>'active' OR org.type<>(CASE WHEN p_input->>'domain'='partner' THEN 'reward_partner' ELSE p_input->>'domain' END) THEN RAISE EXCEPTION 'Organisation does not match account domain'; END IF;
 IF jsonb_array_length(public.ops_organisation_capabilities(org.type,p_input->>'role'))=0 THEN RAISE EXCEPTION 'Role is invalid for the organisation domain'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_input->>'email',68));
 SELECT * INTO r FROM public.external_account_provisioning WHERE email=p_input->>'email' FOR UPDATE;
 IF r.user_id IS NULL THEN
  IF p_phase<>'reserve' OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_input->>'email') OR
   EXISTS(SELECT 1 FROM public.employee_provisioning WHERE email=p_input->>'email') OR EXISTS(SELECT 1 FROM public.product_provisioning WHERE email=p_input->>'email') THEN RAISE EXCEPTION 'Existing account or reservation; use explicit membership assignment'; END IF;
  INSERT INTO public.external_account_provisioning(email,actor_id,input) VALUES(p_input->>'email',p_actor,p_input) RETURNING * INTO r;
 END IF;
 IF r.actor_id<>p_actor OR r.input<>p_input THEN RAISE EXCEPTION 'Conflicting provisioning retry'; END IF;
 desired:=CASE WHEN p_input->>'status'='inactive' THEN 'suspended' ELSE p_input->>'status' END;
 IF r.state IN ('ready','complete') THEN
  SELECT * INTO membership FROM public.organisation_membership WHERE user_id=r.user_id AND organisation_id=org.id;
  IF membership.id IS NULL OR membership.role<>p_input->>'role' OR membership.status<>(CASE WHEN desired='active' THEN p_input->>'membershipStatus' ELSE 'invited' END) OR
    NOT EXISTS(SELECT 1 FROM public."user" WHERE id=r.user_id AND status::text=desired) THEN RAISE EXCEPTION 'Provisioned access changed; retry cannot restore revoked access'; END IF;
 END IF;
 IF p_phase='persist' AND r.state='reserved' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=r.user_id AND lower(email)=r.email AND banned_until>now() AND raw_app_meta_data->>'external_account_provisioning_id'=r.user_id::text) OR
   EXISTS(SELECT 1 FROM public.rider WHERE user_id=r.user_id) OR EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=r.user_id) THEN RAISE EXCEPTION 'Owned banned external identity required'; END IF;
  PERFORM public.change_organisation_membership(p_actor,r.user_id,org.id,p_input->>'role',CASE WHEN desired='active' THEN p_input->>'membershipStatus' ELSE 'invited' END);
  UPDATE public."user" SET name=p_input->>'name',phone=p_input->>'phone',language_preference=p_input->>'languagePreference',
   account_notes=p_input->>'accountNotes',is_verified=(p_input->>'isVerified')::boolean,status=desired::public.user_status,updated_at=now() WHERE id=r.user_id AND status='pending' AND role IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending external identity required'; END IF;
  UPDATE public.external_account_provisioning SET state='ready',updated_at=now() WHERE user_id=r.user_id RETURNING * INTO r;
 ELSIF p_phase='complete' AND r.state='ready' THEN
  IF desired='active' AND EXISTS(SELECT 1 FROM auth.users WHERE id=r.user_id AND banned_until>now()) THEN RAISE EXCEPTION 'Auth activation pending'; END IF;
  UPDATE public.external_account_provisioning SET state='complete',updated_at=now() WHERE user_id=r.user_id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('user_id',r.user_id,'state',r.state);
END $$;
REVOKE ALL ON FUNCTION public.provision_external_account(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_external_account(uuid,jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_employee_auth_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE r public.employee_provisioning; product public.product_provisioning;
BEGIN
  IF EXISTS(SELECT 1 FROM public.external_account_provisioning WHERE user_id=NEW.id) THEN
    IF NOT EXISTS(SELECT 1 FROM public.external_account_provisioning WHERE user_id=NEW.id AND email=lower(NEW.email) AND state='reserved') THEN
      RAISE EXCEPTION 'Invalid external account reservation'; END IF;
    NEW.banned_until:=now()+interval '100 years';
    NEW.raw_app_meta_data:=coalesce(NEW.raw_app_meta_data,'{}') || jsonb_build_object('external_account_provisioning_id',NEW.id::text);
    NEW.raw_user_meta_data:=jsonb_build_object('full_name',(SELECT input->>'name' FROM public.external_account_provisioning WHERE user_id=NEW.id));
    RETURN NEW;
  ELSIF coalesce(NEW.raw_app_meta_data,'{}') ? 'external_account_provisioning_id' THEN
    RAISE EXCEPTION 'External provisioning marker without reservation';
  END IF;
  -- GoTrue can apply custom app_metadata AFTER inserting auth.users. Resolve the
  -- already-committed intent by UUID, not by insertion-time metadata timing.
  SELECT * INTO r FROM public.employee_provisioning WHERE user_id=NEW.id;
  IF r.user_id IS NOT NULL THEN
    IF r.state<>'reserved' OR r.email<>lower(NEW.email) THEN
      RAISE EXCEPTION 'Invalid employee provisioning reservation';
    END IF;
    NEW.banned_until := now()+interval '100 years';
    NEW.raw_app_meta_data:=coalesce(NEW.raw_app_meta_data,'{}') || jsonb_build_object('employee_provisioning_id',NEW.id::text);
    NEW.raw_user_meta_data := coalesce(NEW.raw_user_meta_data,'{}') || jsonb_strip_nulls(jsonb_build_object(
      'full_name',r.input->>'name','phone',r.input->>'phone'));
  ELSE
    SELECT * INTO product FROM public.product_provisioning WHERE user_id=NEW.id;
    IF product.user_id IS NOT NULL THEN
      IF product.input->>'role' NOT IN ('rider','advertiser') OR product.state<>'reserved' OR product.email<>lower(NEW.email) THEN
        RAISE EXCEPTION 'Invalid product provisioning reservation';
      END IF;
      NEW.banned_until:=now()+interval '100 years';
      NEW.raw_app_meta_data:=coalesce(NEW.raw_app_meta_data,'{}') || jsonb_build_object('admin_product_provisioning',
        jsonb_build_object('actor',product.actor_id::text,'fingerprint',product.fingerprint));
      NEW.raw_user_meta_data:=coalesce(NEW.raw_user_meta_data,'{}') || jsonb_strip_nulls(jsonb_build_object(
        'full_name',product.input->>'name',
        'phone',product.input->>'phone','city',product.input->>'city','country',product.input->>'country',
        'companyName',product.input->'advertiserProfile'->>'companyName','language',product.input->>'languagePreference',
        'timezone',product.input->'advertiserProfile'->>'timezone'));
    ELSIF NEW.raw_app_meta_data ?| ARRAY['employee_provisioning_id','admin_product_provisioning'] THEN
      RAISE EXCEPTION 'Provisioning marker without a reservation';
    ELSIF coalesce(NEW.raw_user_meta_data,'{}') ? 'server_assigned_role' AND
       coalesce(NEW.raw_user_meta_data->>'server_assigned_role','') <>'rider' THEN
      RAISE EXCEPTION 'Operational account roles require authorized employee provisioning';
    END IF;
  END IF;
  RETURN NEW;
END $body$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _account_type public.user_role := 'rider';
  _user_id uuid := new.id;
  _lang text := 'en';
  _tz text := 'UTC';
  _meta jsonb := coalesce(new.raw_user_meta_data::jsonb, '{}'::jsonb);
  _name text;
  _avatar text;
  _company_name text;
begin
  -- Account classification is independent of employee authority. No metadata
  -- enum cast, alias mapping, or catch-all Rider fallback is executable.
  IF EXISTS(SELECT 1 FROM public.external_account_provisioning WHERE user_id=new.id) THEN
    _account_type := NULL;
  ELSIF EXISTS(SELECT 1 FROM public.employee_provisioning WHERE user_id=new.id) THEN
    _account_type := NULL;
  ELSIF EXISTS(SELECT 1 FROM public.product_provisioning WHERE user_id=new.id AND input->>'role'='advertiser') THEN
    _account_type := 'advertiser';
  ELSIF coalesce(_meta->>'server_assigned_role','rider')<>'rider' THEN
    RAISE EXCEPTION 'Account kind requires an authorized provisioning reservation';
  END IF;

  _name := coalesce(nullif(_meta->>'full_name', ''), new.email, '');
  _avatar := coalesce(
    nullif(_meta->>'avatar_url', ''),
    nullif(_meta->>'avatarUrl', ''),
    nullif(_meta->>'avatarurl', '')
  );

  insert into public."user" (
    id,
    email,
    name,
    phone,
    organization,
    avatar_url,
    role,
    status,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    _name,
    nullif(_meta->>'phone', ''),
    null,
    _avatar,
    _account_type,
    CASE WHEN EXISTS(SELECT 1 FROM public.external_account_provisioning WHERE user_id=new.id) OR EXISTS(SELECT 1 FROM public.employee_provisioning WHERE user_id=new.id) OR EXISTS(SELECT 1 FROM public.product_provisioning WHERE user_id=new.id) THEN 'pending'::public.user_status ELSE 'active'::public.user_status END,
    now(),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      name = case
        when coalesce(public."user".name, '') = '' then excluded.name
        else public."user".name
      end,
      phone = coalesce(public."user".phone, excluded.phone),
      avatar_url = coalesce(public."user".avatar_url, excluded.avatar_url),
      role = public."user".role,
      updated_at = now();

  if _account_type = 'rider' then
    insert into public.rider (
      user_id,
      status,
      created_at,
      phone,
      city,
      country
    )
    values (
      _user_id,
      CASE WHEN EXISTS(SELECT 1 FROM public.product_provisioning WHERE user_id=new.id) THEN 'inactive'::public.rider_status ELSE 'active'::public.rider_status END,
      now(),
      nullif(_meta->>'phone', ''),
      nullif(_meta->>'city', ''),
      nullif(_meta->>'country', '')
    )
    on conflict (user_id) do update
    set phone = coalesce(public.rider.phone, excluded.phone),
        city = coalesce(public.rider.city, excluded.city),
        country = coalesce(public.rider.country, excluded.country);
  end if;

  if _account_type = 'advertiser' then
    _lang := coalesce(nullif(_meta->>'language', ''), 'en');
    _tz := coalesce(nullif(_meta->>'timezone', ''), 'UTC');
    _company_name := nullif(_meta->>'companyName', '');

    insert into public.advertiser (
      user_id,
      company_name,
      language,
      timezone,
      created_at
    )
    values (
      _user_id,
      _company_name,
      _lang,
      _tz,
      now()
    )
    on conflict (user_id) do update
    set company_name = coalesce(public.advertiser.company_name, excluded.company_name),
        language = coalesce(public.advertiser.language, excluded.language),
        timezone = coalesce(public.advertiser.timezone, excluded.timezone);
  end if;

  return null;
exception
  when others then
    raise log 'handle_new_user failed for auth.users.id=% email=% error=%',
      new.id, new.email, sqlerrm;
    raise;
end;
$function$;


CREATE OR REPLACE FUNCTION public.provision_product(p_actor uuid,p_id uuid,p_input jsonb,p_fingerprint text,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; identity auth.users; journal jsonb; requested text:=p_input->>'role'; required text; reservation public.product_provisioning; org_id uuid;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(70001,1);
  required:=CASE WHEN p_input ? 'waitlistId' THEN 'waitlist.manage' WHEN requested='advertiser' THEN 'advertisers.manage' ELSE 'users.manage' END;
  SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=u.id
    WHERE a.user_id=p_actor AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now());
  IF NOT coalesce(caps ? required,false) THEN RAISE EXCEPTION 'Unauthorized product provisioning' USING ERRCODE='42501'; END IF;
  IF requested='advertiser' AND NOT coalesce(caps ? 'users.role.approve',false) THEN RAISE EXCEPTION 'Organisation ownership approval required' USING ERRCODE='42501'; END IF;
  IF requested IS NULL OR requested NOT IN ('rider','advertiser') OR p_input->>'status' IS NULL
    OR p_input->>'status' NOT IN ('active','inactive','pending') OR coalesce(btrim(p_input->>'name'),'')=''
    OR coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_input->>'email'<>lower(btrim(p_input->>'email')) OR length(p_fingerprint)<>64
    OR (requested='advertiser' AND (p_input->'advertiserProfile'->>'companyName' IS NULL OR p_input ? 'waitlistId'))
    OR (requested='rider' AND p_input ? 'advertiserProfile') OR p_input ?| ARRAY['organisationId','bundleKey','membershipRole'] THEN
    RAISE EXCEPTION 'Invalid product provisioning contract';
  END IF;
  IF p_phase IS NULL OR p_phase NOT IN ('validate','persist','complete') THEN RAISE EXCEPTION 'Invalid provisioning phase'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_input->>'email',68));
  IF EXISTS(SELECT 1 FROM public.external_account_provisioning WHERE email=p_input->>'email') OR
     EXISTS(SELECT 1 FROM public.employee_provisioning WHERE email=p_input->>'email') THEN RAISE EXCEPTION 'Email already reserved in another account domain'; END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_input->>'email' AND id<>p_id) THEN
    RAISE EXCEPTION 'Email belongs to an existing account; use its authorized update workflow';
  END IF;
  IF p_input ? 'waitlistId' THEN
    PERFORM 1 FROM public.waitlist WHERE id=(p_input->>'waitlistId')::uuid AND lower(email)=p_input->>'email' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Waitlist identity mismatch'; END IF;
  END IF;
  SELECT * INTO reservation FROM public.product_provisioning WHERE user_id=p_id FOR UPDATE;
  IF reservation.user_id IS NULL THEN
    IF p_phase<>'validate' OR EXISTS(SELECT 1 FROM auth.users WHERE id=p_id) THEN RAISE EXCEPTION 'Product reservation required'; END IF;
    INSERT INTO public.product_provisioning(user_id,email,actor_id,input,fingerprint)
      VALUES(p_id,p_input->>'email',p_actor,p_input,p_fingerprint) RETURNING * INTO reservation;
  END IF;
  IF reservation.actor_id<>p_actor OR reservation.input<>p_input OR reservation.fingerprint<>p_fingerprint THEN
    RAISE EXCEPTION 'Conflicting product provisioning request';
  END IF;
  SELECT * INTO identity FROM auth.users WHERE id=p_id FOR UPDATE;
  journal:=identity.raw_app_meta_data->'admin_product_provisioning';
  IF identity.id IS NOT NULL AND (journal IS NULL OR journal->>'fingerprint' IS DISTINCT FROM p_fingerprint
      OR journal->>'actor' IS DISTINCT FROM p_actor::text) THEN
    RAISE EXCEPTION 'Conflicting product provisioning request';
  END IF;
  IF reservation.state IN ('ready','complete') THEN
    IF requested='advertiser' AND NOT EXISTS(SELECT 1 FROM public.advertiser a JOIN public.organisation_membership m ON m.organisation_id=a.organisation_id AND m.user_id=a.user_id
       WHERE a.user_id=p_id AND m.role='owner' AND m.status=(CASE WHEN p_input->>'status'='active' THEN 'active' ELSE 'invited' END)) THEN
      RAISE EXCEPTION 'Provisioned advertiser membership changed; retry cannot restore access'; END IF;
    IF requested='rider' AND NOT EXISTS(SELECT 1 FROM public.rider WHERE user_id=p_id AND status::text=(CASE WHEN p_input->>'status'='active' THEN 'active' ELSE 'inactive' END)) THEN
      RAISE EXCEPTION 'Provisioned Rider access changed; retry cannot restore access'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public."user" WHERE id=p_id AND email=p_input->>'email' AND role::text=requested AND status::text=
      CASE WHEN p_input->>'status'='inactive' THEN 'suspended' ELSE p_input->>'status' END) THEN
      RAISE EXCEPTION 'Provisioned product account changed; do not reactivate automatically';
    END IF;
  END IF;
  IF p_phase='validate' THEN RETURN jsonb_build_object('id',p_id,'state',reservation.state); END IF;
  IF identity.id IS NULL THEN RAISE EXCEPTION 'Owned product Auth identity required'; END IF;
  IF reservation.state IN ('ready','complete') THEN
    IF p_phase='complete' AND reservation.state='ready' THEN
      IF p_input->>'status'='active' AND identity.banned_until>now() THEN RAISE EXCEPTION 'Auth activation pending'; END IF;
      UPDATE public.product_provisioning SET state='complete',updated_at=now() WHERE user_id=p_id;
    END IF;
    RETURN jsonb_build_object('id',p_id);
  END IF;
  IF p_phase<>'persist' OR reservation.state<>'reserved' OR identity.banned_until IS NULL OR identity.banned_until<=now()
    OR EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=p_id)
    OR EXISTS(SELECT 1 FROM public.organisation_membership WHERE user_id=p_id)
    OR (requested='advertiser' AND EXISTS(SELECT 1 FROM public.rider WHERE user_id=p_id)) THEN
    RAISE EXCEPTION 'Invalid pending product identity';
  END IF;
  UPDATE public."user" SET name=p_input->>'name',phone=p_input->>'phone',organization=p_input->>'organization',
    status=(CASE WHEN p_input->>'status'='inactive' THEN 'suspended' ELSE p_input->>'status' END)::public.user_status,
    language_preference=p_input->>'languagePreference',is_verified=(p_input->>'isVerified')::boolean,
    email_verified=coalesce((p_input->>'emailVerified')::boolean,(p_input->>'isVerified')::boolean),verification_level='basic',account_notes=p_input->>'accountNotes',updated_at=now()
    WHERE id=p_id AND role::text=requested AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending product profile required'; END IF;
  IF requested='rider' THEN
    UPDATE public.rider SET city=coalesce(p_input->>'city',city),country=coalesce(p_input->>'country',country),
      status=CASE WHEN p_input->>'status'='active' THEN 'active'::public.rider_status ELSE 'inactive'::public.rider_status END
      WHERE user_id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider profile missing'; END IF;
  ELSE
    UPDATE public.advertiser SET company_name=p_input->'advertiserProfile'->>'companyName',company_email=p_input->>'email',
      website=p_input->'advertiserProfile'->>'website',logo_url=p_input->'advertiserProfile'->>'logoUrl',
      industry=p_input->'advertiserProfile'->>'industry',language=p_input->'advertiserProfile'->>'language',
      timezone=p_input->'advertiserProfile'->>'timezone',budget=(p_input->'advertiserProfile'->>'budget')::numeric,
      email_notifications=(p_input->'advertiserProfile'->>'emailNotifications')::boolean,
      campaign_updates=(p_input->'advertiserProfile'->>'campaignUpdates')::boolean WHERE user_id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Advertiser profile missing'; END IF;
  END IF;
  IF requested='advertiser' THEN
    SELECT organisation_id INTO org_id FROM public.advertiser WHERE user_id=p_id;
    IF org_id IS NULL THEN
      INSERT INTO public.organisation(name,type,status) VALUES(p_input->'advertiserProfile'->>'companyName','advertiser','active') RETURNING id INTO org_id;
      UPDATE public.advertiser SET organisation_id=org_id WHERE user_id=p_id;
    END IF;
    PERFORM public.change_organisation_membership(p_actor,p_id,org_id,'owner',CASE WHEN p_input->>'status'='active' THEN 'active' ELSE 'invited' END);
  END IF;
  IF p_input ? 'waitlistId' THEN
    UPDATE public.waitlist SET converted_to_user=true,status='approved',status_reason=p_input->>'waitlistReason',
      provisioning_user_id=p_id,updated_at=now() WHERE id=(p_input->>'waitlistId')::uuid;
  END IF;
  UPDATE public.product_provisioning SET state='ready',updated_at=now() WHERE user_id=p_id;
  INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
    VALUES(p_actor,'admin',required,'user',p_id::text,jsonb_build_object('role',requested,'status',p_input->>'status'),p_id::text,'admin_account_creation_v1');
  RETURN jsonb_build_object('id',p_id);
END $$;
REVOKE ALL ON FUNCTION public.provision_product(uuid,uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_product(uuid,uuid,jsonb,text,text) TO service_role;
-- Table grants cannot be an alternative membership writer. SECURITY DEFINER
-- commands run as their owner and revalidate the requesting actor.
REVOKE INSERT,UPDATE,DELETE ON public.organisation_membership FROM anon,authenticated,service_role;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.organisation_membership FROM anon,authenticated,service_role;
REVOKE ALL ON public.permission_bundle,public.bundle_capability FROM anon,authenticated,service_role;
GRANT SELECT ON public.permission_bundle,public.bundle_capability TO authenticated,service_role;
REVOKE INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."user" FROM anon,authenticated,service_role;
DROP POLICY IF EXISTS user_insert_system ON public."user";
ALTER TABLE public.organisation_membership ADD CONSTRAINT organisation_role_bundle CHECK(bundle_key='org.'||role);
COMMIT;
