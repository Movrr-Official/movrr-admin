-- Approval required. Apply with the matching Admin source; no enum expansion.
-- Existing public.user.role is account classification only. Employee authority
-- is exclusively admin_users.role; NULL means revoked and preserves staff IDs.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(70001,1);

-- One-time data conversion, never an executable role alias resolver.
DO $$
DECLARE actor uuid:=nullif(current_setting('movrr.migration_actor',true),'')::uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE role IN ('admin','moderator','support','compliance_officer','government')) THEN
   IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
     WHERE a.user_id=actor AND a.role='super_admin' AND u.status='active') THEN
     RAISE EXCEPTION 'Set movrr.migration_actor to the authorized active super administrator before normalizing existing memberships';
   END IF;
   INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
     SELECT actor,'admin','users.role.approve','admin_users',a.user_id::text,jsonb_build_object('role',a.role),
       jsonb_build_object('role',m.canonical),gen_random_uuid()::text,'070_employee_role_canonicalization'
     FROM public.admin_users a JOIN (VALUES ('admin','operations_manager'),('moderator','product_operations'),
       ('support','support_agent'),('compliance_officer','compliance_analyst'),('government','programme_operations_manager')) m(old,canonical) ON a.role=m.old;
   UPDATE public.admin_users a SET role=m.canonical,updated_at=now()
     FROM (VALUES ('admin','operations_manager'),('moderator','product_operations'),('support','support_agent'),
       ('compliance_officer','compliance_analyst'),('government','programme_operations_manager')) m(old,canonical) WHERE a.role=m.old;
 END IF;
