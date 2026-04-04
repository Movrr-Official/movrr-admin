-- Migration: Suggested Routes (Free Ride Mode)
-- Creates the suggested_routes table and extends ride_session with
-- Free Ride Mode tracking columns.

-- ─── suggested_routes ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suggested_routes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  geometry        JSONB NOT NULL DEFAULT '[]'::jsonb,
  city            TEXT,
  zones           TEXT[] NOT NULL DEFAULT '{}',
  difficulty      TEXT NOT NULL DEFAULT 'easy'
                    CHECK (difficulty IN ('easy', 'moderate', 'challenging')),
  estimated_duration_minutes  INTEGER NOT NULL DEFAULT 30 CHECK (estimated_duration_minutes > 0),
  estimated_distance_meters   INTEGER NOT NULL DEFAULT 5000 CHECK (estimated_distance_meters > 0),
  reward_type     TEXT NOT NULL DEFAULT 'bonus'
                    CHECK (reward_type IN ('multiplier', 'bonus')),
  reward_value    NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (reward_value >= 0),
  max_bonus_per_ride    INTEGER,
  max_total_rewards     INTEGER,
  active          BOOLEAN NOT NULL DEFAULT true,
  start_at        TIMESTAMPTZ,
  end_at          TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggested_routes_active
  ON public.suggested_routes(active);
CREATE INDEX IF NOT EXISTS idx_suggested_routes_city
  ON public.suggested_routes(city)
  WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suggested_routes_active_window
  ON public.suggested_routes(active, start_at, end_at);

COMMENT ON TABLE public.suggested_routes IS
  'Admin-curated cycling routes shown to riders in Free Ride Mode. '
  'Riders earn bonus points or multipliers for completing compliant traces.';

-- ─── ride_session extensions ──────────────────────────────────────────────────

ALTER TABLE public.ride_session
  ADD COLUMN IF NOT EXISTS suggested_route_id UUID
    REFERENCES public.suggested_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compliance_score    NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS bonus_applied       INTEGER,
  ADD COLUMN IF NOT EXISTS multiplier_applied  NUMERIC(10,4);

CREATE INDEX IF NOT EXISTS idx_ride_session_suggested_route_id
  ON public.ride_session(suggested_route_id)
  WHERE suggested_route_id IS NOT NULL;

-- ─── reward_transactions: allow free_ride_bonus source ───────────────────────
-- Drop the old CHECK constraint and recreate it including the new source value.

ALTER TABLE public.reward_transactions
  DROP CONSTRAINT IF EXISTS reward_transactions_source_check;

ALTER TABLE public.reward_transactions
  ADD CONSTRAINT reward_transactions_source_check
    CHECK (source IN (
      'standard_ride',
      'ad_boost',
      'campaign_ride',
      'free_ride_bonus',
      'bonus',
      'adjustment',
      'redemption'
    ));

-- ─── RLS for suggested_routes ─────────────────────────────────────────────────
-- Riders can read active routes via the public API (no auth required at DB
-- level; the API layer enforces its own controls). Writes are admin-only and
-- executed via the service-role key, so no rider write policies needed.

ALTER TABLE public.suggested_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active suggested routes" ON public.suggested_routes;
CREATE POLICY "Public read active suggested routes"
  ON public.suggested_routes
  FOR SELECT
  USING (active = true);
