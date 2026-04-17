-- Migration 032: Add distance_km to community_ride
--
-- Adds a first-class distance field that organisers declare at creation time.
-- This is independent of route_id — a linked route is not required to record
-- a planned distance.  The mobile app displays this on the Ride Together card
-- and the ride detail screen; the admin form exposes it on create and edit.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

ALTER TABLE public.community_ride
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(8, 2)
    CHECK (distance_km IS NULL OR distance_km > 0);

COMMENT ON COLUMN public.community_ride.distance_km IS
  'Planned ride distance in kilometres declared by the organiser. '
  'Null when the organiser did not specify a distance. '
  'Independent of route_id — a route attachment is not required.';

-- Partial index supports distance-aware filtering/ordering without scanning NULLs.
CREATE INDEX IF NOT EXISTS idx_community_ride_distance_km
  ON public.community_ride (distance_km)
  WHERE distance_km IS NOT NULL;