END $$;
ALTER TABLE public.admin_users ALTER COLUMN role DROP NOT NULL;
-- BEGIN GENERATED EMPLOYEE CAPABILITIES
CREATE OR REPLACE FUNCTION public.ops_employee_capabilities(p_role text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $cap$ SELECT coalesce('{"super_admin":["rewards.redeem","rewards.catalog.read","rewards.manage","fulfilment.read","fulfilment.cancel","fulfilment.refund","fulfilment.override","fulfilment.validate","fulfilment.confirm","resources.manage","wallet.read","staff.manage","analytics.view","campaigns.read","campaigns.write","campaigns.launch","campaigns.pause","billing.read","programmes.read","compliance.read","impact.read","org.settings","dashboard.read","users.read","users.manage","users.role.assign","users.role.approve","waitlist.manage","riders.read","riders.manage","rides.read","rides.verify","rides.settlement.recovery.request","rides.settlement.recovery.review","routes.read","routes.write","routes.approve","campaigns.approve","campaigns.publish","campaigns.archive","rewards.approve","partners.approve","fraud.review","fraud.resolve","incidents.read","incidents.create","incidents.manage","notifications.read","notifications.send","settings.manage","settings.security","exports.execute","privacy.erase","privacy.deletion.monitor","privacy.deletion.escalate","privacy.deletion.operations.review","privacy.deletion.finance.review","privacy.deletion.compliance.review","privacy.deletion.recovery","platform.health.read","platform.jobs.manage","featureflags.manage","billing.manage","workboard.access","analytics.read","reports.read","protips.manage","community.manage","advertisers.manage","authz.inspect","authz.manage","break_glass.use","delegation.manage"],"security_admin":["dashboard.read","notifications.read","analytics.read","analytics.view","privacy.deletion.monitor","privacy.deletion.escalate","privacy.deletion.recovery","users.read","users.role.approve","settings.manage","settings.security","authz.inspect","authz.manage","break_glass.use","delegation.manage","exports.execute","privacy.erase","incidents.read","incidents.manage","fraud.review","reports.read"],"operations_manager":["dashboard.read","notifications.read","analytics.read","analytics.view","campaigns.read","campaigns.write","campaigns.launch","campaigns.pause","campaigns.publish","campaigns.archive","advertisers.manage","community.manage","campaigns.approve","rewards.catalog.read","rewards.manage","fulfilment.read","fulfilment.validate","fulfilment.confirm","fulfilment.cancel","fulfilment.refund","resources.manage","wallet.read","partners.approve","rewards.approve","privacy.deletion.monitor","privacy.deletion.escalate","privacy.deletion.operations.review","rides.settlement.recovery.review","users.read","users.manage","users.role.assign","waitlist.manage","riders.read","riders.manage","rides.read","rides.verify","routes.read","routes.write","routes.approve","fraud.review","fraud.resolve","incidents.read","incidents.create","incidents.manage","notifications.send","settings.manage","exports.execute","platform.health.read","platform.jobs.manage","billing.read","billing.manage","workboard.access","programmes.read","compliance.read","impact.read","protips.manage","reports.read","authz.inspect","fulfilment.override","staff.manage"],"platform_operator":["dashboard.read","notifications.read","analytics.read","analytics.view","privacy.deletion.monitor","privacy.deletion.escalate","privacy.deletion.operations.review","platform.health.read","platform.jobs.manage","featureflags.manage","incidents.read","incidents.manage","workboard.access","authz.inspect"],"campaign_manager":["dashboard.read","notifications.read","analytics.read","analytics.view","campaigns.read","campaigns.write","campaigns.launch","campaigns.pause","campaigns.publish","campaigns.archive","advertisers.manage","community.manage","routes.read","riders.read","rides.read","exports.execute","workboard.access","reports.read"],"partner_operations_manager":["dashboard.read","notifications.read","analytics.read","analytics.view","rewards.catalog.read","rewards.manage","fulfilment.read","fulfilment.validate","fulfilment.confirm","fulfilment.cancel","fulfilment.refund","resources.manage","wallet.read","partners.approve","rewards.approve","exports.execute","workboard.access","reports.read"],"fraud_analyst":["dashboard.read","notifications.read","analytics.read","analytics.view","fraud.review","fraud.resolve","rides.read","rides.verify","riders.read","incidents.read","incidents.create","users.read","exports.execute","workboard.access"],"trust_safety_analyst":["dashboard.read","notifications.read","analytics.read","analytics.view","users.read","riders.read","rides.read","fraud.review","incidents.read","incidents.create","incidents.manage","notifications.send","workboard.access"],"support_agent":["privacy.deletion.monitor","privacy.deletion.escalate","dashboard.read","notifications.read","analytics.read","analytics.view","users.read","riders.read","rides.read","incidents.create","incidents.read","notifications.send","rewards.catalog.read","fulfilment.read","wallet.read"],"support_lead":["privacy.deletion.monitor","privacy.deletion.escalate","dashboard.read","notifications.read","analytics.read","analytics.view","users.read","riders.read","rides.read","incidents.create","incidents.read","notifications.send","waitlist.manage","incidents.manage","riders.manage","rewards.catalog.read","fulfilment.read","wallet.read","exports.execute","workboard.access"],"finance_operator":["dashboard.read","notifications.read","analytics.read","analytics.view","rides.settlement.recovery.review","privacy.deletion.monitor","privacy.deletion.finance.review","billing.read","billing.manage","exports.execute","campaigns.read","reports.read","authz.inspect"],"compliance_analyst":["privacy.deletion.monitor","privacy.deletion.compliance.review","dashboard.read","notifications.read","analytics.read","analytics.view","programmes.read","compliance.read","impact.read","campaigns.read","rewards.catalog.read","fulfilment.read","users.read","riders.read","rides.read","billing.read","reports.read","authz.inspect","exports.execute"],"programme_operations_manager":["dashboard.read","notifications.read","analytics.read","analytics.view","programmes.read","compliance.read","impact.read","campaigns.read","riders.read","rides.read","reports.read"],"executive_viewer":["dashboard.read","notifications.read","analytics.read","analytics.view","reports.read","programmes.read","impact.read","campaigns.read","billing.read","compliance.read"],"product_operations":["dashboard.read","notifications.read","analytics.read","analytics.view","routes.read","routes.write","routes.approve","campaigns.read","workboard.access","community.manage","protips.manage","riders.read","rides.read"],"engineering_operations":["dashboard.read","notifications.read","analytics.read","analytics.view","privacy.deletion.monitor","privacy.deletion.escalate","privacy.deletion.operations.review","platform.health.read","platform.jobs.manage","featureflags.manage","incidents.read","incidents.manage","workboard.access","settings.manage","authz.inspect","rides.settlement.recovery.request"]}'::jsonb->p_role,'[]'::jsonb) $cap$;
REVOKE ALL ON FUNCTION public.ops_employee_capabilities(text) FROM PUBLIC,anon,authenticated,service_role;
-- END GENERATED EMPLOYEE CAPABILITIES
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_canonical_employee_role
 CHECK(role IS NULL OR jsonb_array_length(public.ops_employee_capabilities(role))>0);

CREATE OR REPLACE FUNCTION public.is_dashboard_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id
   WHERE a.user_id=auth.uid() AND a.role IS NOT NULL AND jsonb_array_length(public.ops_employee_capabilities(a.role))>0
     AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now()))
