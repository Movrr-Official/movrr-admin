-- Approved additive X13 correction. Apply after unchanged 059/060.
-- Read projections only: never rewrite rides, ledger, balances or awards.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.impact_methodology (
 id text PRIMARY KEY, factor_kg_co2e_per_vehicle_km numeric NOT NULL CHECK(factor_kg_co2e_per_vehicle_km=0.190),
 factor_edition integer NOT NULL, emissions_reference_year integer NOT NULL,
 scope text NOT NULL CHECK(scope='WTW'), comparison_label text NOT NULL,
 source_url text NOT NULL, approval_date date NOT NULL, approval_reference text NOT NULL,
 eligibility text NOT NULL, previous_runtime_factor numeric NOT NULL,
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp(), installed_by name NOT NULL DEFAULT session_user
);
ALTER TABLE public.impact_methodology ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.impact_methodology FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.impact_methodology(id,factor_kg_co2e_per_vehicle_km,factor_edition,emissions_reference_year,scope,comparison_label,source_url,approval_date,approval_reference,eligibility,previous_runtime_factor)
VALUES('MOVRR-NL-CAR-COMPARISON-2026-v1',0.190,2026,2025,'WTW','Average car emissions for the same distance',
 'https://co2emissiefactoren.nl/factoren/2026/38/147/personenvervoer-auto-gemiddelde-auto-brandstofsoort-onbekend/',
 DATE '2026-10-20','MOVRR owner: Controlled Production Rollout and Feature Activation, section 3',
 'Completed, backend-verified session with a committed settlement receipt, positive finite recorded distance and completion timestamp. One session once, independent of points or bonus rows. Unsupported historical evidence excluded.',0.180);
CREATE FUNCTION public.reject_impact_methodology_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 RAISE EXCEPTION 'Methodology versions are immutable; use an approved additive migration' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.reject_impact_methodology_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER impact_methodology_immutable BEFORE UPDATE OR DELETE ON public.impact_methodology FOR EACH ROW EXECUTE FUNCTION public.reject_impact_methodology_change();
CREATE FUNCTION public.get_impact_methodology() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('methodologyId',id,'factorKgCo2ePerVehicleKm',factor_kg_co2e_per_vehicle_km,'factorEdition',factor_edition,
  'emissionsReferenceYear',emissions_reference_year,'scope',scope,'comparisonLabel',comparison_label,'sourceUrl',source_url,
  'eligibility',eligibility,'approvalDate',approval_date,'installedAt',installed_at,'actualAvoidedEmissions',false)
 FROM public.impact_methodology WHERE id='MOVRR-NL-CAR-COMPARISON-2026-v1';
$$;
REVOKE ALL ON FUNCTION public.get_impact_methodology() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_impact_methodology() TO authenticated,service_role;
-- Preserve the SQL output names required by the unchanged Mobile consumer and
-- installed summary/daily readers. These fields now contain a car comparison,
-- never measured savings. Admin/web label that distinction explicitly.
CREATE OR REPLACE FUNCTION public.get_impact_ride_evidence(p_rider uuid)
RETURNS TABLE(session_id uuid,completed_at timestamptz,distance_km numeric,co2_saved_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.completed_at,s.total_distance_meters/1000.0,
  (s.total_distance_meters/1000.0)*m.factor_kg_co2e_per_vehicle_km
 FROM public.ride_session s CROSS JOIN public.impact_methodology m
 WHERE m.id='MOVRR-NL-CAR-COMPARISON-2026-v1' AND (p_rider IS NULL OR s.rider_id=p_rider)
  AND s.status='completed' AND s.verification_result->>'status'='verified'
  AND s.completed_at IS NOT NULL AND s.completed_at<=statement_timestamp() AND s.total_distance_meters>0
  AND s.total_distance_meters::text NOT IN ('NaN','Infinity','-Infinity')
  AND EXISTS(SELECT 1 FROM public.ride_reward_execution_receipt receipt WHERE receipt.session_id=s.id);
$$;
REVOKE ALL ON FUNCTION public.get_impact_ride_evidence(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- 059's lifetime/summary/daily aggregators all delegate to the corrected evidence
-- above and round only after aggregation; their consumer signatures stay intact.
COMMIT;
