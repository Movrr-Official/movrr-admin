-- Migration 050: Platform invitations (reusable) + transactional Workboard accept.
--
-- BREAKING: Replaces legacy workboard_invites. After this migration:
--   • platform_invitations is the sole invitation store
--   • workboard_invites is dropped (no dual-read / dual-write compatibility)
--   • only token_hash is stored (no plaintext tokens)
--
-- Identity contract (Workboard): Option A — existing eligible platform admins only.
-- Status machine: pending | accepted | expired | revoked | rejected
--
-- Run in the Supabase SQL Editor (or migration runner) after workboard.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enum / status
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_invitation_status') THEN
    CREATE TYPE public.platform_invitation_status AS ENUM (
      'pending',
      'accepted',
      'expired',
      'revoked',
      'rejected'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- platform_invitations — scope-agnostic invitation records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  target_entity_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status public.platform_invitation_status NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  accepted_by uuid,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_invitations_email_lowercase CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS idx_platform_invitations_scope_target
  ON public.platform_invitations (scope, target_entity_id);

CREATE INDEX IF NOT EXISTS idx_platform_invitations_email_status
  ON public.platform_invitations (email, status);

CREATE INDEX IF NOT EXISTS idx_platform_invitations_status_expires
  ON public.platform_invitations (status, expires_at);

-- H5: at most one pending invitation per scope + target + email
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_invitations_one_pending
  ON public.platform_invitations (scope, target_entity_id, email)
  WHERE status = 'pending';

ALTER TABLE public.platform_invitations ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: no policies for authenticated clients.
-- Service role bypasses RLS. Drop any accidental permissive policy.
DROP POLICY IF EXISTS platform_invitations_service_all ON public.platform_invitations;
DROP POLICY IF EXISTS platform_invitations_select ON public.platform_invitations;
DROP POLICY IF EXISTS platform_invitations_insert ON public.platform_invitations;
DROP POLICY IF EXISTS platform_invitations_update ON public.platform_invitations;
DROP POLICY IF EXISTS platform_invitations_delete ON public.platform_invitations;

-- ---------------------------------------------------------------------------
-- One-time: copy any remaining legacy rows, then DROP workboard_invites entirely
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workboard_invites'
  ) THEN
    -- Deduplicate pending by (team, email) keeping newest before unique index applies
    INSERT INTO public.platform_invitations (
      id,
      scope,
      target_entity_id,
      email,
      role,
      token_hash,
      status,
      invited_by,
      accepted_by,
      accepted_at,
      expires_at,
      metadata,
      created_at,
      updated_at
    )
    SELECT DISTINCT ON (wi.team_id, lower(wi.email),
      CASE WHEN wi.accepted_at IS NOT NULL THEN 'accepted'
           WHEN wi.expires_at IS NOT NULL AND wi.expires_at < now() THEN 'expired'
           ELSE 'pending' END)
      wi.id,
      'workboard_team',
      wi.team_id,
      lower(wi.email),
      wi.role::text,
      encode(digest(wi.token, 'sha256'), 'hex'),
      CASE
        WHEN wi.accepted_at IS NOT NULL THEN 'accepted'::public.platform_invitation_status
        WHEN wi.expires_at IS NOT NULL AND wi.expires_at < now() THEN 'expired'::public.platform_invitation_status
        ELSE 'pending'::public.platform_invitation_status
      END,
      wi.invited_by,
      NULL,
      wi.accepted_at,
      COALESCE(wi.expires_at, wi.created_at + interval '7 days'),
      jsonb_build_object('source', 'workboard_invites_cutover'),
      wi.created_at,
      COALESCE(wi.accepted_at, wi.created_at)
    FROM public.workboard_invites wi
    ORDER BY wi.team_id, lower(wi.email),
      CASE WHEN wi.accepted_at IS NOT NULL THEN 'accepted'
           WHEN wi.expires_at IS NOT NULL AND wi.expires_at < now() THEN 'expired'
           ELSE 'pending' END,
      wi.created_at DESC
    ON CONFLICT (id) DO NOTHING;

    -- Drop legacy table immediately. Do not scrub tokens in-place: token has a
    -- UNIQUE constraint, so setting every row to the same sentinel fails.
    -- Dropping removes all plaintext with no dual-path leftover.
    DROP POLICY IF EXISTS workboard_invites_select ON public.workboard_invites;
    DROP POLICY IF EXISTS workboard_invites_insert ON public.workboard_invites;
    DROP POLICY IF EXISTS workboard_invites_update ON public.workboard_invites;
    DROP TABLE public.workboard_invites;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Schema readiness probe (app calls this; missing => fail closed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_invitations_ready()
RETURNS TABLE(
  ready boolean,
  table_ok boolean,
  accept_rpc_ok boolean,
  expire_rpc_ok boolean,
  pending_unique_ok boolean,
  legacy_table_absent boolean,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table boolean;
  v_accept boolean;
  v_expire boolean;
  v_prepare boolean;
  v_commit boolean;
  v_unique boolean;
  v_legacy_gone boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_invitations'
  ) INTO v_table;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'accept_workboard_platform_invitation'
  ) INTO v_accept;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'expire_platform_invitations'
  ) INTO v_expire;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prepare_resend_platform_invitation'
  ) INTO v_prepare;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'commit_resend_platform_invitation'
  ) INTO v_commit;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_platform_invitations_one_pending'
  ) INTO v_unique;

  SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workboard_invites'
  ) INTO v_legacy_gone;

  RETURN QUERY SELECT
    (v_table AND v_accept AND v_expire AND v_prepare AND v_commit AND v_unique AND v_legacy_gone),
    v_table,
    v_accept,
    v_expire,
    v_unique,
    v_legacy_gone,
    CASE
      WHEN v_table AND v_accept AND v_expire AND v_prepare AND v_commit AND v_unique AND v_legacy_gone
        THEN 'platform invitations ready'
      ELSE format(
        'incomplete: table=%s accept_rpc=%s expire_rpc=%s prepare_rpc=%s commit_rpc=%s pending_unique=%s legacy_absent=%s',
        v_table, v_accept, v_expire, v_prepare, v_commit, v_unique, v_legacy_gone
      )
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_invitations_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_invitations_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- Expire stale pending invitations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_platform_invitations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.expire_platform_invitations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_platform_invitations() TO service_role;

