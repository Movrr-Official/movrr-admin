-- Forward correction after live coverage verification. Do not rewrite 059/061.
-- Approved observation criteria are completed + verified authoritative distance;
-- points-settlement receipts are not a cycling-distance eligibility requirement.
BEGIN;
SET LOCAL lock_timeout='5s';
INSERT INTO public.impact_methodology(id,factor_kg_co2e_per_vehicle_km,factor_edition,emissions_reference_year,scope,comparison_label,source_url,approval_date,approval_reference,eligibility,previous_runtime_factor)
SELECT 'MOVRR-NL-CAR-COMPARISON-2026-v2',factor_kg_co2e_per_vehicle_km,factor_edition,emissions_reference_year,scope,comparison_label,source_url,approval_date,
 approval_reference||'; live correction: retain historical completed/verified records without imposing a points-settlement receipt requirement',
 'Completed session with backend verification_result.status=verified, positive finite authoritative total_distance_meters and a nonfuture completion timestamp. One session once, independent of reward, ledger or settlement receipts. Historical verified sessions remain eligible; unverified or invalid evidence is excluded.',0.190
FROM public.impact_methodology WHERE id='MOVRR-NL-CAR-COMPARISON-2026-v1';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.impact_methodology WHERE id='MOVRR-NL-CAR-COMPARISON-2026-v2') THEN RAISE EXCEPTION 'Prior impact methodology required'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.get_impact_methodology() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('methodologyId',id,'factorKgCo2ePerVehicleKm',factor_kg_co2e_per_vehicle_km,'factorEdition',factor_edition,
  'emissionsReferenceYear',emissions_reference_year,'scope',scope,'comparisonLabel',comparison_label,'sourceUrl',source_url,
  'eligibility',eligibility,'approvalDate',approval_date,'installedAt',installed_at,'actualAvoidedEmissions',false)
 FROM public.impact_methodology WHERE id='MOVRR-NL-CAR-COMPARISON-2026-v2';
$$;
CREATE OR REPLACE FUNCTION public.get_impact_ride_evidence(p_rider uuid)
RETURNS TABLE(session_id uuid,completed_at timestamptz,distance_km numeric,co2_saved_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.completed_at,s.total_distance_meters/1000.0,
  (s.total_distance_meters/1000.0)*m.factor_kg_co2e_per_vehicle_km
 FROM public.ride_session s CROSS JOIN public.impact_methodology m
 WHERE m.id='MOVRR-NL-CAR-COMPARISON-2026-v2' AND (p_rider IS NULL OR s.rider_id=p_rider)
  AND s.status='completed' AND s.verification_result->>'status'='verified'
  AND s.completed_at IS NOT NULL AND s.completed_at<=statement_timestamp() AND s.total_distance_meters>0
  AND s.total_distance_meters::text NOT IN ('NaN','Infinity','-Infinity');
$$;
COMMIT;
