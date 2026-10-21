-- Retire permissive identity/tenant policies; preserve explicit Rider self service.
BEGIN;
CREATE FUNCTION public.identity_has_capability(p_capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_identity_active(auth.uid()) AND
  coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal',current_setting('request.jwt.claim.aal',true),'')='aal2'
  AND EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=auth.uid() AND public.ops_employee_capabilities(a.role) ? p_capability)
$$;
REVOKE ALL ON FUNCTION public.identity_has_capability(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.identity_has_capability(text) TO authenticated,service_role;

CREATE FUNCTION public.identity_organisation_capability(p_organisation uuid,p_capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_identity_active(auth.uid()) AND EXISTS(
  SELECT 1 FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id
  WHERE m.user_id=auth.uid() AND m.organisation_id=p_organisation AND m.status='active' AND o.status='active'
   AND public.ops_organisation_capabilities(o.type,m.role) ? p_capability)
$$;
REVOKE ALL ON FUNCTION public.identity_organisation_capability(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.identity_organisation_capability(uuid,text) TO authenticated,service_role;
CREATE FUNCTION public.identity_campaign_capability(p_campaign uuid,p_capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.campaign c JOIN public.advertiser a ON a.id=c.advertiser_id
  WHERE c.id=p_campaign AND public.identity_organisation_capability(a.organisation_id,p_capability))
$$;
REVOKE ALL ON FUNCTION public.identity_campaign_capability(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.identity_campaign_capability(uuid,text) TO authenticated,service_role;

-- Existing policies remain for unrelated features. Replace every broad dashboard
-- predicate in those policies with its concrete capability, never a role label.
DO $$
DECLARE item record; capability text; predicate text; check_predicate text;
BEGIN
 FOR item IN SELECT * FROM pg_policies WHERE schemaname='public'
  AND (coalesce(qual,'')||coalesce(with_check,'')) ~ '\mis_admin\(\)|\mis_dashboard_admin\(\)'
 LOOP
  capability:=CASE item.tablename
   WHEN 'user' THEN CASE WHEN item.cmd='SELECT' THEN 'users.read' ELSE 'users.manage' END
   WHEN 'rider' THEN CASE WHEN item.cmd='SELECT' THEN 'riders.read' ELSE 'riders.manage' END
   WHEN 'advertiser' THEN 'advertisers.manage'
   WHEN 'campaign' THEN CASE WHEN item.cmd='SELECT' THEN 'campaigns.read' ELSE 'campaigns.write' END
   WHEN 'route' THEN CASE WHEN item.cmd='SELECT' THEN 'routes.read' ELSE 'routes.write' END
   WHEN 'rider_route' THEN CASE WHEN item.cmd='SELECT' THEN 'rides.read' ELSE 'routes.write' END
   WHEN 'campaign_assignment' THEN CASE WHEN item.cmd='SELECT' THEN 'campaigns.read' ELSE 'campaigns.write' END
   WHEN 'campaign_assignment_events' THEN CASE WHEN item.cmd='SELECT' THEN 'campaigns.read' ELSE 'campaigns.write' END
   WHEN 'export_history' THEN 'exports.execute'
   WHEN 'impression_events' THEN 'analytics.read'
   WHEN 'performance_stats' THEN 'analytics.read'
   WHEN 'platform_settings' THEN 'settings.manage'
   WHEN 'pro_tips' THEN CASE WHEN item.cmd='SELECT' THEN 'dashboard.read' ELSE 'protips.manage' END
   WHEN 'user_preferences' THEN CASE WHEN item.cmd='SELECT' THEN 'users.read' ELSE 'users.manage' END
   WHEN 'waitlist' THEN 'waitlist.manage'
   WHEN 'organisation' THEN CASE WHEN item.cmd='SELECT' THEN 'users.read' ELSE 'resources.manage' END
   ELSE CASE WHEN item.cmd='SELECT' THEN 'riders.read' ELSE 'riders.manage' END
  END;
  predicate:=regexp_replace(item.qual,'\m(is_admin|is_dashboard_admin)\(\)',format('public.identity_has_capability(%L)',capability),'g');
  check_predicate:=regexp_replace(item.with_check,'\m(is_admin|is_dashboard_admin)\(\)',format('public.identity_has_capability(%L)',capability),'g');
  EXECUTE format('ALTER POLICY %I ON public.%I%s%s',item.policyname,item.tablename,
   CASE WHEN predicate IS NULL THEN '' ELSE ' USING ('||predicate||')' END,
   CASE WHEN check_predicate IS NULL THEN '' ELSE ' WITH CHECK ('||check_predicate||')' END);
 END LOOP;
 FOR item IN SELECT * FROM pg_policies WHERE schemaname='public'
  AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%user_owns_campaign(%'
 LOOP
  predicate:=replace(item.qual,'user_owns_campaign(campaign_id)', 'public.identity_campaign_capability(campaign_id,''campaigns.read'')');
  check_predicate:=replace(item.with_check,'user_owns_campaign(campaign_id)', 'public.identity_campaign_capability(campaign_id,''campaigns.read'')');
  EXECUTE format('ALTER POLICY %I ON public.%I%s%s',item.policyname,item.tablename,
   CASE WHEN predicate IS NULL THEN '' ELSE ' USING ('||predicate||')' END,
   CASE WHEN check_predicate IS NULL THEN '' ELSE ' WITH CHECK ('||check_predicate||')' END);
 END LOOP;
 -- Every authenticated table access checks current identity state. Service-owned
 -- recovery and deletion RPCs retain their explicit authorization and gates.
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
 LOOP
  EXECUTE format('DROP POLICY IF EXISTS identity_status_required ON public.%I',item.relname);
  EXECUTE format('CREATE POLICY identity_status_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.account_is_active()) WITH CHECK (public.account_is_active())',item.relname);
 END LOOP;
END $$;
DROP FUNCTION public.user_owns_campaign(uuid);

CREATE OR REPLACE FUNCTION public.rider_can_access_advertiser(p_advertiser_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.rider r
    WHERE r.user_id = auth.uid() AND r.status='active' AND public.account_identity_active(auth.uid())
      AND (
        -- Public/visible campaigns
        EXISTS (
          SELECT 1
          FROM public.campaign c
          WHERE c.advertiser_id = p_advertiser_id
            AND c.lifecycle_status IN ('open_for_signup', 'selection_in_progress', 'confirmed', 'active', 'completed')
        )
        -- Campaign signup
        OR EXISTS (
          SELECT 1 FROM public.campaign c
          JOIN public.campaign_signup cs ON cs.campaign_id = c.id
          WHERE c.advertiser_id = p_advertiser_id
            AND cs.rider_id = r.id
        )
        -- Campaign assignment
        OR EXISTS (
          SELECT 1 FROM public.campaign c
          JOIN public.campaign_assignment ca ON ca.campaign_id = c.id
          WHERE c.advertiser_id = p_advertiser_id
            AND ca.rider_id = r.id
        )
      )
  );
$function$
;

DROP POLICY IF EXISTS "Authenticated users can read advertiser names" ON public.advertiser;
DROP POLICY IF EXISTS advertiser_insert_own ON public.advertiser;
DROP POLICY IF EXISTS advertiser_update_own ON public.advertiser;
DROP POLICY IF EXISTS advertiser_select_own ON public.advertiser;
CREATE POLICY advertiser_select_scoped ON public.advertiser FOR SELECT TO authenticated USING(
 public.identity_has_capability('advertisers.manage') OR public.identity_organisation_capability(organisation_id,'campaigns.read') OR public.rider_can_access_advertiser(id));
CREATE POLICY advertiser_update_scoped ON public.advertiser FOR UPDATE TO authenticated USING(
 public.identity_has_capability('advertisers.manage') OR public.identity_organisation_capability(organisation_id,'org.settings')) WITH CHECK(
 public.identity_has_capability('advertisers.manage') OR public.identity_organisation_capability(organisation_id,'org.settings'));
-- Provisioning owns advertiser creation and immutable tenant/owner links.
CREATE FUNCTION public.protect_advertiser_identity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'') IN ('anon','authenticated') AND (NEW.id<>OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id) THEN
  RAISE EXCEPTION 'Advertiser identity and organisation links require a canonical provisioning command' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_advertiser_identity BEFORE UPDATE ON public.advertiser FOR EACH ROW EXECUTE FUNCTION public.protect_advertiser_identity();
REVOKE INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.advertiser FROM anon,authenticated;

DROP POLICY IF EXISTS "Authenticated users can view campaigns" ON public.campaign;
DROP POLICY IF EXISTS campaign_select_authenticated_open ON public.campaign;
CREATE POLICY campaign_select_rider_discovery ON public.campaign FOR SELECT TO authenticated USING(
 lifecycle_status::text IN ('open_for_signup','selection_in_progress','confirmed') AND
 EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=auth.uid() AND r.status='active'));
DROP POLICY IF EXISTS campaign_insert_own ON public.campaign;
DROP POLICY IF EXISTS campaign_update_own ON public.campaign;
CREATE POLICY campaign_select_organisation ON public.campaign FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.advertiser ad WHERE ad.id=advertiser_id AND public.identity_organisation_capability(ad.organisation_id,'campaigns.read')));
CREATE POLICY campaign_update_organisation ON public.campaign FOR UPDATE TO authenticated USING(EXISTS(
 SELECT 1 FROM public.advertiser ad WHERE ad.id=advertiser_id AND public.identity_organisation_capability(ad.organisation_id,'campaigns.write'))) WITH CHECK(EXISTS(
 SELECT 1 FROM public.advertiser ad WHERE ad.id=advertiser_id AND public.identity_organisation_capability(ad.organisation_id,'campaigns.write')));
-- Creation and lifecycle transitions go through server contracts (approval, SoD,
-- budget validation and auditing). Direct client campaign writes are retired.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.campaign FROM anon,authenticated;

CREATE FUNCTION public.protect_rider_identity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'') IN ('anon','authenticated') THEN
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.status IS DISTINCT FROM OLD.status OR
   (to_jsonb(NEW)->'is_certified') IS DISTINCT FROM (to_jsonb(OLD)->'is_certified')) THEN
   RAISE EXCEPTION 'Rider identity, status and certification require an authorized management command' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND (NEW.status::text<>'active' OR coalesce((to_jsonb(NEW)->>'is_certified')::boolean,false)) THEN
   RAISE EXCEPTION 'Invalid self-service Rider onboarding' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_rider_identity BEFORE INSERT OR UPDATE ON public.rider FOR EACH ROW EXECUTE FUNCTION public.protect_rider_identity();

