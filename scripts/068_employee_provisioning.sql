-- Approval required before production application. No enum or permission changes.
BEGIN;
ALTER TABLE public.waitlist ADD COLUMN provisioning_user_id uuid;
CREATE TABLE public.employee_provisioning (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  actor_id uuid NOT NULL,
  input jsonb NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','ready','complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_provisioning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_provisioning FROM PUBLIC, anon, authenticated;
CREATE TABLE public.product_provisioning (
  user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  actor_id uuid NOT NULL,
  input jsonb NOT NULL,
  fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','ready','complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_provisioning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_provisioning FROM PUBLIC,anon,authenticated;

-- Only this server-owned marker may reserve an employee Auth identity. Ordinary
-- Rider signup continues through the existing handle_new_user trigger unchanged.
CREATE FUNCTION public.guard_employee_auth_insert() RETURNS trigger
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
      'server_assigned_role','admin','full_name',r.input->>'name','phone',r.input->>'phone'));
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
        'server_assigned_role',product.input->>'role','full_name',product.input->>'name',
        'phone',product.input->>'phone','city',product.input->>'city','country',product.input->>'country',
        'companyName',product.input->'advertiserProfile'->>'companyName','language',product.input->>'languagePreference',
        'timezone',product.input->'advertiserProfile'->>'timezone'));
    ELSIF NEW.raw_app_meta_data ?| ARRAY['employee_provisioning_id','admin_product_provisioning'] THEN
      RAISE EXCEPTION 'Provisioning marker without a reservation';
    ELSIF coalesce(NEW.raw_user_meta_data,'{}') ? 'server_assigned_role' AND
       coalesce(NEW.raw_user_meta_data->>'server_assigned_role','') NOT IN ('rider','advertiser') THEN
      -- Explicit invalid/operational metadata must never reach the legacy
      -- handler's catch-all Rider fallback. Employee grants require a reservation.
      RAISE EXCEPTION 'Operational account roles require authorized employee provisioning';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_employee_auth_insert BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_auth_insert();

