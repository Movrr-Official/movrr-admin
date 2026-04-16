-- Migration 032: Tracking, Compliance & Live Map Tables
-- Creates all server-side tables required for the production tracking system:
--   ride_gps_point, zone_visit, corridor_compliance, session_flag
-- Extends ride_session with policy_snapshot and algorithm_version.
-- Extends suggested_routes with mode and tolerance_m (Standard Ride vs Campaign).
--
-- IDEMPOTENT — safe to run multiple times.

-- ─── ride_gps_point ──────────────────────────────────────────────────────────
-- Append-only, immutable record of every GPS sample received from mobile.
-- Authoritative input for all backend compliance verification.

CREATE TABLE IF NOT EXISTS public.ride_gps_point (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID        NOT NULL REFERENCES public.ride_session(id) ON DELETE CASCADE,
  lat           DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon           DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
  speed_kmh     FLOAT       CHECK (speed_kmh >= 0),
  accuracy_m    FLOAT       CHECK (accuracy_m >= 0),
  heading       FLOAT       CHECK (heading BETWEEN 0 AND 360),
  recorded_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Device batch reference for traceability
  batch_id      UUID,
  -- Filter outcome recorded by ingest layer
  filter_status TEXT        NOT NULL DEFAULT 'accepted'
                              CHECK (filter_status IN ('accepted', 'accuracy_gate', 'speed_gate', 'jump_gate', 'noise_gate')),
  CONSTRAINT uq_ride_gps_point_session_recorded UNIQUE (session_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_ride_gps_point_session_id
  ON public.ride_gps_point (session_id);
CREATE INDEX IF NOT EXISTS idx_ride_gps_point_session_time
  ON public.ride_gps_point (session_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_ride_gps_point_batch_id
  ON public.ride_gps_point (batch_id)
  WHERE batch_id IS NOT NULL;

-- GPS points are read by: admin replay, compliance verifier, anti-spoof.
-- Written by: ingest API (service role).
-- Riders can only read their own session's points.
ALTER TABLE public.ride_gps_point ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Riders read own session GPS points" ON public.ride_gps_point;
CREATE POLICY "Riders read own session GPS points"
  ON public.ride_gps_point FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ride_session rs
      WHERE rs.id = session_id
        AND rs.rider_id IN (
          SELECT id FROM public.rider WHERE user_id = auth.uid()
        )
    )
  );

COMMENT ON TABLE public.ride_gps_point IS
  'Immutable GPS point log. Written only by the ingest API using the service role. '
  'All compliance verification reads from this table. Never modified after insert.';

-- ─── zone_visit ──────────────────────────────────────────────────────────────
-- Records each period a rider spends inside a campaign zone during a session.
-- Written by the backend compliance verifier on zone exit events.

CREATE TABLE IF NOT EXISTS public.zone_visit (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL REFERENCES public.ride_session(id) ON DELETE CASCADE,
  campaign_zone_id      UUID        NOT NULL,
  entered_at            TIMESTAMPTZ NOT NULL,
  exited_at             TIMESTAMPTZ,
  dwell_time_s          INTEGER     CHECK (dwell_time_s >= 0),
  avg_speed_in_zone_kmh FLOAT       CHECK (avg_speed_in_zone_kmh >= 0),
  impression_units      INTEGER     NOT NULL DEFAULT 0 CHECK (impression_units >= 0),
  point_count_in_zone   INTEGER     NOT NULL DEFAULT 0,
  -- Was any speed violation detected during this visit?
  speed_violation       BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zone_visit_session_id
  ON public.zone_visit (session_id);
CREATE INDEX IF NOT EXISTS idx_zone_visit_campaign_zone_id
  ON public.zone_visit (campaign_zone_id);

ALTER TABLE public.zone_visit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Riders read own zone visits" ON public.zone_visit;
CREATE POLICY "Riders read own zone visits"
  ON public.zone_visit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ride_session rs
      WHERE rs.id = session_id
        AND rs.rider_id IN (
          SELECT id FROM public.rider WHERE user_id = auth.uid()
        )
    )
  );

COMMENT ON TABLE public.zone_visit IS
  'One row per campaign zone visit per session. Written by the backend compliance '
  'verifier after zone exit confirmation. Primary input for boosted ride rewards.';

-- ─── corridor_compliance ──────────────────────────────────────────────────────
-- Running compliance score for free-ride sessions following a suggested route.
-- Maintained by the backend compliance verifier; updated on each GPS batch.

CREATE TABLE IF NOT EXISTS public.corridor_compliance (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL REFERENCES public.ride_session(id) ON DELETE CASCADE,
  suggested_route_id    UUID        NOT NULL REFERENCES public.suggested_routes(id) ON DELETE RESTRICT,
  compliant_distance_m  FLOAT       NOT NULL DEFAULT 0 CHECK (compliant_distance_m >= 0),
  total_distance_m      FLOAT       NOT NULL DEFAULT 0 CHECK (total_distance_m >= 0),
  compliance_pct        FLOAT       NOT NULL DEFAULT 0 CHECK (compliance_pct BETWEEN 0 AND 100),
  last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_corridor_compliance_session_route UNIQUE (session_id, suggested_route_id)
);

CREATE INDEX IF NOT EXISTS idx_corridor_compliance_session_id
  ON public.corridor_compliance (session_id);

