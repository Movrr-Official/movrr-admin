-- Only explicit organisation invitations; reuse the platform invitation ledger.
BEGIN;
CREATE FUNCTION public.issue_organisation_invitation(p_actor uuid,p_user uuid,p_organisation uuid,p_role text,p_token_hash text,p_expected timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member jsonb; invite public.platform_invitations; email_address text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Hashed invitation token required'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organisation::text,71));
 SELECT lower(email) INTO email_address FROM auth.users WHERE id=p_user AND deleted_at IS NULL;
 IF email_address IS NULL THEN RAISE EXCEPTION 'Existing authentication identity required'; END IF;
 SELECT * INTO invite FROM public.platform_invitations WHERE scope='organisation' AND target_entity_id=p_organisation AND email=email_address AND status='pending' FOR UPDATE;
 IF invite.id IS NOT NULL AND invite.expires_at>now() THEN
  IF invite.token_hash=p_token_hash AND invite.role=p_role AND invite.invited_by=p_actor THEN
   member:=public.change_organisation_membership(p_actor,p_user,p_organisation,p_role,'invited',p_expected);
   IF member->>'updated_at' IS DISTINCT FROM invite.metadata->>'membershipVersion' THEN RAISE EXCEPTION 'Invitation was superseded'; END IF;
   RETURN to_jsonb(invite)-'token_hash';
  END IF;
  RAISE EXCEPTION 'A pending invitation already exists; revoke it before replacing access';
 END IF;
 IF invite.id IS NOT NULL THEN UPDATE public.platform_invitations SET status='expired',updated_at=now() WHERE id=invite.id; END IF;
 member:=public.change_organisation_membership(p_actor,p_user,p_organisation,p_role,'invited',p_expected);
 INSERT INTO public.platform_invitations(scope,target_entity_id,email,role,token_hash,invited_by,expires_at,metadata)
 VALUES('organisation',p_organisation,email_address,p_role,p_token_hash,p_actor,now()+interval '7 days',jsonb_build_object('membershipId',member->>'id','membershipVersion',member->>'updated_at')) RETURNING * INTO invite;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','staff.manage','platform_invitations',invite.id::text,to_jsonb(invite)-'token_hash',invite.id::text,'organisation_invitation.issue');
 RETURN to_jsonb(invite)-'token_hash';
END $$;
CREATE FUNCTION public.accept_organisation_invitation(p_user uuid,p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite public.platform_invitations; member public.organisation_membership; result jsonb;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 SELECT * INTO invite FROM public.platform_invitations WHERE scope='organisation' AND token_hash=p_token_hash;
 IF invite.id IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(invite.target_entity_id::text,71));
 SELECT * INTO invite FROM public.platform_invitations WHERE id=invite.id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM auth.users a JOIN public."user" u ON u.id=a.id WHERE a.id=p_user AND lower(a.email)=invite.email
  AND a.email_confirmed_at IS NOT NULL AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now()) AND u.status='active') THEN RAISE EXCEPTION 'Active verified invited identity required' USING ERRCODE='42501'; END IF;
 SELECT * INTO member FROM public.organisation_membership WHERE organisation_id=invite.target_entity_id AND user_id=p_user FOR UPDATE;
 IF invite.status='accepted' AND invite.accepted_by=p_user AND member.status='active' AND member.role=invite.role
  AND member.updated_at=(invite.metadata->>'acceptedMembershipVersion')::timestamptz THEN RETURN to_jsonb(member); END IF;
 IF invite.status<>'pending' OR invite.expires_at<=now() OR member.id IS NULL OR member.status<>'invited' OR member.role<>invite.role OR member.updated_at<>(invite.metadata->>'membershipVersion')::timestamptz THEN
  RAISE EXCEPTION 'Invitation expired, revoked or superseded; request a new invitation'; END IF;
 -- Revalidate the issuer's current authority, tenant status and exact membership
 -- version. Acceptance cannot resurrect access after revocation or role changes.
 UPDATE public.platform_invitations SET status='accepted',accepted_at=now(),accepted_by=p_user,updated_at=now() WHERE id=invite.id;
 result:=public.change_organisation_membership(invite.invited_by,p_user,invite.target_entity_id,invite.role,'active',member.updated_at);
 UPDATE public.platform_invitations SET metadata=metadata||jsonb_build_object('acceptedMembershipVersion',result->>'updated_at') WHERE id=invite.id;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_user,'organisation','staff.manage','platform_invitations',invite.id::text,jsonb_build_object('status','accepted'),invite.id::text,'organisation_invitation.accept');
 RETURN result;
END $$;
CREATE FUNCTION public.revoke_organisation_invitation(p_actor uuid,p_invitation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite public.platform_invitations; member public.organisation_membership;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(70001,1);
 SELECT * INTO invite FROM public.platform_invitations WHERE id=p_invitation AND scope='organisation';
 IF invite.id IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
 IF invite.status='revoked' AND invite.revoked_by=p_actor THEN RETURN; END IF;
 IF invite.status<>'pending' THEN RAISE EXCEPTION 'Invitation is no longer pending; manage the current membership explicitly'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(invite.target_entity_id::text,71));
 SELECT * INTO member FROM public.organisation_membership WHERE id=(invite.metadata->>'membershipId')::uuid FOR UPDATE;
 IF member.id IS NULL THEN RAISE EXCEPTION 'Invitation membership missing'; END IF;
 IF member.status<>'invited' OR member.updated_at IS DISTINCT FROM (invite.metadata->>'membershipVersion')::timestamptz THEN RAISE EXCEPTION 'Invitation was superseded'; END IF;
 PERFORM public.change_organisation_membership(p_actor,member.user_id,member.organisation_id,member.role,'revoked',member.updated_at);
 UPDATE public.platform_invitations SET status='revoked',revoked_at=now(),revoked_by=p_actor,updated_at=now() WHERE id=invite.id;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','staff.manage','platform_invitations',invite.id::text,jsonb_build_object('status','revoked'),invite.id::text,'organisation_invitation.revoke');
END $$;
REVOKE ALL ON FUNCTION public.issue_organisation_invitation(uuid,uuid,uuid,text,text,timestamptz),public.accept_organisation_invitation(uuid,text),public.revoke_organisation_invitation(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_organisation_invitation(uuid,uuid,uuid,text,text,timestamptz),public.accept_organisation_invitation(uuid,text),public.revoke_organisation_invitation(uuid,uuid) TO service_role;
COMMIT;
