-- Recover access to existing identities only. Memberships are read, never changed.
BEGIN;
CREATE FUNCTION public.account_access_state(p_actor uuid,p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caps jsonb; result jsonb;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 SELECT public.ops_employee_capabilities(role) INTO caps FROM public.admin_users WHERE user_id=p_actor;
 IF NOT public.account_identity_active(p_actor) OR NOT coalesce(caps ? 'users.read',false) THEN
  RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('userId',u.id,'eligible',public.account_identity_active(u.id),
  'hasPassword',coalesce(a.encrypted_password,'')<>'','lastSignInAt',a.last_sign_in_at,
  'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'organisationId',o.id,'organisationName',o.name,'membershipStatus',m.status,
    'invitationStatus',CASE WHEN i.status='pending' AND i.expires_at<=now() THEN 'expired' ELSE i.status::text END,
    'invitationExpiresAt',i.expires_at,'lastAttemptAt',attempt.created_at,
    'deliveryState',coalesce(outcome.resulting_state->>'deliveryState',CASE WHEN attempt.id IS NOT NULL THEN 'unknown' ELSE 'not_recorded' END),
    'providerId',outcome.resulting_state->>'providerId',
    'retryAt',(SELECT max(ar.created_at+CASE WHEN EXISTS(SELECT 1 FROM public.platform_audit_record fin
      WHERE fin.reason='account_access.outcome' AND fin.correlation_id=ar.correlation_id) THEN interval '5 minutes' ELSE interval '15 minutes' END)
      FROM public.platform_audit_record ar WHERE ar.reason='account_access.attempt' AND ar.target_entity_id=u.id::text),
    'canSend',public.account_identity_active(u.id) AND o.status='active' AND m.status IN ('active','invited')
      AND coalesce(caps ? 'users.manage',false)
      AND coalesce(caps ? CASE WHEN m.role='owner' THEN 'users.role.approve' ELSE 'users.role.assign' END,false)
      AND (m.status<>'invited' OR i.id IS NULL OR (i.status IN ('pending','expired') AND i.role=m.role
        AND i.metadata->>'membershipId'=m.id::text AND (i.metadata->>'membershipVersion')::timestamptz=m.updated_at))
      AND NOT EXISTS(SELECT 1 FROM public.admin_users staff WHERE staff.user_id=u.id AND staff.role IS NOT NULL)
   ) ORDER BY o.name)
   FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id
   LEFT JOIN LATERAL (SELECT pi.* FROM public.platform_invitations pi WHERE pi.scope='organisation'
     AND pi.target_entity_id=o.id AND pi.email=lower(a.email) ORDER BY pi.created_at DESC LIMIT 1) i ON true
   LEFT JOIN LATERAL (SELECT ar.* FROM public.platform_audit_record ar WHERE ar.target_entity_type='account_access'
     AND ar.target_entity_id=u.id::text AND ar.reason='account_access.attempt'
     AND ar.resulting_state->>'organisationId'=o.id::text ORDER BY ar.created_at DESC LIMIT 1) attempt ON true
   LEFT JOIN LATERAL (SELECT ar.* FROM public.platform_audit_record ar WHERE ar.reason IN ('account_access.outcome','account_access.delivery')
     AND ar.correlation_id=attempt.correlation_id ORDER BY ar.created_at DESC LIMIT 1) outcome ON true
   WHERE m.user_id=u.id AND o.type IN ('reward_partner','advertiser','government')), '[]'::jsonb))
 INTO result FROM public."user" u JOIN auth.users a ON a.id=u.id WHERE u.id=p_user;
 IF result IS NULL THEN RAISE EXCEPTION 'Account access unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.begin_account_access(p_actor uuid,p_user uuid,p_organisation uuid,p_attempt uuid,p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb; member public.organisation_membership; invite public.platform_invitations; recipient auth.users; action text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 -- Same authority lock as employee/membership/status commands, plus per-identity
 -- serialization across organisations: one Auth recovery token per identity.
 PERFORM pg_advisory_xact_lock(70001,1);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,87));
 state:=public.account_access_state(p_actor,p_user);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'memberships') m
   WHERE m->>'organisationId'=p_organisation::text AND (m->>'canSend')::boolean) THEN
  RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501'; END IF;
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_attempt IS NULL THEN RAISE EXCEPTION 'Invalid access command'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_audit_record WHERE reason='account_access.attempt' AND target_entity_id=p_user::text
   AND created_at>now()-interval '5 minutes') OR EXISTS(
   SELECT 1 FROM public.platform_audit_record a WHERE a.reason='account_access.attempt' AND a.target_entity_id=p_user::text
   AND a.created_at>now()-interval '15 minutes' AND NOT EXISTS(SELECT 1 FROM public.platform_audit_record o
     WHERE o.reason='account_access.outcome' AND o.correlation_id=a.correlation_id)) THEN
  RAISE EXCEPTION 'An access email is pending or cooling down. Retry in 15 minutes.' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM public.platform_audit_record WHERE reason='account_access.attempt'
    AND actor_user_id=p_actor AND created_at>now()-interval '1 hour')>=20 OR
    (SELECT count(*) FROM public.platform_audit_record WHERE reason='account_access.attempt'
    AND target_entity_id=p_user::text AND created_at>now()-interval '1 hour')>=5 THEN
  RAISE EXCEPTION 'Access email hourly limit reached. Retry later.' USING ERRCODE='40001'; END IF;
 SELECT * INTO member FROM public.organisation_membership WHERE user_id=p_user AND organisation_id=p_organisation FOR UPDATE;
 SELECT * INTO recipient FROM auth.users WHERE id=p_user FOR UPDATE;
 SELECT * INTO invite FROM public.platform_invitations WHERE scope='organisation' AND target_entity_id=p_organisation
  AND email=lower(recipient.email) ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 action:=CASE WHEN member.status='invited' THEN CASE WHEN invite.id IS NULL THEN 'invitation' ELSE 'resend' END
  WHEN coalesce(recipient.encrypted_password,'')='' OR recipient.last_sign_in_at IS NULL THEN 'setup' ELSE 'reset' END;
 IF member.status='invited' THEN
  -- A revoked/rejected or mismatched invitation must never be resurrected.
  IF invite.id IS NOT NULL AND (invite.status NOT IN ('pending','expired') OR invite.role<>member.role
    OR invite.metadata->>'membershipId' IS DISTINCT FROM member.id::text
    OR (invite.metadata->>'membershipVersion')::timestamptz IS DISTINCT FROM member.updated_at) THEN
   RAISE EXCEPTION 'Invitation superseded. Review membership before sending.' USING ERRCODE='40001'; END IF;
  IF invite.id IS NULL THEN
   INSERT INTO public.platform_invitations(scope,target_entity_id,email,role,token_hash,invited_by,expires_at,metadata)
   VALUES('organisation',p_organisation,lower(recipient.email),member.role,p_token_hash,p_actor,now()+interval '1 hour',
    jsonb_build_object('membershipId',member.id,'membershipVersion',member.updated_at)) RETURNING * INTO invite;
  ELSE
   UPDATE public.platform_invitations SET token_hash=p_token_hash,status='pending',invited_by=p_actor,
    expires_at=now()+interval '1 hour',updated_at=now() WHERE id=invite.id RETURNING * INTO invite;
  END IF;
 END IF;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','users.manage','account_access',p_user::text,
  jsonb_build_object('organisationId',p_organisation,'action',action,'deliveryState','pending'),p_attempt::text,'account_access.attempt');
 RETURN jsonb_build_object('email',recipient.email,'name',(SELECT name FROM public."user" WHERE id=p_user),
  'organisationName',(SELECT name FROM public.organisation WHERE id=p_organisation),'action',action,
  'invitationExpiresAt',CASE WHEN member.status='invited' THEN invite.expires_at END);