$$;
-- Coarse account roles are not employee authority; no legitimate caller remains.
DROP FUNCTION IF EXISTS public.get_user_role();

CREATE OR REPLACE FUNCTION public.assign_employee_role(p_actor uuid,p_user uuid,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; prior_role text; target public."user"; reserved boolean; required text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF p_role IS NOT NULL AND jsonb_array_length(public.ops_employee_capabilities(p_role))=0 THEN
   RAISE EXCEPTION 'Canonical employee role required' USING ERRCODE='22023'; END IF;
 -- Every assignment, revocation and provisioning grant shares this lock. Actor
 -- revocation cannot race a command that has already passed authorization.
 PERFORM pg_advisory_xact_lock(70001,1);
 SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
   JOIN auth.users au ON au.id=a.user_id WHERE a.user_id=p_actor AND u.status='active'
   AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now());
 SELECT * INTO target FROM public."user" WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE='P0002'; END IF;
 SELECT role INTO prior_role FROM public.admin_users WHERE user_id=p_user FOR UPDATE;
 required:=CASE WHEN p_role IN ('super_admin','security_admin') OR prior_role IN ('super_admin','security_admin')
   THEN 'users.role.approve' ELSE 'users.role.assign' END;
 IF NOT coalesce(caps ? required,false) THEN RAISE EXCEPTION 'Unauthorized employee role assignment' USING ERRCODE='42501'; END IF;
 IF prior_role IS NOT DISTINCT FROM p_role THEN RETURN; END IF;
 reserved:=EXISTS(SELECT 1 FROM public.employee_provisioning r JOIN auth.users a ON a.id=r.user_id
   WHERE r.user_id=p_user AND r.actor_id=p_actor AND r.state='reserved' AND r.input->>'role'=p_role
     AND a.raw_app_meta_data->>'employee_provisioning_id'=r.user_id::text AND a.banned_until>now());
 IF p_role IS NOT NULL THEN
   IF (target.status<>'active' OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p_user AND a.deleted_at IS NULL
       AND (a.banned_until IS NULL OR a.banned_until<=now()))) AND NOT reserved THEN
     RAISE EXCEPTION 'Active account required before employee assignment' USING ERRCODE='42501'; END IF;
   IF EXISTS(SELECT 1 FROM public.employee_provisioning WHERE user_id=p_user AND state<>'complete') AND NOT reserved THEN
     RAISE EXCEPTION 'Finish employee provisioning before changing its role'; END IF;
 END IF;
 IF p_actor=p_user AND NOT (public.ops_employee_capabilities(prior_role) @> public.ops_employee_capabilities(p_role)) THEN
   RAISE EXCEPTION 'Self-escalation is not permitted' USING ERRCODE='42501'; END IF;
 IF prior_role='super_admin' AND p_role IS DISTINCT FROM 'super_admin' AND NOT EXISTS(
   SELECT 1 FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id
   WHERE a.user_id<>p_user AND a.role='super_admin' AND u.status='active' AND au.deleted_at IS NULL
     AND (au.banned_until IS NULL OR au.banned_until<=now())) THEN
   RAISE EXCEPTION 'Cannot revoke the last active super administrator' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL THEN
   UPDATE public.admin_users SET role=NULL,updated_at=now() WHERE user_id=p_user;
 ELSE
   INSERT INTO public.admin_users(user_id,email,role,created_by) VALUES(p_user,target.email,p_role,p_actor)
     ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,email=excluded.email,updated_at=now();
 END IF;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
   VALUES(p_actor,'admin',required,'admin_users',p_user::text,jsonb_build_object('role',prior_role),jsonb_build_object('role',p_role),gen_random_uuid()::text,'employee_membership.change');