CREATE FUNCTION public.mark_employee_profile_pending() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.raw_app_meta_data ? 'employee_provisioning_id' THEN
    IF EXISTS(SELECT 1 FROM public.rider WHERE user_id=NEW.id) THEN
      RAISE EXCEPTION 'Employee bootstrap must not create Rider';
    END IF;
    UPDATE public."user" SET status='pending' WHERE id=NEW.id AND role='admin';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid employee public profile bootstrap'; END IF;
  ELSIF NEW.raw_app_meta_data ? 'admin_product_provisioning' THEN
    UPDATE public."user" SET status='pending' WHERE id=NEW.id AND role::text=(SELECT input->>'role' FROM public.product_provisioning WHERE user_id=NEW.id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid product public profile bootstrap'; END IF;
    UPDATE public.rider SET status='inactive' WHERE user_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
-- AFTER triggers execute by name; this follows on_auth_user_created.
CREATE TRIGGER zz_mark_employee_profile_pending AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.mark_employee_profile_pending();

CREATE FUNCTION public.provision_employee(p_actor uuid, p_input jsonb, p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.employee_provisioning; actor_role text; caps jsonb; requested text:=p_input->>'role';
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT a.role INTO actor_role FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
    WHERE a.user_id=p_actor AND u.status='active';
  caps:=public.ops_employee_capabilities(actor_role);
  IF NOT coalesce(caps ? 'users.manage',false) OR NOT coalesce(caps ?
      CASE WHEN requested IN ('super_admin','security_admin') THEN 'users.role.approve' ELSE 'users.role.assign' END,false) THEN
    RAISE EXCEPTION 'Unauthorized employee role assignment' USING ERRCODE='42501';
  END IF;
  -- Canonical roles are the generated template contract; do not accept aliases
  -- for new employees, or put owner/manager/staff/viewer in this role domain.
  IF requested IS NULL OR requested IN ('admin','moderator','support','compliance_officer','government')
     OR jsonb_array_length(public.ops_employee_capabilities(requested))=0
     OR p_input->>'status' IS NULL OR p_input->>'status' NOT IN ('active','inactive','pending')
     OR coalesce(btrim(p_input->>'name'),'')='' OR coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_input->>'email'<>lower(btrim(p_input->>'email'))
     OR p_input ?| ARRAY['organisationId','organisation_id','membershipRole','bundleKey'] THEN
    RAISE EXCEPTION 'Invalid employee provisioning contract';
  END IF;
  IF p_phase NOT IN ('reserve','persist','complete') THEN RAISE EXCEPTION 'Invalid provisioning phase'; END IF;
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
    INSERT INTO public.admin_users(user_id,email,role,created_by) VALUES(r.user_id,r.email,requested,p_actor);
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
REVOKE ALL ON FUNCTION public.provision_employee(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_employee(uuid,jsonb,text) TO service_role;

-- Profile edits and the dedicated role form share one atomic assignment path.
CREATE FUNCTION public.assign_employee_role(p_actor uuid,p_user uuid,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; v_public_role text; prior_role text;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a
    JOIN public."user" u ON u.id=a.user_id WHERE a.user_id=p_actor AND u.status='active';
  IF NOT coalesce(caps ? CASE WHEN p_role IN ('super_admin','security_admin') THEN 'users.role.approve' ELSE 'users.role.assign' END,false) THEN
    RAISE EXCEPTION 'Unauthorized role assignment' USING ERRCODE='42501';
  END IF;
  SELECT role::text INTO v_public_role FROM public."user" WHERE id=p_user FOR UPDATE;
  SELECT role INTO prior_role FROM public.admin_users WHERE user_id=p_user;
  IF v_public_role IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF p_role IN ('rider','advertiser') AND v_public_role=p_role THEN RETURN; END IF;
  IF p_actor=p_user AND NOT(public.ops_employee_capabilities(prior_role) @> public.ops_employee_capabilities(p_role)) THEN
    RAISE EXCEPTION 'Self-escalation is not permitted' USING ERRCODE='42501';
  END IF;
  IF p_role IS NULL OR p_role IN ('admin','moderator','support','compliance_officer','government')
      OR jsonb_array_length(public.ops_employee_capabilities(p_role))=0 THEN
    RAISE EXCEPTION 'Invalid employee role; product conversion requires its own workflow';
  END IF;
  IF v_public_role NOT IN ('admin','super_admin','moderator','support','gov')
     OR EXISTS(SELECT 1 FROM public.rider WHERE user_id=p_user)
     OR EXISTS(SELECT 1 FROM public.advertiser WHERE user_id=p_user) THEN
    RAISE EXCEPTION 'Product identities cannot be reclassified through employee assignment';
  END IF;
  -- Do not revive an incomplete provisioning reservation through a role edit.
  IF EXISTS(SELECT 1 FROM public.employee_provisioning WHERE user_id=p_user AND state<>'complete') THEN
    RAISE EXCEPTION 'Finish employee provisioning before changing its role';
  END IF;
  UPDATE public."user" SET role='admin',updated_at=now() WHERE id=p_user;
  INSERT INTO public.admin_users(user_id,email,role,created_by)
    SELECT id,email,p_role,p_actor FROM public."user" WHERE id=p_user
    ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,updated_at=now();
  IF prior_role IS DISTINCT FROM p_role THEN
    INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
      VALUES(p_actor,'admin',CASE WHEN p_role IN ('super_admin','security_admin') THEN 'users.role.approve' ELSE 'users.role.assign' END,
        'user',p_user::text,jsonb_build_object('role',prior_role),jsonb_build_object('role',p_role),gen_random_uuid()::text,'admin_employee_role_assignment_v1');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assign_employee_role(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_employee_role(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.update_admin_user_profile(p_actor uuid,p_user uuid,p_role text,p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id WHERE a.user_id=p_actor AND u.status='active';
  IF NOT coalesce(caps ? 'users.manage',false) THEN RAISE EXCEPTION 'Unauthorized profile update' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public."user" WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF p_role IS NOT NULL THEN PERFORM public.assign_employee_role(p_actor,p_user,p_role); END IF;
  UPDATE public."user" SET
    name=CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE name END,
    email=CASE WHEN p_patch ? 'email' THEN p_patch->>'email' ELSE email END,
    phone=CASE WHEN p_patch ? 'phone' THEN p_patch->>'phone' ELSE phone END,
    status=CASE WHEN p_patch ? 'status' THEN (p_patch->>'status')::public.user_status ELSE status END,
    organization=CASE WHEN p_patch ? 'organization' THEN p_patch->>'organization' ELSE organization END,
    language_preference=CASE WHEN p_patch ? 'language_preference' THEN p_patch->>'language_preference' ELSE language_preference END,
    is_verified=CASE WHEN p_patch ? 'is_verified' THEN (p_patch->>'is_verified')::boolean ELSE is_verified END,
    account_notes=CASE WHEN p_patch ? 'account_notes' THEN p_patch->>'account_notes' ELSE account_notes END,
    updated_at=now() WHERE id=p_user;
  -- Employee email is presentation data; preserve its exact role template.
  IF p_patch ? 'email' THEN UPDATE public.admin_users SET email=p_patch->>'email',updated_at=now() WHERE user_id=p_user; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_admin_user_profile(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_user_profile(uuid,uuid,text,jsonb) TO service_role;

-- Rider/Admin-created advertiser provisioning uses the same safety boundary.
-- Product roles stay in their existing enum. Durable reservations precede Auth,
-- and this RPC commits profile + advertiser/waitlist state together.
CREATE FUNCTION public.provision_product(p_actor uuid,p_id uuid,p_input jsonb,p_fingerprint text,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; identity auth.users; journal jsonb; requested text:=p_input->>'role'; required text; reservation public.product_provisioning;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  required:=CASE WHEN p_input ? 'waitlistId' THEN 'waitlist.manage' WHEN requested='advertiser' THEN 'advertisers.manage' ELSE 'users.manage' END;
  SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
    WHERE a.user_id=p_actor AND u.status='active';
  IF NOT coalesce(caps ? required,false) THEN RAISE EXCEPTION 'Unauthorized product provisioning' USING ERRCODE='42501'; END IF;
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