END $$;

CREATE FUNCTION public.finish_account_access(p_actor uuid,p_user uuid,p_attempt uuid,p_state text,p_provider_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,87));
 IF p_state IS NULL OR p_state NOT IN ('accepted','failed','unknown') OR NOT EXISTS(SELECT 1 FROM public.platform_audit_record
  WHERE reason='account_access.attempt' AND correlation_id=p_attempt::text AND actor_user_id=p_actor AND target_entity_id=p_user::text) THEN
  RAISE EXCEPTION 'Invalid access outcome' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_audit_record WHERE reason='account_access.outcome' AND correlation_id=p_attempt::text) THEN RETURN; END IF;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','users.manage','account_access',p_user::text,
  jsonb_build_object('deliveryState',p_state,'providerId',p_provider_id),p_attempt::text,'account_access.outcome');
END $$;
CREATE FUNCTION public.record_account_access_delivery(p_actor uuid,p_user uuid,p_provider_id text,p_state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt public.platform_audit_record;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 PERFORM public.account_access_state(p_actor,p_user);
 IF p_state IS NULL OR p_state NOT IN ('delivered','bounced','complained','delivery_delayed','failed','suppressed') THEN RAISE EXCEPTION 'Invalid provider event'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,87));
 SELECT * INTO receipt FROM public.platform_audit_record WHERE reason='account_access.outcome'
  AND target_entity_id=p_user::text AND resulting_state->>'providerId'=p_provider_id AND resulting_state->>'deliveryState'='accepted' LIMIT 1;
 IF receipt.id IS NULL THEN RAISE EXCEPTION 'Unknown provider receipt' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_audit_record WHERE reason='account_access.delivery' AND correlation_id=receipt.correlation_id
   AND resulting_state->>'deliveryState'=p_state) THEN RETURN; END IF;
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','users.read','account_access',p_user::text,jsonb_build_object('deliveryState',p_state,'providerId',p_provider_id),receipt.correlation_id,'account_access.delivery');
END $$;
REVOKE ALL ON FUNCTION public.account_access_state(uuid,uuid),public.begin_account_access(uuid,uuid,uuid,uuid,text),public.finish_account_access(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_access_state(uuid,uuid),public.begin_account_access(uuid,uuid,uuid,uuid,text),public.finish_account_access(uuid,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.record_account_access_delivery(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_account_access_delivery(uuid,uuid,text,text) TO service_role;
CREATE INDEX account_access_attempt_lookup ON public.platform_audit_record(target_entity_id,created_at DESC) WHERE reason='account_access.attempt';
CREATE INDEX account_access_actor_lookup ON public.platform_audit_record(actor_user_id,created_at DESC) WHERE reason='account_access.attempt';
CREATE INDEX account_access_outcome_lookup ON public.platform_audit_record(correlation_id) WHERE reason IN ('account_access.outcome','account_access.delivery');
COMMIT;
