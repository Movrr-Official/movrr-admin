-- Proposed P1 correction. Apply only after explicit production approval.
-- Expose only pending IDs to the guarded backend, never private sync receipts.
BEGIN;
CREATE FUNCTION public.read_user_auth_sync_pending(p_actor uuid, p_users uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' OR NOT public.account_identity_active(p_actor)
 OR NOT EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=p_actor
   AND public.ops_employee_capabilities(a.role) ? 'users.read') THEN
  RAISE EXCEPTION 'Users read capability required' USING ERRCODE='42501';
 END IF;
 IF cardinality(p_users)>500 THEN
  RAISE EXCEPTION 'At most 500 users per read' USING ERRCODE='22023';
 END IF;
 -- A scalar JSON projection cannot be truncated by PostgREST's row cap.
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id) ORDER BY s.user_id),'[]'::jsonb)
 FROM public.account_auth_sync s WHERE s.user_id=ANY(p_users) AND s.state='pending');
END $$;
REVOKE ALL ON FUNCTION public.read_user_auth_sync_pending(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_user_auth_sync_pending(uuid,uuid[]) TO service_role;
-- Direct table grants, RLS, identity/financial records and release gates unchanged.
COMMIT;