END $$;
REVOKE ALL ON FUNCTION public.assign_employee_role(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_employee_role(uuid,uuid,text) TO service_role;

DROP FUNCTION public.update_admin_user_profile(uuid,uuid,text,jsonb);
CREATE FUNCTION public.update_admin_user_profile(p_actor uuid,p_user uuid,p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
   JOIN auth.users au ON au.id=a.user_id WHERE a.user_id=p_actor AND u.status='active' AND au.deleted_at IS NULL
   AND (au.banned_until IS NULL OR au.banned_until<=now());
 IF NOT coalesce(caps ? 'users.manage',false) THEN RAISE EXCEPTION 'Unauthorized profile update' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k
   WHERE k NOT IN ('name','email','phone','status','organization','language_preference','is_verified','account_notes','updated_at','employee_role')) THEN
   RAISE EXCEPTION 'Invalid profile patch; account type is not editable' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public."user" WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
 IF p_patch ? 'employee_role' THEN PERFORM public.assign_employee_role(p_actor,p_user,p_patch->>'employee_role'); END IF;
 UPDATE public."user" SET
   name=CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE name END,
   email=CASE WHEN p_patch ? 'email' THEN p_patch->>'email' ELSE email END,
   phone=CASE WHEN p_patch ? 'phone' THEN p_patch->>'phone' ELSE phone END,
   status=CASE WHEN p_patch ? 'status' THEN (p_patch->>'status')::public.user_status ELSE status END,
   organization=CASE WHEN p_patch ? 'organization' THEN p_patch->>'organization' ELSE organization END,
   language_preference=CASE WHEN p_patch ? 'language_preference' THEN p_patch->>'language_preference' ELSE language_preference END,
   is_verified=CASE WHEN p_patch ? 'is_verified' THEN (p_patch->>'is_verified')::boolean ELSE is_verified END,
   account_notes=CASE WHEN p_patch ? 'account_notes' THEN p_patch->>'account_notes' ELSE account_notes END,updated_at=now()
   WHERE id=p_user;
 IF p_patch ? 'email' THEN UPDATE public.admin_users SET email=p_patch->>'email',updated_at=now() WHERE user_id=p_user; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_admin_user_profile(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_user_profile(uuid,uuid,jsonb) TO service_role;

-- BEGIN GENERATED PROVISIONING AND BOOTSTRAP
CREATE OR REPLACE FUNCTION public.guard_employee_auth_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.employee_provisioning; product public.product_provisioning;
BEGIN
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
END $$;
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
  IF EXISTS(SELECT 1 FROM public.employee_provisioning WHERE user_id=new.id) THEN
    _account_type := 'admin';
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
    CASE WHEN EXISTS(SELECT 1 FROM public.employee_provisioning WHERE user_id=new.id) OR EXISTS(SELECT 1 FROM public.product_provisioning WHERE user_id=new.id) THEN 'pending'::public.user_status ELSE 'active'::public.user_status END,
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
CREATE OR REPLACE FUNCTION public.provision_employee(p_actor uuid, p_input jsonb, p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.employee_provisioning; actor_role text; caps jsonb; requested text:=p_input->>'role';
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(70001,1);
  SELECT a.role INTO actor_role FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
    JOIN auth.users au ON au.id=a.user_id WHERE a.user_id=p_actor AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now());
  caps:=public.ops_employee_capabilities(actor_role);
  IF NOT coalesce(caps ? 'users.manage',false) OR NOT coalesce(caps ?
      CASE WHEN requested IN ('super_admin','security_admin') THEN 'users.role.approve' ELSE 'users.role.assign' END,false) THEN
    RAISE EXCEPTION 'Unauthorized employee role assignment' USING ERRCODE='42501';
  END IF;
  IF requested IS NULL OR jsonb_array_length(public.ops_employee_capabilities(requested))=0
     OR p_input->>'status' IS NULL OR p_input->>'status' NOT IN ('active','inactive','pending')
     OR coalesce(btrim(p_input->>'name'),'')='' OR coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_input->>'email'<>lower(btrim(p_input->>'email'))
     OR p_input ?| ARRAY['organisationId','organisation_id','membershipRole','bundleKey'] THEN
    RAISE EXCEPTION 'Invalid employee provisioning contract';
  END IF;
  IF p_phase IS NULL OR p_phase NOT IN ('reserve','persist','complete') THEN RAISE EXCEPTION 'Invalid provisioning phase'; END IF;
  -- All operations for an email, including concurrent first submissions, serialize.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_input->>'email',68));
  SELECT * INTO r FROM public.employee_provisioning WHERE email=p_input->>'email' FOR UPDATE;
  IF r.user_id IS NULL THEN
    IF p_phase<>'reserve' THEN RAISE EXCEPTION 'Provisioning reservation missing'; END IF;
    IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_input->>'email') THEN
      RAISE EXCEPTION 'Existing account: use its authorized invitation workflow; creation cannot reclassify it';
    END IF;
    INSERT INTO public.employee_provisioning(email,actor_id,input) VALUES(p_input->>'email',p_actor,p_input) RETURNING * INTO r;
  END IF;
  IF r.actor_id<>p_actor OR r.input<>p_input THEN RAISE EXCEPTION 'Conflicting provisioning request; original reservation preserved'; END IF;
  IF r.state IN ('ready','complete') AND (NOT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=r.user_id AND role=requested)
    OR NOT EXISTS(SELECT 1 FROM public."user" WHERE id=r.user_id AND email=r.email AND role='admin' AND status::text=
      CASE WHEN p_input->>'status'='inactive' THEN 'suspended' ELSE p_input->>'status' END)) THEN
    RAISE EXCEPTION 'Provisioned account changed; do not reactivate automatically';
  END IF;
  IF p_phase='persist' AND r.state='reserved' THEN
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=r.user_id AND lower(email)=r.email
       AND raw_app_meta_data->>'employee_provisioning_id'=r.user_id::text AND banned_until>now()) THEN
      RAISE EXCEPTION 'Owned, banned Auth identity required';
    END IF;
    IF EXISTS(SELECT 1 FROM public.rider WHERE user_id=r.user_id)
       OR EXISTS(SELECT 1 FROM public.organisation_membership WHERE user_id=r.user_id)
       OR EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=r.user_id) THEN
      RAISE EXCEPTION 'Unexpected existing identity grants; investigation required';
    END IF;
    UPDATE public."user" SET name=p_input->>'name',phone=p_input->>'phone',
      status=(CASE WHEN p_input->>'status'='inactive' THEN 'suspended' ELSE p_input->>'status' END)::public.user_status,
      organization=p_input->>'organization',language_preference=p_input->>'languagePreference',
      is_verified=(p_input->>'isVerified')::boolean,email_verified=(p_input->>'isVerified')::boolean,verification_level='basic',
      account_notes=p_input->>'accountNotes',updated_at=now()
      WHERE id=r.user_id AND role='admin' AND status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending employee profile required'; END IF;
    PERFORM public.assign_employee_role(p_actor,r.user_id,requested);
    INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
      VALUES(p_actor,'admin','users.manage','user',r.user_id::text,jsonb_build_object('role',requested,'status',p_input->>'status'),r.user_id::text,'admin_account_creation_v1');
    UPDATE public.employee_provisioning SET state='ready',updated_at=now() WHERE user_id=r.user_id RETURNING * INTO r;
  ELSIF p_phase='complete' AND r.state='ready' THEN
    IF p_input->>'status'='active' AND EXISTS(SELECT 1 FROM auth.users WHERE id=r.user_id AND banned_until>now()) THEN
      RAISE EXCEPTION 'Auth activation pending';
    END IF;
    UPDATE public.employee_provisioning SET state='complete',updated_at=now() WHERE user_id=r.user_id RETURNING * INTO r;
  END IF;
  RETURN jsonb_build_object('user_id',r.user_id,'state',r.state);
