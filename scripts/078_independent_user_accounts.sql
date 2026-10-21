-- Explicit User-only accounts reuse the owned, recoverable provisioning contract.
-- Preserve intentional public Mobile Rider signup and all existing relationships.
-- Production execution requires explicit approval. No data backfill.
BEGIN;
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
      IF NOT(product.input ? 'role') OR (product.input->>'role' IS NOT NULL AND product.input->>'role' NOT IN ('rider','advertiser')) OR product.state<>'reserved' OR product.email<>lower(NEW.email) THEN
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
  ELSIF EXISTS(SELECT 1 FROM public.product_provisioning WHERE user_id=new.id AND input ? 'role' AND input->>'role' IS NULL) THEN
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
  IF NOT(p_input ? 'role') OR (requested IS NOT NULL AND requested NOT IN ('rider','advertiser')) OR p_input->>'status' IS NULL
    OR p_input->>'status' NOT IN ('active','inactive','pending') OR coalesce(btrim(p_input->>'name'),'')=''
    OR coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_input->>'email'<>lower(btrim(p_input->>'email')) OR length(p_fingerprint)<>64
    OR (requested='advertiser' AND (p_input->'advertiserProfile'->>'companyName' IS NULL OR p_input ? 'waitlistId'))
    OR (requested IS NULL AND p_input ?| ARRAY['advertiserProfile','waitlistId','city','country'])
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
    IF NOT EXISTS(SELECT 1 FROM public."user" WHERE id=p_id AND email=p_input->>'email' AND role::text IS NOT DISTINCT FROM requested AND status::text=
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
    OR (requested IS DISTINCT FROM 'rider' AND EXISTS(SELECT 1 FROM public.rider WHERE user_id=p_id)) THEN
    RAISE EXCEPTION 'Invalid pending product identity';
  END IF;
  UPDATE public."user" SET name=p_input->>'name',phone=p_input->>'phone',organization=p_input->>'organization',
    status=(CASE WHEN p_input->>'status'='inactive' THEN 'suspended' ELSE p_input->>'status' END)::public.user_status,
    language_preference=p_input->>'languagePreference',is_verified=(p_input->>'isVerified')::boolean,
    email_verified=coalesce((p_input->>'emailVerified')::boolean,(p_input->>'isVerified')::boolean),verification_level='basic',account_notes=p_input->>'accountNotes',updated_at=now()
    WHERE id=p_id AND role::text IS NOT DISTINCT FROM requested AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending product profile required'; END IF;
  IF requested='rider' THEN
    UPDATE public.rider SET city=coalesce(p_input->>'city',city),country=coalesce(p_input->>'country',country),
      status=CASE WHEN p_input->>'status'='active' THEN 'active'::public.rider_status ELSE 'inactive'::public.rider_status END
      WHERE user_id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rider profile missing'; END IF;
  ELSIF requested='advertiser' THEN
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
COMMIT;
