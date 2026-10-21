-- Production execution requires explicit approval. No Auth operation is claimed atomic with SQL.
BEGIN;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.admin_users FROM anon,authenticated,service_role;
CREATE TABLE public.account_auth_sync(user_id uuid PRIMARY KEY REFERENCES auth.users(id),actor_id uuid NOT NULL REFERENCES auth.users(id),status text NOT NULL,
 version bigint NOT NULL,state text NOT NULL CHECK(state IN ('pending','applied')),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.account_auth_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_auth_sync FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.assign_employee_role(p_actor uuid,p_user uuid,p_role text,p_expected_role text)
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
 IF prior_role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Stale employee membership command; reload before saving' USING ERRCODE='40001'; END IF;
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
REVOKE ALL ON FUNCTION public.assign_employee_role(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_employee_role(uuid,uuid,text,text) TO service_role;


CREATE OR REPLACE FUNCTION public.update_admin_user_profile(p_actor uuid,p_user uuid,p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; target public."user"; resulting public."user";
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
   JOIN auth.users au ON au.id=a.user_id WHERE a.user_id=p_actor AND u.status='active' AND au.deleted_at IS NULL
   AND (au.banned_until IS NULL OR au.banned_until<=now());
 IF NOT coalesce(caps ? 'users.manage',false) THEN RAISE EXCEPTION 'Unauthorized profile update' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k
   WHERE k NOT IN ('name','email','phone','status','organization','language_preference','is_verified','account_notes','updated_at','employee_role','expected_employee_role','expected_updated_at')) THEN
   RAISE EXCEPTION 'Invalid profile patch; account type is not editable' USING ERRCODE='22023'; END IF;
 SELECT * INTO target FROM public."user" WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
 IF p_patch ? 'email' AND target.email IS DISTINCT FROM p_patch->>'email' THEN
   RAISE EXCEPTION 'Sign-in email changes require the verified Auth email-change workflow'; END IF;
 IF (p_patch ? 'status' OR p_patch ? 'employee_role') AND
   (p_patch->>'expected_updated_at' IS NULL OR target.updated_at IS DISTINCT FROM (p_patch->>'expected_updated_at')::timestamptz) THEN
   RAISE EXCEPTION 'Stale account command; reload before saving' USING ERRCODE='40001'; END IF;
 IF p_patch ? 'employee_role' THEN
   IF NOT (p_patch ? 'expected_employee_role') THEN RAISE EXCEPTION 'Expected employee role required'; END IF;
   PERFORM public.assign_employee_role(p_actor,p_user,p_patch->>'employee_role',p_patch->>'expected_employee_role');
 END IF;
 IF p_patch ? 'status' AND p_patch->>'status'<>'active' AND EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=p_user AND role='super_admin') AND NOT EXISTS(
   SELECT 1 FROM public.admin_users s JOIN public."user" u ON u.id=s.user_id JOIN auth.users a ON a.id=u.id WHERE s.user_id<>p_user AND s.role='super_admin'
     AND u.status='active' AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now())) THEN RAISE EXCEPTION 'Cannot suspend last active super administrator'; END IF;
 UPDATE public."user" SET
   name=CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE name END,
   email=CASE WHEN p_patch ? 'email' THEN p_patch->>'email' ELSE email END,
   phone=CASE WHEN p_patch ? 'phone' THEN p_patch->>'phone' ELSE phone END,
   status=CASE WHEN p_patch ? 'status' THEN (p_patch->>'status')::public.user_status ELSE status END,
   organization=CASE WHEN p_patch ? 'organization' THEN p_patch->>'organization' ELSE organization END,
   language_preference=CASE WHEN p_patch ? 'language_preference' THEN p_patch->>'language_preference' ELSE language_preference END,
   is_verified=CASE WHEN p_patch ? 'is_verified' THEN (p_patch->>'is_verified')::boolean ELSE is_verified END,
   account_notes=CASE WHEN p_patch ? 'account_notes' THEN p_patch->>'account_notes' ELSE account_notes END,updated_at=now()
   WHERE id=p_user RETURNING * INTO resulting;
 IF p_patch ? 'status' THEN
   INSERT INTO public.account_auth_sync(user_id,actor_id,status,version,state) VALUES(p_user,p_actor,resulting.status::text,1,'pending')
   ON CONFLICT(user_id) DO UPDATE SET actor_id=excluded.actor_id,status=excluded.status,version=account_auth_sync.version+1,state='pending',updated_at=now();
 END IF;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','users.manage','user',p_user::text,to_jsonb(target),to_jsonb(resulting),gen_random_uuid()::text,'account_profile.change');
 IF p_patch ? 'email' THEN UPDATE public.admin_users SET email=p_patch->>'email',updated_at=now() WHERE user_id=p_user; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_admin_user_profile(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_user_profile(uuid,uuid,jsonb) TO service_role;


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
    IF EXISTS(SELECT 1 FROM public.external_account_provisioning WHERE email=p_input->>'email') OR
       EXISTS(SELECT 1 FROM public.product_provisioning WHERE email=p_input->>'email') THEN RAISE EXCEPTION 'Email already reserved in another account domain'; END IF;
    IF p_phase<>'reserve' THEN RAISE EXCEPTION 'Provisioning reservation missing'; END IF;
    IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_input->>'email') THEN
      RAISE EXCEPTION 'Existing account: use its authorized invitation workflow; creation cannot reclassify it';
    END IF;
    INSERT INTO public.employee_provisioning(email,actor_id,input) VALUES(p_input->>'email',p_actor,p_input) RETURNING * INTO r;
  END IF;
  IF r.actor_id<>p_actor OR r.input<>p_input THEN RAISE EXCEPTION 'Conflicting provisioning request; original reservation preserved'; END IF;
  IF r.state IN ('ready','complete') AND (NOT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=r.user_id AND role=requested)
    OR NOT EXISTS(SELECT 1 FROM public."user" WHERE id=r.user_id AND email=r.email AND role IS NULL AND status::text=
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
      WHERE id=r.user_id AND role IS NULL AND status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending employee profile required'; END IF;
    PERFORM public.assign_employee_role(p_actor,r.user_id,requested,NULL);
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

DROP FUNCTION public.assign_employee_role(uuid,uuid,text);
CREATE FUNCTION public.account_auth_sync_state(p_actor uuid,p_user uuid,p_version bigint,p_ack boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt public.account_auth_sync;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 SELECT * INTO receipt FROM public.account_auth_sync WHERE user_id=p_user FOR UPDATE;
 IF receipt.user_id IS NULL THEN RAISE EXCEPTION 'Account Auth synchronization receipt missing'; END IF;
 IF receipt.actor_id<>p_actor AND NOT public.is_movrr_admin(p_actor) THEN RAISE EXCEPTION 'Unauthorized Auth synchronization' USING ERRCODE='42501'; END IF;
 IF p_ack THEN
  IF receipt.version<>p_version OR NOT EXISTS(SELECT 1 FROM public."user" WHERE id=p_user AND status::text=receipt.status) THEN RAISE EXCEPTION 'Stale Auth synchronization'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND
   ((receipt.status='active' AND (banned_until IS NULL OR banned_until<=now())) OR (receipt.status<>'active' AND banned_until>now()))) THEN RAISE EXCEPTION 'Auth status does not match durable intent'; END IF;
  UPDATE public.account_auth_sync SET state='applied',updated_at=now() WHERE user_id=p_user RETURNING * INTO receipt;
 END IF;
 RETURN to_jsonb(receipt);
END $$;
REVOKE ALL ON FUNCTION public.account_auth_sync_state(uuid,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_auth_sync_state(uuid,uuid,bigint,boolean) TO service_role;
COMMIT;
