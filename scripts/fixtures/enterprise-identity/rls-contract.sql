-- Minimal relations required by captured production identity RLS policies.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT public.is_dashboard_admin() $$;
ALTER TABLE public.rider ADD COLUMN is_certified boolean DEFAULT false;
CREATE TYPE public.campaign_lifecycle_status AS ENUM('draft','open_for_signup','selection_in_progress','confirmed','active','completed');
CREATE TABLE public.campaign(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),advertiser_id uuid,lifecycle_status public.campaign_lifecycle_status DEFAULT 'draft');
CREATE TABLE public.campaign_signup(campaign_id uuid,rider_id uuid);
CREATE TABLE public.campaign_assignment(campaign_id uuid,rider_id uuid);
CREATE TABLE public.rider_route(route_id uuid,rider_id uuid);
CREATE TABLE public.route(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,campaign_id uuid,supported_earning_modes text[] DEFAULT ARRAY['standard_ride'],optimization_metadata jsonb DEFAULT '{}',multi_rider_capacity int DEFAULT 1,campaign_priority_rank int);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,UPDATE ON public."user" TO authenticated;
GRANT SELECT ON public.organisation_membership TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.rider,public.advertiser,public.campaign,public.route,public.organisation TO authenticated;
GRANT SELECT ON public.campaign_signup,public.campaign_assignment,public.rider_route TO authenticated;