END $$;
DROP TRIGGER zz_mark_employee_profile_pending ON auth.users;
DROP FUNCTION public.mark_employee_profile_pending();
CREATE OR REPLACE FUNCTION public.accept_workboard_platform_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
RETURNS TABLE(
  success boolean,
  error_code text,
  error_message text,
  invitation_id uuid,
  team_id uuid,
  membership_id uuid,
  membership_role text,
  result_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row public.platform_invitations%ROWTYPE;
  member_id uuid;
  member_role text;
  normalized_email text := lower(trim(COALESCE(p_email, '')));
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RETURN QUERY SELECT false, 'invalid_token', 'Invitation token is required',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', 'Authenticated user is required',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF normalized_email = '' THEN
    RETURN QUERY SELECT false, 'email_missing', 'User email not found',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
      JOIN auth.users au ON au.id=a.user_id
    WHERE a.user_id=p_user_id AND u.status='active' AND lower(au.email)=normalized_email AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now())
      AND public.ops_employee_capabilities(a.role) ? 'workboard.access'
  ) THEN
    RETURN QUERY SELECT false, 'ineligible_role', 'An active eligible employee account is required',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  PERFORM public.expire_platform_invitations();

  SELECT *
  INTO invite_row
  FROM public.platform_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF invite_row.id IS NULL THEN
    RETURN QUERY SELECT false, 'not_found', 'Invite not found',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF invite_row.scope <> 'workboard_team' THEN
    RETURN QUERY SELECT false, 'wrong_scope', 'Invitation is not a Workboard invite',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, invite_row.status::text;
    RETURN;
  END IF;

  IF invite_row.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked', 'This invitation has been revoked',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'revoked';
    RETURN;
  END IF;

  IF invite_row.status = 'rejected' THEN
    RETURN QUERY SELECT false, 'rejected', 'This invitation was rejected',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'rejected';
    RETURN;
  END IF;

  IF invite_row.status = 'expired'
     OR (invite_row.expires_at IS NOT NULL AND invite_row.expires_at < now()) THEN
    IF invite_row.status = 'pending' THEN
      UPDATE public.platform_invitations
      SET status = 'expired', updated_at = now()
      WHERE id = invite_row.id;
    END IF;
    RETURN QUERY SELECT false, 'expired', 'Invite expired',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'expired';
    RETURN;
  END IF;

  IF invite_row.email <> normalized_email THEN
    RETURN QUERY SELECT false, 'email_mismatch', 'Invite email does not match current user',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, invite_row.status::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workboard_teams t WHERE t.id = invite_row.target_entity_id
  ) THEN
    RETURN QUERY SELECT false, 'board_deleted', 'This workboard no longer exists',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, invite_row.status::text;
    RETURN;
  END IF;

  IF invite_row.status = 'accepted' THEN
    SELECT m.id, m.role::text
    INTO member_id, member_role
    FROM public.workboard_team_members m
    WHERE m.team_id = invite_row.target_entity_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
    LIMIT 1;

    IF member_id IS NULL THEN
      RETURN QUERY SELECT false, 'accepted_without_membership',
        'Invitation was already used but you are not an active member',
        invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'accepted';
      RETURN;
    END IF;

    RETURN QUERY SELECT true, NULL::text, NULL::text,
      invite_row.id, invite_row.target_entity_id, member_id, member_role, 'already_accepted';
    RETURN;
  END IF;

  IF invite_row.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'invalid_status', 'Invitation cannot be accepted in its current state',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, invite_row.status::text;
    RETURN;
  END IF;

  INSERT INTO public.workboard_team_members (
    team_id,
    user_id,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    invite_row.target_entity_id,
    p_user_id,
    invite_row.role::public.workboard_member_role,
    'active',
    now(),
    now()
  )
  ON CONFLICT ON CONSTRAINT workboard_team_members_team_id_user_id_key DO UPDATE
  SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = now()
  RETURNING id, role::text INTO member_id, member_role;

  IF member_id IS NULL THEN
    RETURN QUERY SELECT false, 'membership_failed', 'Failed to create or activate membership',
      invite_row.id, invite_row.target_entity_id, NULL::uuid, NULL::text, 'pending';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workboard_team_members m
    WHERE m.id = member_id
      AND m.status = 'active'
      AND m.user_id = p_user_id
      AND m.team_id = invite_row.target_entity_id
  ) THEN
    RAISE EXCEPTION 'membership verification failed';
  END IF;

  UPDATE public.platform_invitations
  SET
    status = 'accepted',
    accepted_at = now(),
    accepted_by = p_user_id,
    updated_at = now()
  WHERE id = invite_row.id;

  RETURN QUERY SELECT true, NULL::text, NULL::text,
    invite_row.id, invite_row.target_entity_id, member_id, member_role, 'accepted';

