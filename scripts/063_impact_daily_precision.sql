-- Preserve full precision for consumers aggregating daily buckets into a period.
-- Display rounding belongs at the final displayed aggregate, not each input day.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.get_impact_daily(p_days integer DEFAULT 30)
RETURNS TABLE(date text,"distanceKm" numeric,"co2SavedKg" numeric,sessions bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'Invalid reporting window' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT to_char(e.completed_at AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD'),sum(e.distance_km),sum(e.co2_saved_kg),count(*)
 FROM public.get_impact_ride_evidence(null) e
 WHERE (e.completed_at AT TIME ZONE 'Europe/Amsterdam')::date >= (now() AT TIME ZONE 'Europe/Amsterdam')::date-(p_days-1)
 GROUP BY 1 ORDER BY 1;
END $$;
COMMIT;
