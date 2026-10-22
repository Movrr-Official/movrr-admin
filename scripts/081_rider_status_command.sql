-- Production execution requires explicit approval.
-- Rider status changes from Admin: canonical capability, row lock, stale-state
-- rejection and the audit/activity records commit atomically with the change.
BEGIN;
CREATE FUNCTION public.admin_set_rider_status(p_actor uuid,p_rider uuid,p_active boolean,p_expected_active boolean,p_correlation text,p_bulk boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; target public.rider; resulting text; label text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF p_active IS NULL OR p_expected_active IS NULL THEN RAISE EXCEPTION 'Requested and current Rider status are required' USING ERRCODE='22023'; END IF;
 SELECT public.ops_employee_capabilities(a.role) INTO caps FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id
   JOIN auth.users au ON au.id=a.user_id WHERE a.user_id=p_actor AND u.status='active'
   AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now());
 IF NOT coalesce(caps ? 'riders.manage',false) THEN RAISE EXCEPTION 'Unauthorized Rider status change' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.rider WHERE id=p_rider FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rider profile not found' USING ERRCODE='P0002'; END IF;
 -- Existing Admin mapping: activate -> active, deactivate -> suspended. A profile
 -- that is already non-active is never rewritten to a different stored state.
 IF (target.status='active') = p_active THEN
   RETURN jsonb_build_object('changed',false,'status',target.status::text);
 END IF;
 IF (target.status='active') IS DISTINCT FROM p_expected_active THEN
   RAISE EXCEPTION 'Rider status changed; reload before saving' USING ERRCODE='40001';
 END IF;
 resulting:=CASE WHEN p_active THEN 'active' ELSE 'suspended' END;
 UPDATE public.rider SET status=resulting::public.rider_status WHERE id=p_rider;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
   VALUES(p_actor,'admin','riders.manage','rider',p_rider::text,jsonb_build_object('status',target.status::text),
     jsonb_build_object('status',resulting),coalesce(nullif(trim(p_correlation),''),gen_random_uuid()::text),'rider_status.change');
 IF target.user_id IS NOT NULL THEN
   label:=CASE WHEN p_active THEN 'Rider activated' ELSE 'Rider suspended' END;
   INSERT INTO public.user_activity(user_id,actor_user_id,source,action,description,related_entity_type,related_entity_id,metadata)
     VALUES(target.user_id,p_actor,'account',label||CASE WHEN coalesce(p_bulk,false) THEN ' (bulk)' ELSE '' END,
       label||CASE WHEN coalesce(p_bulk,false) THEN ' in a bulk operation by admin.' ELSE ' by admin.' END,'rider',p_rider::text,
       jsonb_build_object('riderId',p_rider,'previousStatus',target.status::text,'newStatus',resulting,'bulk',coalesce(p_bulk,false)));
 END IF;
 RETURN jsonb_build_object('changed',true,'status',resulting,'previous',target.status::text);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_rider_status(uuid,uuid,boolean,boolean,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_rider_status(uuid,uuid,boolean,boolean,text,boolean) TO service_role;
COMMIT;