-- Mobile intentionally creates personal, unassigned routes. Track that explicit
-- author without changing its runtime contract; never infer campaign ownership.
ALTER TABLE public.route ADD COLUMN identity_created_by uuid REFERENCES public."user"(id) DEFAULT auth.uid();
DROP POLICY IF EXISTS "Authenticated users can insert routes" ON public.route;
DROP POLICY IF EXISTS "Authenticated users can update routes" ON public.route;
DROP POLICY IF EXISTS "Authenticated users can view routes" ON public.route;
CREATE POLICY route_scope_required ON public.route AS RESTRICTIVE FOR SELECT TO authenticated USING(
 public.identity_has_capability('routes.read') OR public.identity_campaign_capability(campaign_id,'campaigns.read') OR
 EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=auth.uid() AND r.status='active'));
CREATE POLICY route_insert_rider ON public.route FOR INSERT TO authenticated WITH CHECK(
 identity_created_by=auth.uid() AND campaign_id IS NULL AND EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=auth.uid() AND r.status='active'));
CREATE POLICY route_update_rider ON public.route FOR UPDATE TO authenticated USING(
 identity_created_by=auth.uid() AND campaign_id IS NULL AND EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=auth.uid() AND r.status='active')) WITH CHECK(
 identity_created_by=auth.uid() AND campaign_id IS NULL);
CREATE FUNCTION public.protect_route_identity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'') IN ('anon','authenticated') AND TG_OP='UPDATE' AND NEW.identity_created_by IS DISTINCT FROM OLD.identity_created_by THEN
  RAISE EXCEPTION 'Route author is immutable' USING ERRCODE='42501'; END IF;
 IF coalesce(auth.role(),'') IN ('anon','authenticated') AND NOT public.identity_has_capability('routes.write') THEN
  IF NEW.campaign_id IS NOT NULL OR to_jsonb(NEW)->'supported_earning_modes' IS DISTINCT FROM '["standard_ride"]'::jsonb
   OR coalesce(to_jsonb(NEW)->'optimization_metadata','{}'::jsonb)<>'{}'::jsonb
   OR coalesce(to_jsonb(NEW)->>'multi_rider_capacity','1')<>'1' OR to_jsonb(NEW)->>'campaign_priority_rank' IS NOT NULL THEN
   RAISE EXCEPTION 'Personal route cannot configure campaign or earning authority' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_route_identity BEFORE INSERT OR UPDATE ON public.route FOR EACH ROW EXECUTE FUNCTION public.protect_route_identity();
COMMIT;
