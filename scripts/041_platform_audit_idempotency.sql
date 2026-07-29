-- Migration 041: Platform audit (append-only) + fraud policy stores
-- Idempotency keyed by (principal_id, scope, key); replay via consumed jti; rate-limit counters.

-- ---------------------------------------------------------------------------
-- Immutable audit records (insert-only; no UPDATE/DELETE grants for app roles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_audit_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  actor_email text,
  principal_type text NOT NULL
    CHECK (principal_type IN ('admin', 'organisation', 'rider')),
  capability text,
  target_entity_type text NOT NULL,
  target_entity_id text NOT NULL,
  previous_state jsonb,
  resulting_state jsonb,
  correlation_id text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor
  ON public.platform_audit_record (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_target
  ON public.platform_audit_record (target_entity_type, target_entity_id);

CREATE INDEX IF NOT EXISTS idx_platform_audit_correlation
  ON public.platform_audit_record (correlation_id);

-- Block updates/deletes at the database level (append-only).
CREATE OR REPLACE FUNCTION public.forbid_platform_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_record is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_audit_no_update ON public.platform_audit_record;
CREATE TRIGGER trg_platform_audit_no_update
  BEFORE UPDATE ON public.platform_audit_record
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_platform_audit_mutation();

DROP TRIGGER IF EXISTS trg_platform_audit_no_delete ON public.platform_audit_record;
CREATE TRIGGER trg_platform_audit_no_delete
  BEFORE DELETE ON public.platform_audit_record
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_platform_audit_mutation();

-- ---------------------------------------------------------------------------
-- Idempotency store: (principal_id, scope, key) → prior success payload
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_idempotency_key (
  principal_id text NOT NULL,
  scope text NOT NULL,
  key text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id, scope, key)
);

CREATE INDEX IF NOT EXISTS idx_platform_idempotency_created
  ON public.platform_idempotency_key (created_at);

-- ---------------------------------------------------------------------------
-- Replay protection: consumed one-time identifiers (jti / token nonce)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_consumed_jti (
  jti text PRIMARY KEY,
  principal_id text,
  scope text,
  consumed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_consumed_jti_consumed
  ON public.platform_consumed_jti (consumed_at);

-- ---------------------------------------------------------------------------
-- Rate-limit counters (fixed window); distributed alternative to in-memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_rate_limit_counter (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_platform_rate_limit_window
  ON public.platform_rate_limit_counter (window_start);

-- ---------------------------------------------------------------------------
-- RLS — service-role / dashboard admin paths for platform stores
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_audit_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_idempotency_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_consumed_jti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_rate_limit_counter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dashboard admins read audit" ON public.platform_audit_record;
CREATE POLICY "Dashboard admins read audit"
  ON public.platform_audit_record
  FOR SELECT
  USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins insert audit" ON public.platform_audit_record;
CREATE POLICY "Dashboard admins insert audit"
  ON public.platform_audit_record
  FOR INSERT
  WITH CHECK (public.is_dashboard_admin());

-- No UPDATE/DELETE policies on platform_audit_record (append-only).

DROP POLICY IF EXISTS "Dashboard admins manage idempotency" ON public.platform_idempotency_key;
CREATE POLICY "Dashboard admins manage idempotency"
  ON public.platform_idempotency_key
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins manage consumed jti" ON public.platform_consumed_jti;
CREATE POLICY "Dashboard admins manage consumed jti"
  ON public.platform_consumed_jti
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins manage rate limits" ON public.platform_rate_limit_counter;
CREATE POLICY "Dashboard admins manage rate limits"
  ON public.platform_rate_limit_counter
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());
