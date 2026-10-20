-- X13: preserve the active production estimate; methodology approval is separate.
BEGIN;
CREATE FUNCTION public.get_impact_ride_evidence(p_rider uuid)
RETURNS TABLE(session_id uuid,completed_at timestamptz,distance_km numeric,co2_saved_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH distances AS (
  SELECT rt.metadata->>'rideSessionId' session_id_text,
   CASE WHEN rt.metadata->>'totalDistanceKm' IS NOT NULL THEN (rt.metadata->>'totalDistanceKm')::numeric
    WHEN rt.metadata->>'totalDistanceMeters' IS NOT NULL THEN (rt.metadata->>'totalDistanceMeters')::numeric/1000.0 ELSE 0 END distance
  FROM public.reward_transactions rt JOIN public.rider r ON r.id=rt.rider_id
  WHERE (p_rider IS NULL OR r.id=p_rider) AND rt.points_earned>0
   AND rt.source IN ('standard_ride','campaign_ride','free_ride_bonus')
 ), deduped AS (SELECT session_id_text,max(distance) distance FROM distances GROUP BY session_id_text)
 SELECT rs.id,rs.completed_at,d.distance,d.distance*0.180
 FROM deduped d JOIN public.ride_session rs ON rs.id=d.session_id_text::uuid WHERE rs.status='completed';
$$;
CREATE OR REPLACE FUNCTION public.get_impact_summary(p_rider uuid)
RETURNS TABLE(total_rides bigint,total_distance_km numeric,co2_saved_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT count(*),coalesce(sum(distance_km),0),coalesce(round(sum(co2_saved_kg),2),0) FROM public.get_impact_ride_evidence(p_rider);
$$;
CREATE FUNCTION public.get_impact_daily(p_days integer DEFAULT 30)
RETURNS TABLE(date text,"distanceKm" numeric,"co2SavedKg" numeric,sessions bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'Invalid reporting window' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT to_char(e.completed_at AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD'),sum(e.distance_km),round(sum(e.co2_saved_kg),2),count(*)
 FROM public.get_impact_ride_evidence(null) e
 WHERE (e.completed_at AT TIME ZONE 'Europe/Amsterdam')::date >= (now() AT TIME ZONE 'Europe/Amsterdam')::date-(p_days-1)
 GROUP BY 1 ORDER BY 1;
END $$;
REVOKE ALL ON FUNCTION public.get_impact_ride_evidence(uuid),public.get_impact_summary(uuid),public.get_impact_daily(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_impact_summary(uuid),public.get_impact_daily(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.get_lifetime_impact_summary() RETURNS TABLE(total_rides bigint,total_distance_km numeric,co2_saved_kg numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid; BEGIN
 PERFORM public.assert_active_account();
 SELECT id INTO rid FROM public.rider WHERE user_id=auth.uid();
 IF rid IS NULL THEN RETURN QUERY SELECT 0::bigint,0::numeric,0::numeric;RETURN;END IF;
 RETURN QUERY SELECT * FROM public.get_impact_summary(rid);
END $$;
COMMIT;