-- ---------------------------------------------------------------------------
-- Fail-safe resend (H1/H2): old token stays valid until commit after email
-- prepare → email → commit | abort
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_resend_platform_invitation(
  p_invitation_id uuid,
  p_next_token_hash text,
  p_expires_at timestamptz,
  p_invited_by uuid
)
RETURNS TABLE(
  success boolean,
  error_code text,
  error_message text,
  invitation_id uuid,
  email text,
  role text,
  scope text,
  target_entity_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.commit_resend_platform_invitation(
  p_invitation_id uuid
)
RETURNS TABLE(
  success boolean,
  error_code text,
  error_message text,
  invitation_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.abort_resend_platform_invitation(
  p_invitation_id uuid
)
RETURNS TABLE(
  success boolean,
  error_code text,
  error_message text,
  invitation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.prepare_resend_platform_invitation(uuid, text, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_resend_platform_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.abort_resend_platform_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_resend_platform_invitation(uuid, text, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_resend_platform_invitation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.abort_resend_platform_invitation(uuid) TO service_role;

-- Drop the unsafe rotate-in-place resend if present from earlier drafts
DROP FUNCTION IF EXISTS public.resend_platform_invitation(uuid, text, uuid, timestamptz);

-- ---------------------------------------------------------------------------
-- Transactional Workboard accept
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_workboard_platform_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
RETURNS TABLE(
  success boolean,
  error_code text,
  error_message text,
  invitation_id uuid,
  team_id uuid,
  membership_id uuid,
  membership_role text,
  result_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.accept_workboard_platform_invitation(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workboard_platform_invitation(text, uuid, text) TO service_role;