ALTER TABLE public.corridor_compliance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Riders read own corridor compliance" ON public.corridor_compliance;
CREATE POLICY "Riders read own corridor compliance"
  ON public.corridor_compliance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ride_session rs
      WHERE rs.id = session_id
        AND rs.rider_id IN (
          SELECT id FROM public.rider WHERE user_id = auth.uid()
        )
    )
  );

COMMENT ON TABLE public.corridor_compliance IS
  'Running compliance score for free-ride bonus route sessions. '
  'Updated by the backend compliance verifier. Reward engine reads this to '
  'determine final multiplier/bonus at session end.';

-- ─── session_flag ─────────────────────────────────────────────────────────────
-- Anti-spoof and data-quality flags raised during compliance verification.
-- Sessions with critical flags are held in pending_review; rewards withheld.

CREATE TABLE IF NOT EXISTS public.session_flag (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID        NOT NULL REFERENCES public.ride_session(id) ON DELETE CASCADE,
  flag_type     TEXT        NOT NULL
                              CHECK (flag_type IN (
                                'speed_violation',
                                'gps_jump',
                                'poor_accuracy',
                                'zone_boundary_abuse',
                                'duplicate_session',
                                'impossible_battery',
                                'stationary_in_zone',
                                'low_data_quality'
                              )),
  severity      TEXT        NOT NULL DEFAULT 'low'
                              CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved      BOOLEAN     NOT NULL DEFAULT false,
  resolved_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_flag_session_id
  ON public.session_flag (session_id);
CREATE INDEX IF NOT EXISTS idx_session_flag_unresolved
  ON public.session_flag (session_id, resolved)
  WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_session_flag_severity
  ON public.session_flag (severity, resolved)
  WHERE resolved = false;

ALTER TABLE public.session_flag ENABLE ROW LEVEL SECURITY;
-- Flags are admin-only; riders cannot read their own flags (prevents gaming)

COMMENT ON TABLE public.session_flag IS
  'Anti-spoof and data-quality flags. Critical/high severity flags hold reward '
  'disbursement until manually reviewed by admin. Low/medium flags auto-clear '
  'after the configurable review window.';

-- ─── ride_session extensions ──────────────────────────────────────────────────
-- policy_snapshot: reward rate config as of session start (frozen for audit).
-- algorithm_version: compliance algorithm version tag for replay consistency.
-- last_heartbeat_at: updated by mobile every 5 minutes; used to detect lost sessions.

ALTER TABLE public.ride_session
  ADD COLUMN IF NOT EXISTS policy_snapshot      JSONB,
  ADD COLUMN IF NOT EXISTS algorithm_version    TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS last_heartbeat_at    TIMESTAMPTZ;

COMMENT ON COLUMN public.ride_session.policy_snapshot IS
  'Snapshot of reward policy (rates, caps, multipliers) at session start time. '
  'Reward engine always reads THIS snapshot, never current policy, for this session.';

COMMENT ON COLUMN public.ride_session.algorithm_version IS
  'Compliance algorithm version active at session start. Used when replaying '
  'compliance verification to ensure deterministic results.';

-- ─── suggested_routes extensions ─────────────────────────────────────────────
-- mode: distinguishes free-ride bonus routes from campaign-navigational routes.
-- tolerance_m: corridor width for compliance scoring (perpendicular distance).

ALTER TABLE public.suggested_routes
  ADD COLUMN IF NOT EXISTS mode         TEXT NOT NULL DEFAULT 'standard_ride'
                                          CHECK (mode IN ('standard_ride', 'campaign')),
  ADD COLUMN IF NOT EXISTS tolerance_m  INTEGER NOT NULL DEFAULT 30
                                          CHECK (tolerance_m > 0 AND tolerance_m <= 500);

COMMENT ON COLUMN public.suggested_routes.mode IS
  'standard_ride = bonus route with compliance scoring. '
  'campaign = navigational route shown alongside campaign zones; no compliance scoring.';
COMMENT ON COLUMN public.suggested_routes.tolerance_m IS
  'Corridor half-width in metres for standard_ride compliance corridor checks. '
  'Points within this distance of the route polyline count as compliant.';

-- ─── Admin live map support: realtime-safe function ──────────────────────────
-- Returns active session summaries for the admin realtime feed.
-- SECURITY DEFINER so it bypasses RLS while still being callable by authed users.

CREATE OR REPLACE FUNCTION public.get_active_rider_sessions_for_admin()
RETURNS TABLE (
  session_id        UUID,
  rider_id          UUID,
  user_id           UUID,
  earning_mode      TEXT,
  campaign_id       UUID,
  suggested_route_id UUID,
  started_at        TIMESTAMPTZ,
  status            TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rs.id            AS session_id,
    rs.rider_id,
    r.user_id,
    rs.earning_mode,
    rs.campaign_id,
    rs.suggested_route_id,
    rs.started_at,
    rs.status
  FROM public.ride_session rs
  JOIN public.rider r ON r.id = rs.rider_id
  WHERE rs.status IN ('active', 'paused')
    AND rs.started_at > now() - INTERVAL '12 hours';
$$;

COMMENT ON FUNCTION public.get_active_rider_sessions_for_admin IS
  'Returns all active/paused ride sessions for the admin live map feed. '
  'SECURITY DEFINER — bypasses rider RLS so admin can see all sessions.';
