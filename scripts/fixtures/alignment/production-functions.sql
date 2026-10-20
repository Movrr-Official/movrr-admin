-- Read-only production contract capture. No customer records.
CREATE OR REPLACE FUNCTION public.account_deletion_contract_status()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('contractVersion',1,'policyVersion',active_policy_version,'requestsEnabled',requests_enabled AND
 public.account_deletion_rule_allowed(active_policy_version,'personal.erase') AND public.account_deletion_rule_allowed(active_policy_version,'external.erase') AND public.account_deletion_rule_allowed(active_policy_version,'receipt.complete') AND public.account_deletion_rule_allowed(active_policy_version,'restore.suppress'))
 FROM public.account_deletion_contract_gate WHERE singleton;
$function$;

CREATE OR REPLACE FUNCTION public.can_create_community_ride(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.community_ride_creator_grant cg
    WHERE cg.user_id = p_user_id
      AND cg.revoked_at IS NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.claim_my_ride_settlement(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE st public.ride_reward_settlement;
BEGIN
 SELECT j.* INTO st FROM public.ride_reward_settlement j JOIN public.rider r ON r.id=j.rider_id
 JOIN public.ride_session s ON s.id=j.ride_session_id
 WHERE j.ride_session_id=p_session_id AND r.user_id=auth.uid() AND s.status IN ('completed','rejected') FOR UPDATE OF j;
 IF st.ride_session_id IS NULL OR st.status='settled' OR st.next_attempt_at>clock_timestamp() OR st.lease_until>clock_timestamp() THEN RETURN NULL;END IF;
 PERFORM public.account_deletion_assert_writable(auth.uid());
 IF st.status='awaiting_verification' OR st.award_status='manual_review' THEN
  IF NOT public.ride_settlement_can_reassess(p_session_id) THEN RETURN NULL;END IF;
 END IF;
 IF st.attempts>=8 THEN
  UPDATE public.ride_reward_settlement SET status='awaiting_verification',award_status='manual_review',last_error='settlement_retry_exhausted',
   lease_token=NULL,lease_until=NULL,next_attempt_at='infinity',updated_at=clock_timestamp() WHERE ride_session_id=p_session_id;
  RETURN NULL;
 END IF;
 UPDATE public.ride_reward_settlement SET status='calculating',attempts=attempts+1,lease_token=gen_random_uuid(),
  lease_until=clock_timestamp()+interval '5 minutes',last_error=NULL,award_status=NULL,updated_at=clock_timestamp()
 WHERE ride_session_id=p_session_id RETURNING * INTO st;
 RETURN to_jsonb(st);
END $function$;

CREATE OR REPLACE FUNCTION public.confirm_campaign_accessory_installed(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_assignment public.rider_campaign_accessory_assignment%ROWTYPE;
BEGIN
  SELECT a.* INTO v_assignment
  FROM public.rider_campaign_accessory_assignment a
  JOIN public.rider r ON r.id = a.rider_id
  WHERE a.id = p_assignment_id
    AND r.user_id = auth.uid()
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Accessory assignment not found' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.rider_campaign_accessory_assignment
  SET status = 'installed',
      installed_at = COALESCE(installed_at, NOW()),
      updated_at = NOW()
  WHERE id = p_assignment_id;

  UPDATE public.campaign_accessory_inventory_item
  SET status = 'installed',
      current_campaign_id = v_assignment.campaign_id,
      current_rider_id = v_assignment.rider_id,
      updated_at = NOW()
  WHERE id = v_assignment.inventory_item_id;

  INSERT INTO public.rider_campaign_accessory_event (
    assignment_id,
    event_type,
    actor_user_id
  )
  VALUES (p_assignment_id, 'installed', auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_rider_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT r.id
  FROM public.rider r
  WHERE r.user_id = auth.uid()
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_my_ride_settlement(p_session_id uuid, p_context jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rider uuid;
BEGIN
  SELECT s.rider_id INTO v_rider FROM ride_session s JOIN rider r ON r.id=s.rider_id
  WHERE s.id=p_session_id AND r.user_id=auth.uid();
  IF v_rider IS NULL THEN RAISE EXCEPTION 'ride not owned' USING ERRCODE='42501'; END IF;
  IF p_context->'params'->>'sessionId' IS DISTINCT FROM p_session_id::text THEN
    RAISE EXCEPTION 'settlement identity mismatch';
  END IF;
  INSERT INTO ride_reward_settlement(ride_session_id,rider_id,context)
  VALUES(p_session_id,v_rider,p_context) ON CONFLICT(ride_session_id) DO NOTHING;
END $function$;

CREATE OR REPLACE FUNCTION public.execute_my_ride_time_settlement(p_session uuid, p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT public.execute_ride_time_settlement(p_session,p_token);$function$;

CREATE OR REPLACE FUNCTION public.finish_my_ride_settlement(p_session_id uuid, p_token uuid, p_award_status text, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE st public.ride_reward_settlement;technical boolean;
BEGIN
 SELECT x.* INTO st FROM public.ride_reward_settlement x JOIN public.rider r ON r.id=x.rider_id
 WHERE x.ride_session_id=p_session_id AND r.user_id=auth.uid() FOR UPDATE OF x;
 IF st.ride_session_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ride not owned';END IF;
 IF st.status='settled' THEN RETURN (to_jsonb(st)-'context'-'lease_token') || jsonb_build_object('summary',public.get_my_ride_summary(p_session_id));END IF;
 IF st.status<>'calculating' OR st.lease_token IS DISTINCT FROM p_token OR st.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'settlement lease lost';END IF;
 IF p_error IS NULL AND p_award_status NOT IN ('manual_review','verification_pending','speed_flagged') THEN RAISE EXCEPTION 'backend component completion proof required';END IF;
 -- A client error or status cannot downgrade the executor's financial review.
 technical:=st.award_status IS DISTINCT FROM 'manual_review' AND p_error IS NOT NULL;
 UPDATE public.ride_reward_settlement SET
  status=CASE WHEN technical AND st.attempts<8 THEN 'failed' ELSE 'awaiting_verification' END,
  award_status=CASE WHEN technical AND st.attempts<8 THEN 'error' ELSE 'manual_review' END,
  last_error=CASE WHEN st.award_status='manual_review' THEN st.last_error WHEN technical AND st.attempts>=8 THEN 'settlement_retry_exhausted'
   WHEN technical THEN 'settlement_execution_failed' ELSE 'ride_verification_required' END,
  lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp(),
  next_attempt_at=CASE WHEN technical AND st.attempts>=8 THEN 'infinity'::timestamptz ELSE clock_timestamp()+make_interval(secs=>CASE WHEN technical THEN least(300,5*power(2,least(st.attempts,6))::integer) ELSE 300 END) END
 WHERE ride_session_id=p_session_id RETURNING * INTO st;
 RETURN (to_jsonb(st)-'context'-'lease_token') || jsonb_build_object('summary',public.get_my_ride_summary(p_session_id));
END $function$;

CREATE OR REPLACE FUNCTION public.get_authenticated_rider_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rider_id UUID;
BEGIN
  SELECT r.id
  INTO v_rider_id
  FROM public.rider r
  WHERE r.user_id = auth.uid()
  LIMIT 1;

  RETURN v_rider_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_lifetime_impact_summary()
 RETURNS TABLE(total_rides bigint, total_distance_km numeric, co2_saved_kg numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH rider_row AS (
    SELECT id
    FROM public.rider
    WHERE user_id = auth.uid()
    LIMIT 1
  ),
  ride_transactions AS (
    SELECT
      rt.metadata,
      (rt.metadata->>'rideSessionId') AS session_id_text
    FROM public.reward_transactions rt
    WHERE
      rt.rider_id       = (SELECT id FROM rider_row)
      AND rt.points_earned > 0
      AND rt.source IN ('standard_ride', 'campaign_ride', 'free_ride_bonus')
  ),
  -- Resolve distance per transaction, preferring the km field.
  ride_distances AS (
    SELECT
      session_id_text,
      CASE
        WHEN (metadata->>'totalDistanceKm') IS NOT NULL
          THEN (metadata->>'totalDistanceKm')::NUMERIC
        WHEN (metadata->>'totalDistanceMeters') IS NOT NULL
          THEN (metadata->>'totalDistanceMeters')::NUMERIC / 1000.0
        ELSE 0
      END AS distance_km
    FROM ride_transactions
  ),
  -- Deduplicate by session so a ride with multiple reward rows (e.g. base +
  -- free_ride_bonus) only contributes its distance once.
  deduped AS (
    SELECT
      session_id_text,
      MAX(distance_km) AS distance_km
    FROM ride_distances
    GROUP BY session_id_text
  )
  SELECT
    COUNT(DISTINCT rs.id)                           AS total_rides,
    COALESCE(SUM(d.distance_km), 0)                 AS total_distance_km,
    COALESCE(ROUND(SUM(d.distance_km) * 0.180, 2), 0) AS co2_saved_kg
  FROM deduped d
  JOIN public.ride_session rs
    ON rs.id = d.session_id_text::UUID
  WHERE rs.status = 'completed';
$function$;

CREATE OR REPLACE FUNCTION public.get_my_ride_history_summaries()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(public.get_my_ride_summary(s.id,false) ORDER BY s.completed_at DESC),'[]'::jsonb)
  FROM (SELECT rs.id,rs.completed_at FROM ride_session rs JOIN rider r ON r.id=rs.rider_id
    WHERE r.user_id=auth.uid() AND rs.status IN ('completed','rejected')
    ORDER BY rs.completed_at DESC LIMIT 200) s;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_ride_summary(p_session_id uuid, p_include_trace boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH owned AS (
    SELECT s.*,j.status AS settlement_state,
      public.get_ride_reward_read_state(s.id) AS settlement_json
    FROM ride_session s JOIN rider r ON r.id=s.rider_id
    LEFT JOIN ride_reward_settlement j ON j.ride_session_id=s.id
    WHERE s.id=p_session_id AND r.user_id=auth.uid()
  ), ledger AS (
    SELECT a.* FROM owned s CROSS JOIN LATERAL get_ride_award_components(s.rider_id,s.id) a
  )
  SELECT jsonb_build_object('contractVersion',1,'rideSessionId',s.id,
    'session',to_jsonb(s)-'settlement_state'-'settlement_json',
    'trace',CASE WHEN p_include_trace THEN (SELECT jsonb_build_object('path',t.path) FROM route_tracking t
      WHERE t.ride_session_id=s.id AND t.rider_id=s.rider_id ORDER BY t.end_time DESC LIMIT 1) ELSE NULL END,
    'settlement',s.settlement_json,
    'totalPoints',CASE WHEN s.settlement_json->>'status'='settled' THEN ledger.total ELSE NULL END,
    'financialReadVersion',2,
    'committedPoints',CASE WHEN jsonb_array_length(ledger.components)>0 THEN ledger.total ELSE NULL END,
    'transactions',ledger.components)
  FROM owned s CROSS JOIN ledger;
$function$;

CREATE OR REPLACE FUNCTION public.get_ride_award_components(p_rider_id uuid, p_session_id uuid)
 RETURNS TABLE(components jsonb, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.created_at,rt.id),'[]'::jsonb),COALESCE(sum(rt.points_earned),0)
 FROM reward_transactions rt WHERE rt.rider_id=p_rider_id
 AND rt.metadata->>'rideSessionId'=p_session_id::text AND rt.source<>'redemption';
$function$;

CREATE OR REPLACE FUNCTION public.get_ride_awards_for_rider(p_rider_id uuid)
 RETURNS TABLE(ride_session_id uuid, campaign_id uuid, earning_mode text, total_points bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT s.id,s.campaign_id,s.earning_mode::text,
   CASE WHEN public.get_ride_reward_read_state(s.id)->>'status'='settled' THEN a.total ELSE NULL END
 FROM public.ride_session s CROSS JOIN LATERAL public.get_ride_award_components(s.rider_id,s.id) a
 WHERE s.rider_id=p_rider_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_ride_reward_read_state(p_session uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH evidence AS (
   SELECT s.*, j.ride_session_id AS job_id, to_jsonb(j) AS job,
     EXISTS(SELECT 1 FROM public.ride_reward_execution_receipt x WHERE x.session_id=s.id) AS receipt,
     EXISTS(SELECT 1 FROM public.reward_transactions t WHERE t.rider_id=s.rider_id AND t.metadata->>'rideSessionId'=s.id::text AND t.source IN ('standard_ride','boosted_ride','ad_boost','campaign_ride')) AS primary_committed,
     EXISTS(SELECT 1 FROM public.reward_transactions t WHERE t.rider_id=s.rider_id AND t.metadata->>'rideSessionId'=s.id::text AND t.source<>'redemption') AS any_component
   FROM public.ride_session s LEFT JOIN public.ride_reward_settlement j ON j.ride_session_id=s.id WHERE s.id=p_session
 ), classification AS (
 SELECT evidence.*, CASE WHEN job_id IS NOT NULL THEN
   (job-'context'-'lease_token'-'last_error') || jsonb_build_object('reason_code',CASE
     WHEN job->>'status' <> 'awaiting_verification' THEN NULL
     WHEN job->>'last_error'='historical_ride_time_configuration_missing' THEN 'historical_configuration'
     WHEN job->>'last_error' IN ('ride_time_formula_version_review','ride_time_bonus_formula_version_review','reward_policy_engine_mapping_review') THEN 'configuration_changed'
     WHEN job->>'last_error' IN ('ride_time_cap_provenance_review','ride_time_capacity_evidence_missing') THEN 'capacity_evidence'
     WHEN job->>'last_error'='ride_time_cap_order_review' THEN 'earlier_ride'
     WHEN job->>'last_error' IN ('ride_verification_required','ride_quality_evidence_missing','ride_time_verification_conflict','ride_point_count_evidence_missing') THEN 'verification'
     ELSE 'review' END)
 ELSE jsonb_build_object('contract_version',1,'status',CASE
   WHEN status IN ('completed','rejected') AND receipt THEN 'settled'
   WHEN status='rejected' AND NOT any_component THEN 'settled'
   ELSE 'unknown' END,
   'reason_code',CASE WHEN status IN ('completed','rejected') AND primary_committed AND NOT receipt THEN 'historical_configuration' ELSE NULL END)
 END AS state FROM evidence
 ) SELECT state || jsonb_build_object(
   'completeness',CASE WHEN receipt AND job_id IS NOT NULL AND job->>'status'<>'settled' THEN 'conflict'
     WHEN state->>'status'='settled' THEN 'complete' ELSE 'unresolved' END,
   'completion_evidence',CASE
     WHEN receipt AND job_id IS NOT NULL AND job->>'status'<>'settled' THEN 'conflicting_job_receipt'
     WHEN job->>'status'='settled' THEN 'settlement_job'
     WHEN state->>'status'='settled' AND receipt THEN 'execution_receipt'
     WHEN state->>'status'='settled' THEN 'rejected_without_award'
     WHEN job_id IS NULL AND any_component THEN 'historical_components_unresolved'
     ELSE 'unresolved' END)
 FROM classification;
$function$;

CREATE OR REPLACE FUNCTION public.join_community_ride(p_community_ride_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ride        RECORD;
  v_active_cnt  INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rider r
    WHERE r.id = p_rider_id
      AND r.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT id, status, max_participants, is_public
    INTO v_ride
    FROM public.community_ride
   WHERE id = p_community_ride_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_found');
  END IF;

  IF NOT v_ride.is_public THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_public');
  END IF;

  IF v_ride.status NOT IN ('upcoming', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_joinable');
  END IF;

  SELECT COUNT(*)
    INTO v_active_cnt
    FROM public.community_ride_participant
   WHERE community_ride_id = p_community_ride_id
     AND status = 'joined';

  IF v_active_cnt >= v_ride.max_participants THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_full');
  END IF;

  INSERT INTO public.community_ride_participant
    (community_ride_id, rider_id, status, joined_at)
  VALUES
    (p_community_ride_id, p_rider_id, 'joined', NOW())
  ON CONFLICT (community_ride_id, rider_id)
    DO UPDATE SET status = 'joined', joined_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_community_ride(p_community_ride_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ride_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rider r
    WHERE r.id = p_rider_id
      AND r.user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT status INTO v_ride_status
  FROM public.community_ride
  WHERE id = p_community_ride_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_found');
  END IF;

  IF v_ride_status NOT IN ('upcoming', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ride_not_leavable');
  END IF;

  UPDATE public.community_ride_participant
  SET status = 'left'
  WHERE community_ride_id = p_community_ride_id
    AND rider_id           = p_rider_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_campaign_accessory_issue(p_assignment_id uuid, p_issue_type text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_assignment public.rider_campaign_accessory_assignment%ROWTYPE;
  v_next_status movrr_accessory_assignment_status;
BEGIN
  IF p_issue_type NOT IN ('issue_reported', 'damaged', 'missing', 'lost') THEN
    RAISE EXCEPTION 'Invalid accessory issue type' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.rider_campaign_accessory_assignment a
  JOIN public.rider r ON r.id = a.rider_id
  WHERE a.id = p_assignment_id
    AND r.user_id = auth.uid()
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Accessory assignment not found' USING ERRCODE = 'P0001';
  END IF;

  v_next_status := CASE WHEN p_issue_type IN ('missing', 'lost') THEN 'lost' ELSE 'issue_reported' END;

  UPDATE public.rider_campaign_accessory_assignment
  SET status = v_next_status,
      issue_reported_at = NOW(),
      updated_at = NOW()
  WHERE id = p_assignment_id;

  UPDATE public.campaign_accessory_inventory_item
  SET status = CASE WHEN p_issue_type IN ('missing', 'lost') THEN 'lost' ELSE 'maintenance' END,
      updated_at = NOW()
  WHERE id = v_assignment.inventory_item_id;

  INSERT INTO public.rider_campaign_accessory_event (
    assignment_id,
    event_type,
    actor_user_id,
    note
  )
  VALUES (p_assignment_id, p_issue_type::movrr_accessory_event_type, auth.uid(), NULLIF(btrim(COALESCE(p_note, '')), ''));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rider_campaign_confirm(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rider_id uuid;
  v_now timestamptz := now();
  v_lifecycle text;
BEGIN
  v_rider_id := public.current_rider_id();
  IF v_rider_id IS NULL THEN
    RAISE EXCEPTION 'Rider record not found for current user' USING ERRCODE = '22023';
  END IF;

  SELECT lifecycle_status INTO v_lifecycle
  FROM public.campaign
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002';
  END IF;

  -- Allow confirmation in confirmed or active (campaign may have auto-activated).
  IF v_lifecycle NOT IN ('confirmed', 'active') THEN
    RAISE EXCEPTION 'Campaign is not accepting confirmations' USING ERRCODE = '22023';
  END IF;

  UPDATE public.campaign_signup
  SET status = 'confirmed',
      confirmed_at = v_now,
      updated_at = v_now
  WHERE campaign_id = p_campaign_id
    AND rider_id = v_rider_id
    AND status = 'selected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rider is not selected for this campaign' USING ERRCODE = '22023';
  END IF;

  -- Create assignment when rider confirms selection.
  INSERT INTO public.campaign_assignment (campaign_id, rider_id, assigned_at, created_by)
  SELECT p_campaign_id, v_rider_id, v_now, auth.uid()
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.campaign_assignment ca
    WHERE ca.campaign_id = p_campaign_id
      AND ca.rider_id = v_rider_id
  );

  RETURN jsonb_build_object(
    'campaignId', p_campaign_id,
    'riderId', v_rider_id,
    'confirmedAt', v_now
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rider_campaign_opt_in(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rider_id uuid;
  v_campaign record;
  v_effective_status text;
BEGIN
  v_rider_id := public.current_rider_id();
  IF v_rider_id IS NULL THEN
    RAISE EXCEPTION 'Rider record not found for current user' USING ERRCODE = '22023';
  END IF;

  SELECT id, lifecycle_status, signup_deadline
  INTO v_campaign
  FROM public.campaign
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_campaign.lifecycle_status IS DISTINCT FROM 'open_for_signup' THEN
    RAISE EXCEPTION 'Campaign is not open for signup' USING ERRCODE = '22023';
  END IF;

  IF v_campaign.signup_deadline IS NOT NULL AND now() > v_campaign.signup_deadline THEN
    RAISE EXCEPTION 'Signup deadline has passed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.campaign_signup (campaign_id, rider_id, status)
  VALUES (p_campaign_id, v_rider_id, 'joined')
  ON CONFLICT (campaign_id, rider_id) DO UPDATE
    SET
      -- prevent duplicates while allowing re-join after withdraw/reject/expire
      status = CASE
        WHEN public.campaign_signup.status IN ('withdrawn', 'rejected', 'expired') THEN 'joined'
        ELSE public.campaign_signup.status
      END,
      joined_at = CASE
        WHEN public.campaign_signup.status IN ('withdrawn', 'rejected', 'expired') THEN now()
        ELSE public.campaign_signup.joined_at
      END,
      updated_at = now()
  RETURNING status INTO v_effective_status;

  RETURN jsonb_build_object(
    'campaignId', p_campaign_id,
    'riderId', v_rider_id,
    'status', v_effective_status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rider_campaign_withdraw(p_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rider_id uuid;
  v_deadline timestamptz;
BEGIN
  v_rider_id := public.current_rider_id();
  IF v_rider_id IS NULL THEN
    RAISE EXCEPTION 'Rider record not found for current user' USING ERRCODE = '22023';
  END IF;

  SELECT signup_deadline INTO v_deadline
  FROM public.campaign
  WHERE id = p_campaign_id;

  IF v_deadline IS NOT NULL AND now() > v_deadline THEN
    RAISE EXCEPTION 'Signup deadline has passed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.campaign_signup
  SET status = 'withdrawn',
      withdrawn_at = now(),
      updated_at = now()
  WHERE campaign_id = p_campaign_id
    AND rider_id = v_rider_id
    AND status = 'joined';
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_rider_brand_preference(p_brand_id uuid, p_preference movrr_brand_preference, p_source text DEFAULT 'account_brand_preferences'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rider_id UUID;
  v_previous movrr_brand_preference;
BEGIN
  SELECT id INTO v_rider_id
  FROM public.rider
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_rider_id IS NULL THEN
    RAISE EXCEPTION 'Rider profile not found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.brand
    WHERE id = p_brand_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'Brand is not available' USING ERRCODE = 'P0001';
  END IF;

  SELECT preference INTO v_previous
  FROM public.rider_brand_preference
  WHERE rider_id = v_rider_id AND brand_id = p_brand_id;

  INSERT INTO public.rider_brand_preference (rider_id, brand_id, preference, source)
  VALUES (v_rider_id, p_brand_id, p_preference, COALESCE(NULLIF(btrim(p_source), ''), 'account_brand_preferences'))
  ON CONFLICT (rider_id, brand_id)
  DO UPDATE SET
    preference = EXCLUDED.preference,
    source = EXCLUDED.source,
    updated_at = NOW();

  INSERT INTO public.rider_brand_preference_event (
    rider_id,
    brand_id,
    previous_preference,
    new_preference,
    source,
    actor_user_id
  )
  VALUES (
    v_rider_id,
    p_brand_id,
    v_previous,
    p_preference,
    COALESCE(NULLIF(btrim(p_source), ''), 'account_brand_preferences'),
    auth.uid()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_my_achievement_progress()
 RETURNS TABLE(badge_code text, badge_definition_id uuid, current_value numeric, target_value numeric, awarded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rider uuid;
  v_rides numeric;
  v_distance numeric;
  v_points numeric;
  v_streak numeric;
  v_weekly numeric;
  v_def record;
  v_current numeric;
BEGIN
  SELECT r.id INTO v_rider FROM public.rider r WHERE r.user_id = auth.uid() LIMIT 1;
  IF v_rider IS NULL THEN RETURN; END IF;
  -- Backend-receipted, verified completed sessions only. Client status, GPS uploads and
  -- proposed unlock metadata never substitute for verification evidence.
  SELECT count(*), coalesce(sum(greatest(coalesce(rs.total_distance_meters, 0), 0)), 0) / 1000
  INTO v_rides, v_distance FROM public.ride_session rs
  JOIN public.ride_reward_execution_receipt receipt ON receipt.session_id = rs.id
  WHERE rs.rider_id = v_rider AND rs.status = 'completed'
    AND rs.verification_result->>'status' = 'verified';

  SELECT coalesce(sum(rt.points_earned), 0) INTO v_points
  FROM public.reward_transactions rt
  JOIN public.ride_session rs ON rs.id::text = rt.metadata->>'rideSessionId'
    AND rs.rider_id = rt.rider_id
  JOIN public.ride_reward_execution_receipt receipt ON receipt.session_id = rs.id
  WHERE rt.rider_id = v_rider AND rt.points_earned > 0
    AND rt.source IN ('standard_ride', 'boosted_ride', 'standard_ride_bonus', 'ad_boost', 'campaign_ride', 'bonus')
    AND rs.status = 'completed' AND rs.verification_result->>'status' = 'verified';

  -- Lifetime best windows allow delayed reconciliation after a streak/week ends.
  WITH days AS (
    SELECT DISTINCT (coalesce(rs.completed_at, rs.started_at) AT TIME ZONE (snap.basis->>'rewardTimezone'))::date AS day
    FROM public.ride_session rs
    JOIN public.ride_reward_execution_receipt receipt ON receipt.session_id = rs.id
    JOIN public.ride_reward_configuration_snapshot snap ON snap.ride_session_id = rs.id AND snap.content_digest = receipt.snapshot_digest
    WHERE rs.rider_id = v_rider
      AND rs.status = 'completed' AND rs.verification_result->>'status' = 'verified'
  ), islands AS (SELECT day - row_number() OVER (ORDER BY day)::integer AS island FROM days),
  lengths AS (SELECT count(*) AS n FROM islands GROUP BY island)
  SELECT coalesce(max(n), 0) INTO v_streak FROM lengths;

  SELECT coalesce(max(n), 0) INTO v_weekly FROM (
    SELECT count(*) AS n FROM public.ride_session rs
    JOIN public.ride_reward_execution_receipt receipt ON receipt.session_id = rs.id
    JOIN public.ride_reward_configuration_snapshot snap ON snap.ride_session_id = rs.id AND snap.content_digest = receipt.snapshot_digest
    WHERE rs.rider_id = v_rider AND rs.status = 'completed'
      AND rs.verification_result->>'status' = 'verified'
      AND rs.earning_mode = 'ad_enhanced_ride'
    GROUP BY date_trunc('week', coalesce(rs.completed_at, rs.started_at) AT TIME ZONE (snap.basis->>'rewardTimezone'))
  ) weeks;
  FOR v_def IN
    SELECT bd.* FROM public.rider_badge_definition bd
    JOIN (VALUES
      ('distance_1000', 'min_total_distance_km', 1000),
      ('distance_250', 'min_total_distance_km', 250),
      ('first_ride', 'min_total_rides', 1),
      ('rides_50', 'min_total_rides', 50),
      ('rides_100', 'min_total_rides', 100),
      ('streak_3_days', 'min_streak_days', 3),
      ('weekly_boosted_rides_2', 'min_weekly_boosted_rides', 2),
      ('weekly_boosted_rides_3', 'min_weekly_boosted_rides', 3),
      ('points_1500', 'min_points_earned', 1500),
      ('points_2000', 'min_points_earned', 2000)
    ) supported(code, rule_type, threshold)
      ON bd.code = supported.code AND bd.rule_type = supported.rule_type
      AND bd.rule_threshold = supported.threshold
    WHERE bd.is_active
  LOOP
    v_current := CASE v_def.rule_type
      WHEN 'min_total_distance_km' THEN v_distance
      WHEN 'min_total_rides' THEN v_rides
      WHEN 'min_streak_days' THEN v_streak
      WHEN 'min_weekly_boosted_rides' THEN v_weekly
      WHEN 'min_points_earned' THEN v_points END;
    IF v_current IS NULL THEN CONTINUE; END IF;
    IF v_current >= v_def.rule_threshold THEN
      INSERT INTO public.rider_badge_award(rider_id, badge_definition_id, source, metadata)
      VALUES (v_rider, v_def.id, 'system_rule', jsonb_build_object(
        'authority', 'verified_catalogue_v1', 'rule', v_def.rule_type,
        'value', v_current, 'threshold', v_def.rule_threshold))
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN QUERY SELECT v_def.code, v_def.id, v_current, v_def.rule_threshold,
      (SELECT ba.awarded_at FROM public.rider_badge_award ba
       WHERE ba.rider_id = v_rider AND ba.badge_definition_id = v_def.id AND ba.revoked_at IS NULL);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_community_ride(p_ride_id uuid, p_expected_updated_at timestamp with time zone, p_title text, p_description text, p_scheduled_at timestamp with time zone, p_meeting_point_name text, p_category text, p_max_participants integer, p_distance_km numeric DEFAULT NULL::numeric, p_cover_image_url text DEFAULT NULL::text, p_cover_image_path text DEFAULT NULL::text, p_meeting_point_lat double precision DEFAULT NULL::double precision, p_meeting_point_lng double precision DEFAULT NULL::double precision, p_meeting_point_address text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, error_code text, new_updated_at timestamp with time zone, participants_notified integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid            UUID := auth.uid();
  v_ride           public.community_ride;
  v_joined_count   INT;
  v_changed        TEXT[] := ARRAY[]::TEXT[];
  v_material       BOOLEAN := FALSE;
  v_before         JSONB := '{}'::jsonb;
  v_after          JSONB := '{}'::jsonb;
  v_notified       INT := 0;
  v_participant    RECORD;
  v_new_updated_at TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, 'unauthenticated', NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  SELECT * INTO v_ride FROM public.community_ride WHERE id = p_ride_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'not_found', NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  IF v_ride.organizer_user_id IS DISTINCT FROM v_uid THEN
    RETURN QUERY SELECT FALSE, 'not_organiser', NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  IF v_ride.status IN ('completed', 'cancelled') THEN
    RETURN QUERY SELECT FALSE, 'ride_not_editable', NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND v_ride.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT FALSE, 'conflict', v_ride.updated_at, 0;
    RETURN;
  END IF;

  SELECT COUNT(*)::INT INTO v_joined_count
  FROM public.community_ride_participant p
  WHERE p.community_ride_id = p_ride_id AND p.status = 'joined';

  IF p_max_participants < v_joined_count THEN
    RETURN QUERY SELECT FALSE, 'capacity_below_participants', v_ride.updated_at, v_joined_count;
    RETURN;
  END IF;

  IF p_title IS DISTINCT FROM v_ride.title THEN
    v_changed := v_changed || 'title'::TEXT;
  END IF;

  IF p_description IS DISTINCT FROM v_ride.description THEN
    v_changed := v_changed || 'description'::TEXT;
  END IF;

  IF p_scheduled_at IS DISTINCT FROM v_ride.scheduled_at THEN
    v_changed := v_changed || 'scheduled_at'::TEXT;
    v_material := TRUE;
    v_before := v_before || jsonb_build_object('scheduled_at', v_ride.scheduled_at);
    v_after  := v_after  || jsonb_build_object('scheduled_at', p_scheduled_at);
  END IF;

  -- Moving the pin is moving the meeting point, even when the name is unchanged: two
  -- squares can share a name, and what riders navigate to is the pin.
  IF p_meeting_point_name    IS DISTINCT FROM v_ride.meeting_point_name
     OR p_meeting_point_lat  IS DISTINCT FROM v_ride.meeting_point_lat
     OR p_meeting_point_lng  IS DISTINCT FROM v_ride.meeting_point_lng
     OR p_meeting_point_address IS DISTINCT FROM v_ride.meeting_point_address THEN
    v_changed := v_changed || 'meeting_point_name'::TEXT;
    v_material := TRUE;
    v_before := v_before || jsonb_build_object(
      'meeting_point_name', v_ride.meeting_point_name,
      'meeting_point_address', v_ride.meeting_point_address,
      'meeting_point_lat', v_ride.meeting_point_lat,
      'meeting_point_lng', v_ride.meeting_point_lng
    );
    v_after := v_after || jsonb_build_object(
      'meeting_point_name', p_meeting_point_name,
      'meeting_point_address', p_meeting_point_address,
      'meeting_point_lat', p_meeting_point_lat,
      'meeting_point_lng', p_meeting_point_lng
    );
  END IF;

  IF p_category IS DISTINCT FROM v_ride.category THEN
    v_changed := v_changed || 'category'::TEXT;
  END IF;

  IF p_max_participants IS DISTINCT FROM v_ride.max_participants THEN
    v_changed := v_changed || 'max_participants'::TEXT;
  END IF;

  IF p_distance_km IS DISTINCT FROM v_ride.distance_km THEN
    v_changed := v_changed || 'distance_km'::TEXT;
  END IF;

  -- Only a supplied image is a change. A NULL means "no new image", and the COALESCE in
  -- the UPDATE leaves the column alone — recording it as changed logged an edit that
  -- never happened, on every single save.
  IF p_cover_image_url IS NOT NULL
     AND p_cover_image_url IS DISTINCT FROM v_ride.cover_image_url THEN
    v_changed := v_changed || 'cover_image_url'::TEXT;
  END IF;

  IF array_length(v_changed, 1) IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::TEXT, v_ride.updated_at, 0;
    RETURN;
  END IF;

  IF v_ride.status = 'active' AND (
       v_material
       OR 'title' = ANY(v_changed)
       OR 'category' = ANY(v_changed)
       OR 'max_participants' = ANY(v_changed)
       OR 'distance_km' = ANY(v_changed)
     ) THEN
    RETURN QUERY SELECT FALSE, 'ride_in_progress', v_ride.updated_at, 0;
    RETURN;
  END IF;

  IF 'scheduled_at' = ANY(v_changed) AND p_scheduled_at <= NOW() THEN
    RETURN QUERY SELECT FALSE, 'scheduled_in_past', v_ride.updated_at, 0;
    RETURN;
  END IF;

  UPDATE public.community_ride
  SET
    title                 = p_title,
    description           = p_description,
    scheduled_at          = p_scheduled_at,
    meeting_point_name    = p_meeting_point_name,
    meeting_point_address = p_meeting_point_address,
    meeting_point_lat     = p_meeting_point_lat,
    meeting_point_lng     = p_meeting_point_lng,
    category              = p_category,
    max_participants      = p_max_participants,
    distance_km           = p_distance_km,
    cover_image_url       = COALESCE(p_cover_image_url, cover_image_url),
    cover_image_path      = COALESCE(p_cover_image_path, cover_image_path)
  WHERE id = p_ride_id
  RETURNING updated_at INTO v_new_updated_at;

  IF v_material THEN
    FOR v_participant IN
      SELECT u.id AS user_id
      FROM public.community_ride_participant p
      JOIN public.rider r ON r.id = p.rider_id
      JOIN public."user" u ON u.id = r.user_id
      WHERE p.community_ride_id = p_ride_id
        AND p.status = 'joined'
        AND u.id IS DISTINCT FROM v_uid
    LOOP
      PERFORM public.insert_notification(
        v_participant.user_id,
        'system',
        'Community ride updated',
        v_ride.title || ' has changed. Check the ride details.',
        jsonb_build_object(
          'community_ride_id', p_ride_id,
          'changed_fields', to_jsonb(v_changed)
        )
      );
      v_notified := v_notified + 1;
    END LOOP;
  END IF;

  INSERT INTO public.community_ride_change_log (
    community_ride_id, changed_by_user_id, changed_fields,
    before_values, after_values, participants_notified
  ) VALUES (
    p_ride_id, v_uid, v_changed, v_before, v_after, v_notified
  );

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_updated_at, v_notified;
END;
$function$;
