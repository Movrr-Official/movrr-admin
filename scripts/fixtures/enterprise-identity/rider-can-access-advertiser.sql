CREATE OR REPLACE FUNCTION public.rider_can_access_advertiser(p_advertiser_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.rider r
    WHERE r.user_id = auth.uid()
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
CREATE OR REPLACE FUNCTION public.user_owns_campaign(p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaign c
    JOIN public.advertiser a ON a.id = c.advertiser_id
    WHERE c.id = p_campaign_id
      AND a.user_id = auth.uid()
  );
$function$
;
