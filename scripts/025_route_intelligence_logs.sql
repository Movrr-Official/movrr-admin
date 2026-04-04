-- Migration: Route Intelligence Logs (LLM shadow mode)
-- Stores the output of every shadow LLM execution alongside the corresponding
-- deterministic optimizer result. Used for offline evaluation only.
-- Nothing in this table influences live routing, rewards, or user behavior.

CREATE TABLE IF NOT EXISTS public.route_intelligence_logs (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id                      TEXT,
  capability                    TEXT NOT NULL
    CHECK (capability IN ('route_suggestion', 'route_explanation', 'policy_translation')),
  input_summary                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  deterministic_output_summary  JSONB,
  llm_output                    JSONB,
  validation_status             TEXT NOT NULL
    CHECK (validation_status IN ('success', 'validation_failed', 'llm_error', 'disabled', 'skipped')),
  latency_ms                    INTEGER,
  model_name                    TEXT,
  error_message                 TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for admin diagnostic queries
CREATE INDEX IF NOT EXISTS idx_ril_created_at
  ON public.route_intelligence_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ril_trace_id
  ON public.route_intelligence_logs(trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ril_capability_status
  ON public.route_intelligence_logs(capability, validation_status);

-- Admin-only RLS: only readable by authenticated admin_users, never by riders.
-- Writes happen exclusively via the service-role key from the shadow service.
ALTER TABLE public.route_intelligence_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read route intelligence logs" ON public.route_intelligence_logs;
CREATE POLICY "Admins can read route intelligence logs"
  ON public.route_intelligence_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies — all writes use the service role key.

COMMENT ON TABLE public.route_intelligence_logs IS
  'Shadow-mode LLM execution logs. Records inputs, deterministic optimizer outputs, '
  'and LLM responses for offline evaluation. Contents are experimental and '
  'have zero influence on live routing, rewards, or user-facing behavior.';
