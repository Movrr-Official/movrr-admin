-- Workboard resend is a distinct legitimate collaboration lifecycle, never an
-- alternative organisation invitation authority. Retire anonymous resend RPCs.
BEGIN;
CREATE FUNCTION public.assert_workboard_invitation_actor(p_invitation uuid,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.account_identity_active(p_actor) OR NOT EXISTS(
  SELECT 1 FROM public.admin_users a WHERE a.user_id=p_actor AND public.ops_employee_capabilities(a.role) ? 'workboard.access') OR NOT EXISTS(
  SELECT 1 FROM public.platform_invitations i JOIN public.workboard_team_members m ON m.team_id=i.target_entity_id
  WHERE i.id=p_invitation AND i.scope='workboard_team' AND m.user_id=p_actor AND m.status='active' AND m.role IN ('owner','admin')
   AND (i.role<>'owner' OR m.role='owner')) THEN
  RAISE EXCEPTION 'Active authorized Workboard invitation administrator required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_workboard_invitation_actor(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.prepare_resend_platform_invitation(p_invitation_id uuid,p_next_token_hash text,p_expires_at timestamptz,p_invited_by uuid)
RETURNS TABLE(success boolean,error_code text,error_message text,invitation_id uuid,email text,role text,scope text,target_entity_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite public.platform_invitations;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 PERFORM public.assert_workboard_invitation_actor(p_invitation_id,p_invited_by);
 SELECT * INTO invite FROM public.platform_invitations i WHERE i.id=p_invitation_id FOR UPDATE;
 IF p_next_token_hash IS NULL OR p_next_token_hash !~ '^[a-f0-9]{64}$' OR p_expires_at IS NULL OR p_expires_at<=now() OR p_expires_at>now()+interval '7 days' OR invite.status NOT IN ('pending','expired') THEN
  RAISE EXCEPTION 'Invalid or no longer pending invitation resend'; END IF;
 IF invite.metadata->>'next_token_hash' IS NOT NULL AND (invite.metadata->>'next_token_hash'<>p_next_token_hash OR invite.metadata->>'next_prepared_by'<>p_invited_by::text) THEN
  RAISE EXCEPTION 'Another resend is already prepared; reconcile or abort that exact command' USING ERRCODE='40001'; END IF;
 UPDATE public.platform_invitations i SET metadata=coalesce(i.metadata,'{}')||jsonb_build_object('next_token_hash',p_next_token_hash,'next_expires_at',p_expires_at,'next_prepared_by',p_invited_by,'next_prepared_at',now()),updated_at=now()
 WHERE i.id=invite.id;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_invited_by,'admin','workboard.access','platform_invitations',invite.id::text,jsonb_build_object('resend','prepared'),invite.id::text,'workboard.invitation.resend.prepare');
 RETURN QUERY SELECT true,NULL::text,NULL::text,invite.id,invite.email,invite.role,invite.scope,invite.target_entity_id;
END $$;

CREATE FUNCTION public.commit_resend_platform_invitation(p_invitation_id uuid,p_actor uuid,p_expected_hash text)
RETURNS TABLE(success boolean,error_code text,error_message text,invitation_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite public.platform_invitations;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 PERFORM public.assert_workboard_invitation_actor(p_invitation_id,p_actor);
 SELECT * INTO invite FROM public.platform_invitations i WHERE i.id=p_invitation_id FOR UPDATE;
 IF invite.status='pending' AND invite.token_hash=p_expected_hash AND invite.metadata->>'next_token_hash' IS NULL THEN
  RETURN QUERY SELECT true,NULL::text,NULL::text,invite.id,invite.expires_at; RETURN; END IF;
 IF invite.status NOT IN ('pending','expired') OR invite.metadata->>'next_prepared_by' IS DISTINCT FROM p_actor::text
  OR invite.metadata->>'next_token_hash' IS DISTINCT FROM p_expected_hash OR p_expected_hash IS NULL OR
  (invite.metadata->>'next_expires_at')::timestamptz<=now() THEN RAISE EXCEPTION 'Stale or unauthorized resend commit' USING ERRCODE='40001'; END IF;
 UPDATE public.platform_invitations i SET token_hash=p_expected_hash,expires_at=(i.metadata->>'next_expires_at')::timestamptz,status='pending',updated_at=now(),
  metadata=(i.metadata-ARRAY['next_token_hash','next_expires_at','next_prepared_by','next_prepared_at'])||jsonb_build_object('lastResentAt',now()) WHERE i.id=invite.id RETURNING * INTO invite;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','workboard.access','platform_invitations',invite.id::text,jsonb_build_object('status','pending','expiresAt',invite.expires_at),invite.id::text,'workboard.invitation.resend.commit');
 RETURN QUERY SELECT true,NULL::text,NULL::text,invite.id,invite.expires_at;
END $$;

CREATE FUNCTION public.abort_resend_platform_invitation(p_invitation_id uuid,p_actor uuid,p_expected_hash text)
RETURNS TABLE(success boolean,error_code text,error_message text,invitation_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite public.platform_invitations;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 PERFORM public.assert_workboard_invitation_actor(p_invitation_id,p_actor);
 SELECT * INTO invite FROM public.platform_invitations i WHERE i.id=p_invitation_id FOR UPDATE;
 IF invite.metadata->>'next_token_hash' IS NULL THEN RETURN QUERY SELECT true,NULL::text,NULL::text,invite.id; RETURN; END IF;
 -- Any currently authorized team administrator may recover an abandoned exact
 -- preparation; the original actor may already have lost access. Commit remains
 -- bound to its original actor. An old hash cannot abort a newer preparation.
 IF invite.metadata->>'next_token_hash' IS DISTINCT FROM p_expected_hash OR p_expected_hash IS NULL THEN
  RAISE EXCEPTION 'Stale or unauthorized resend abort' USING ERRCODE='40001'; END IF;
 UPDATE public.platform_invitations i SET metadata=i.metadata-ARRAY['next_token_hash','next_expires_at','next_prepared_by','next_prepared_at'],updated_at=now() WHERE i.id=invite.id;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','workboard.access','platform_invitations',invite.id::text,jsonb_build_object('resend','aborted','priorTokenPreserved',true),invite.id::text,'workboard.invitation.resend.abort');
 RETURN QUERY SELECT true,NULL::text,NULL::text,invite.id;
END $$;
DROP FUNCTION public.commit_resend_platform_invitation(uuid),public.abort_resend_platform_invitation(uuid);
REVOKE ALL ON FUNCTION public.prepare_resend_platform_invitation(uuid,text,timestamptz,uuid),public.commit_resend_platform_invitation(uuid,uuid,text),public.abort_resend_platform_invitation(uuid,uuid,text),public.expire_platform_invitations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_resend_platform_invitation(uuid,text,timestamptz,uuid),public.commit_resend_platform_invitation(uuid,uuid,text),public.abort_resend_platform_invitation(uuid,uuid,text),public.expire_platform_invitations() TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.platform_invitations FROM anon,authenticated;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.platform_invitations FROM service_role;

CREATE FUNCTION public.protect_organisation_invitation_writer() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated','service_role') AND (NEW.scope='organisation' OR OLD.scope='organisation') THEN
  RAISE EXCEPTION 'Organisation invitations require the canonical lifecycle command' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_organisation_invitation_writer BEFORE INSERT OR UPDATE OR DELETE ON public.platform_invitations FOR EACH ROW EXECUTE FUNCTION public.protect_organisation_invitation_writer();
COMMIT;
