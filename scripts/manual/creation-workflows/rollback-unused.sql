-- Approval required. DDL rollback only; never repairs/deletes any account.
-- Refuses to discard provisioning/retry evidence after these paths have been used.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.employee_provisioning) OR EXISTS(SELECT 1 FROM public.product_provisioning)
   OR EXISTS(SELECT 1 FROM public.admin_creation_operation)
   OR EXISTS(SELECT 1 FROM public.waitlist WHERE provisioning_user_id IS NOT NULL)
   OR EXISTS(SELECT 1 FROM public.platform_audit_record WHERE reason='admin_employee_role_assignment_v1') THEN
   RAISE EXCEPTION 'Creation/provisioning evidence exists. Preserve ledgers and use a reviewed forward recovery.';
 END IF;
END $$;
DROP TRIGGER guard_employee_auth_insert ON auth.users;
DROP TRIGGER zz_mark_employee_profile_pending ON auth.users;
DROP FUNCTION public.guard_employee_auth_insert();
DROP FUNCTION public.mark_employee_profile_pending();
DROP FUNCTION public.provision_employee(uuid,jsonb,text);
DROP FUNCTION public.provision_product(uuid,uuid,jsonb,text,text);
DROP FUNCTION public.update_admin_user_profile(uuid,uuid,text,jsonb);
DROP FUNCTION public.assign_employee_role(uuid,uuid,text);
DROP FUNCTION public.admin_create(uuid,uuid,text,jsonb);
DROP FUNCTION public.assign_admin_route(uuid,uuid,uuid[]);
DROP FUNCTION public.admin_save_catalog(uuid,uuid,jsonb,text,text,timestamptz);
DROP FUNCTION public.admin_catalog_partner(text,text);
DROP FUNCTION public.admin_update_creation_record(text,uuid,uuid,jsonb);
DROP FUNCTION public.admin_insert_creation_record(text,jsonb);
DROP TABLE public.employee_provisioning;
DROP TABLE public.product_provisioning;
DROP TABLE public.admin_creation_operation;
ALTER TABLE public.waitlist DROP COLUMN provisioning_user_id;
CREATE OR REPLACE FUNCTION public.accept_workboard_platform_invitation(p_token_hash text, p_user_id uuid, p_email text)
 RETURNS TABLE(success boolean, error_code text, error_message text, invitation_id uuid, team_id uuid, membership_id uuid, membership_role text, result_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ON CONFLICT (team_id, user_id) DO UPDATE
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
$function$
;
COMMIT;
