-- ============================================================================
-- Migration 001: Phase 1 Schema Alignment
-- Aligns admin dashboard data model with mobile app source of truth.
-- Safe to run on a live database — all changes are additive or constraint-drops.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. reward_transactions: add 'standard_ride_bonus' to source CHECK constraint
--    Reason: mobile writes this source for all suggested-route compliance bonuses.
--    Without this, any standard_ride_bonus row violates the constraint at insert.
--    Backward-safe: existing rows are unaffected; only new rows benefit.
-- ----------------------------------------------------------------------------
ALTER TABLE public.reward_transactions
  DROP CONSTRAINT IF EXISTS reward_transactions_source_check;

ALTER TABLE public.reward_transactions
  ADD CONSTRAINT reward_transactions_source_check
    CHECK (source IN (
      'standard_ride',
      'ad_boost',
      'boosted_ride',
      'bonus',
      'standard_ride_bonus',
      'adjustment',
      'redemption'
    ));

-- ----------------------------------------------------------------------------
-- 2. campaign lifecycle status enum: add missing mobile states
--    Reason: mobile uses open_for_signup, selection_in_progress, confirmed as
--    distinct states before 'active'. Without these, all pre-active campaigns
--    silently fall through to 'draft' in the dashboard.
--    ADD VALUE IF NOT EXISTS is safe on Postgres 9.1+.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Only attempt enum modification if the type exists and uses a Postgres enum.
  -- If lifecycle_status is stored as TEXT with a CHECK constraint instead,
  -- skip this block and update the CHECK constraint below.
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'campaign_lifecycle_status'
  ) THEN
    ALTER TYPE campaign_lifecycle_status ADD VALUE IF NOT EXISTS 'open_for_signup';
    ALTER TYPE campaign_lifecycle_status ADD VALUE IF NOT EXISTS 'selection_in_progress';
    ALTER TYPE campaign_lifecycle_status ADD VALUE IF NOT EXISTS 'confirmed';
  END IF;
END $$;

-- If lifecycle_status is a TEXT column with a CHECK constraint, update that instead:
ALTER TABLE public.campaign
  DROP CONSTRAINT IF EXISTS campaign_lifecycle_status_check;

ALTER TABLE public.campaign
  ADD CONSTRAINT campaign_lifecycle_status_check
    CHECK (lifecycle_status IN (
      'draft',
      'open_for_signup',
      'selection_in_progress',
      'confirmed',
      'active',
      'paused',
      'completed',
      'cancelled'
    ));

-- ----------------------------------------------------------------------------
-- 3. ride_session: add 'status' column if it does not already exist
--    Reason: dashboard schema lacked the session lifecycle status field.
--    The column may already exist in the live DB under a different name;
--    this migration adds it only if absent.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ride_session
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled', 'rejected'));

-- Index for filtering by status in the sessions table
CREATE INDEX IF NOT EXISTS idx_ride_session_status
  ON public.ride_session USING btree (status)
  TABLESPACE pg_default;

-- ----------------------------------------------------------------------------
-- 4. CO₂ factor: update any stored platform_settings rows
--    The default was incorrect (0.021 = direct cycling emission).
--    Correct value: 0.180 kg/km (car-offset methodology, aligned with mobile).
--    Only updates rows where the value is still the old default.
-- ----------------------------------------------------------------------------
UPDATE public.platform_settings
  SET value = jsonb_set(value, '{co2KgPerKm}', '0.180')
  WHERE key = 'general'
    AND (value->>'co2KgPerKm')::numeric = 0.021;

UPDATE public.platform_settings
  SET value = jsonb_set(value, '{co2KgPerKm}', '0.180')
  WHERE key = 'impact'
    AND (value->>'co2KgPerKm')::numeric = 0.021;

-- ============================================================================
-- End of Migration 001
-- ============================================================================
