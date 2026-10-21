CREATE OR REPLACE FUNCTION public.abort_resend_platform_invitation(p_invitation_id uuid)
 RETURNS TABLE(success boolean, error_code text, error_message text, invitation_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.platform_invitations
  SET
    metadata = COALESCE(metadata, '{}'::jsonb)
      - 'next_token_hash'
      - 'next_expires_at'
      - 'next_prepared_by'
      - 'next_prepared_at',
    updated_at = now()
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found', 'Invite not found', NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, NULL::text, p_invitation_id;
EXCEPTION
  WHEN others THEN
    RETURN QUERY SELECT false, 'transaction_failed', 'Invitation resend abort failed', NULL::uuid;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.commit_resend_platform_invitation(p_invitation_id uuid)
 RETURNS TABLE(success boolean, error_code text, error_message text, invitation_id uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invite_row public.platform_invitations%ROWTYPE;
  next_hash text;
  next_exp timestamptz;
BEGIN
  SELECT * INTO invite_row
  FROM public.platform_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF invite_row.id IS NULL THEN
    RETURN QUERY SELECT false, 'not_found', 'Invite not found', NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  next_hash := invite_row.metadata ->> 'next_token_hash';
  next_exp := NULLIF(invite_row.metadata ->> 'next_expires_at', '')::timestamptz;

  IF next_hash IS NULL OR length(trim(next_hash)) = 0 OR next_exp IS NULL THEN
    RETURN QUERY SELECT false, 'not_prepared', 'No prepared resend to commit',
      invite_row.id, invite_row.expires_at;
    RETURN;
  END IF;

  UPDATE public.platform_invitations
  SET
    token_hash = next_hash,
    expires_at = next_exp,
    status = 'pending',
    revoked_at = NULL,
    revoked_by = NULL,
    updated_at = now(),
    metadata = (COALESCE(metadata, '{}'::jsonb)
      - 'next_token_hash'
      - 'next_expires_at'
      - 'next_prepared_by'
      - 'next_prepared_at')
      || jsonb_build_object('lastResentAt', now())
  WHERE id = invite_row.id
  RETURNING * INTO invite_row;

  RETURN QUERY SELECT true, NULL::text, NULL::text, invite_row.id, invite_row.expires_at;
EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT false, 'duplicate_pending',
      'Another pending invitation already exists for this recipient',
      NULL::uuid, NULL::timestamptz;
  WHEN others THEN
    RETURN QUERY SELECT false, 'transaction_failed', 'Invitation resend commit failed',
      NULL::uuid, NULL::timestamptz;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.expire_platform_invitations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.platform_invitations
  SET
    status = 'expired',
    updated_at = now()
  WHERE status = 'pending'
    AND expires_at < now();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.prepare_resend_platform_invitation(p_invitation_id uuid, p_next_token_hash text, p_expires_at timestamp with time zone, p_invited_by uuid)
 RETURNS TABLE(success boolean, error_code text, error_message text, invitation_id uuid, email text, role text, scope text, target_entity_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invite_row public.platform_invitations%ROWTYPE;
BEGIN
  IF p_invitation_id IS NULL OR p_next_token_hash IS NULL OR length(trim(p_next_token_hash)) = 0 THEN
    RETURN QUERY SELECT false, 'validation', 'invitation id and token hash are required',
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'validation', 'expires_at must be in the future',
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  PERFORM public.expire_platform_invitations();

  SELECT * INTO invite_row
  FROM public.platform_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF invite_row.id IS NULL THEN
    RETURN QUERY SELECT false, 'not_found', 'Invite not found',
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  IF invite_row.status = 'accepted' THEN
    RETURN QUERY SELECT false, 'already_accepted', 'Accepted invitations cannot be resent',
      invite_row.id, invite_row.email, invite_row.role, invite_row.scope, invite_row.target_entity_id;
    RETURN;
  END IF;

  IF invite_row.status = 'revoked' THEN
    RETURN QUERY SELECT false, 'revoked', 'Revoked invitations cannot be resent',
      invite_row.id, invite_row.email, invite_row.role, invite_row.scope, invite_row.target_entity_id;
    RETURN;
  END IF;

  -- Keep token_hash unchanged so the previous link remains valid until commit.
  UPDATE public.platform_invitations
  SET
    status = 'pending',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'next_token_hash', p_next_token_hash,
      'next_expires_at', p_expires_at,
      'next_prepared_by', p_invited_by,
      'next_prepared_at', now()
    ),
    updated_at = now()
  WHERE id = invite_row.id
  RETURNING * INTO invite_row;

  RETURN QUERY SELECT true, NULL::text, NULL::text,
    invite_row.id, invite_row.email, invite_row.role, invite_row.scope, invite_row.target_entity_id;
EXCEPTION
  WHEN others THEN
    RETURN QUERY SELECT false, 'transaction_failed', 'Invitation resend prepare failed',
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::uuid;
END;
$function$
;