EXCEPTION
  WHEN others THEN
    -- Never leak sqlerrm to clients
    RETURN QUERY SELECT false, 'transaction_failed', 'Invitation acceptance failed',
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_community_ride(p_community_ride_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ride        RECORD;
  v_active_cnt  INTEGER;
BEGIN
 PERFORM public.assert_active_account();
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rider r
    WHERE r.id = p_rider_id
      AND r.user_id = auth.uid()
  ) AND NOT (public.is_dashboard_admin() AND EXISTS (
    SELECT 1 FROM public.admin_users au WHERE au.user_id=auth.uid()
      AND public.ops_employee_capabilities(au.role) ? 'community.manage'
  )) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT id, status, max_participants, is_public
    INTO v_ride
    FROM public.community_ride
   WHERE id = p_community_ride_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_found');
  END IF;

  IF NOT v_ride.is_public THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_public');
  END IF;

  IF v_ride.status NOT IN ('upcoming', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_joinable');
  END IF;

  SELECT COUNT(*)
    INTO v_active_cnt
    FROM public.community_ride_participant
   WHERE community_ride_id = p_community_ride_id
     AND status = 'joined';

  IF v_active_cnt >= v_ride.max_participants THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_full');
  END IF;

  INSERT INTO public.community_ride_participant
    (community_ride_id, rider_id, status, joined_at)
  VALUES
    (p_community_ride_id, p_rider_id, 'joined', NOW())
  ON CONFLICT (community_ride_id, rider_id)
    DO UPDATE SET status = 'joined', joined_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$function$;
CREATE OR REPLACE FUNCTION public.ops_queue_notifications(p_operation uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid; job public.ops_notification_send;
BEGIN
 actor:=public.ops_assert_capability('notifications.send');
 IF p_operation IS NULL OR length(trim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_payload->>'message',''))) NOT BETWEEN 1 AND 10000 OR p_payload->>'type' NOT IN ('campaign_assigned','campaign_completed','route_assigned','route_completed','system','reward','status') OR p_payload->>'target' NOT IN ('all','role','userIds') OR jsonb_typeof(p_payload->'respectPreferences') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid notification request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,8));
 SELECT * INTO job FROM public.ops_notification_send WHERE id=p_operation FOR UPDATE;
 IF FOUND THEN
  IF job.actor_user_id<>actor OR job.payload<>p_payload THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN public.ops_notification_status(p_operation);
 END IF;
 IF p_payload->>'target'='role' AND p_payload->>'role' NOT IN ('rider','advertiser') AND jsonb_array_length(public.ops_employee_capabilities(p_payload->>'role'))=0 THEN
   RAISE EXCEPTION 'Canonical recipient role required' USING ERRCODE='22023'; END IF;
 IF p_payload->>'target'='role' AND nullif(p_payload->>'role','') IS NULL OR p_payload->>'target'='userIds' AND (jsonb_typeof(p_payload->'userIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'userIds')=0) THEN RAISE EXCEPTION 'Audience required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.ops_notification_send(id,actor_user_id,payload) VALUES(p_operation,actor,p_payload);
 -- No PostgREST row cap. Preference-query failure rolls back the entire operation.
 INSERT INTO public.ops_notification_recipient(operation,user_id)
 SELECT p_operation,u.id FROM public."user" u LEFT JOIN public.user_preferences pref ON pref.user_id=u.id
 WHERE u.status::text='active' AND (p_payload->>'target'='all' OR p_payload->>'target'='role' AND ((p_payload->>'role' IN ('rider','advertiser') AND u.role::text=p_payload->>'role') OR EXISTS(SELECT 1 FROM public.admin_users employee WHERE employee.user_id=u.id AND employee.role=p_payload->>'role')) OR p_payload->>'target'='userIds' AND (p_payload->'userIds') ? u.id::text)
 AND (NOT (p_payload->>'respectPreferences')::boolean OR coalesce(pref.notifications,true));
 PERFORM public.ops_audit('notifications.send','notification_send',p_operation::text,NULL,jsonb_build_object('audience',p_payload->>'target','counts',public.ops_notification_status(p_operation)),'Notification send queued',p_operation);
 RETURN public.ops_notification_status(p_operation);
END $$;
-- END GENERATED PROVISIONING AND BOOTSTRAP

-- Existing membership-existence policies must not treat a revoked staff record
-- as a grant. Keep the same surfaces and rely on the canonical active predicate.
DO $$
DECLARE p record; predicate text:='public.is_dashboard_admin()'; t record; expression text;
BEGIN
 FOR p IN SELECT schemaname,tablename,policyname,qual,with_check FROM pg_policies WHERE schemaname='public'
   AND (coalesce(qual,'') LIKE '%admin_users%' OR coalesce(with_check,'') LIKE '%admin_users%') LOOP
   -- Fail rather than silently rewriting any future compound ownership policy.
   FOREACH expression IN ARRAY ARRAY[p.qual,p.with_check] LOOP
     IF expression IS NOT NULL AND replace(regexp_replace(expression,'\s','','g'),'public.','') NOT IN (
       '(EXISTS(SELECT1FROMadmin_usersauWHERE(au.user_id=auth.uid())))',
       '(EXISTS(SELECT1FROMadmin_usersWHERE(admin_users.user_id=auth.uid())))') THEN
       RAISE EXCEPTION 'Review compound employee policy: %.%',p.tablename,p.policyname;
     END IF;
   END LOOP;
   EXECUTE format('ALTER POLICY %I ON %I.%I %s %s',p.policyname,p.schemaname,p.tablename,
     CASE WHEN p.qual IS NOT NULL THEN 'USING ('||predicate||')' ELSE '' END,
     CASE WHEN p.with_check IS NOT NULL THEN 'WITH CHECK ('||predicate||')' ELSE '' END);
 END LOOP;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'workboard_%' LOOP
   EXECUTE format('CREATE POLICY employee_membership_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_dashboard_admin()) WITH CHECK (public.is_dashboard_admin())',t.tablename);
 END LOOP;
END $$;
COMMIT;
