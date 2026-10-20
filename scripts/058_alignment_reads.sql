-- X01/X05. New paginated consumer of the existing canonical summary, no new reward computation.
BEGIN;
CREATE FUNCTION public.get_my_ride_summary_page(p_limit integer DEFAULT 50,p_cursor jsonb DEFAULT NULL,p_route uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rows jsonb; next_position jsonb;
BEGIN
 PERFORM public.assert_active_account();
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 WITH page AS (
  SELECT s.id,s.started_at,public.get_my_ride_summary(s.id,false) summary FROM public.ride_session s JOIN public.rider r ON r.id=s.rider_id
  WHERE r.user_id=auth.uid() AND (p_route IS NULL OR s.route_id=p_route) AND (p_cursor IS NULL OR (s.started_at,s.id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid))
  ORDER BY s.started_at DESC,s.id DESC LIMIT p_limit+1
 ), numbered AS (SELECT *,row_number() OVER(ORDER BY started_at DESC,id DESC) rn FROM page)
 SELECT coalesce(jsonb_agg(summary ORDER BY started_at DESC,id DESC) FILTER(WHERE rn<=p_limit),'[]'),
 CASE WHEN count(*)>p_limit THEN (SELECT jsonb_build_object('at',started_at,'id',id) FROM numbered WHERE rn=p_limit) ELSE NULL END
 INTO rows,next_position FROM numbered;
 RETURN jsonb_build_object('summaries',rows,'nextCursor',next_position);
END $$;
REVOKE ALL ON FUNCTION public.get_my_ride_summary_page(integer,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_ride_summary_page(integer,jsonb,uuid) TO authenticated;
-- The existing Mobile SQL reader keeps its signature and output, with suspended identities denied.
DO $guard$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.get_my_ride_summary(uuid,boolean)'::regprocedure) INTO body;
 IF body NOT LIKE '%account_is_active%' THEN
  IF body NOT LIKE '%r.user_id=auth.uid()%' THEN RAISE EXCEPTION 'Review changed summary ownership contract'; END IF;
  EXECUTE replace(body,'r.user_id=auth.uid()','r.user_id=auth.uid() AND public.account_is_active()');
 END IF;
END $guard$;
CREATE FUNCTION public.get_my_campaign_catalog() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid; result jsonb;
BEGIN
 PERFORM public.assert_active_account();SELECT id INTO STRICT rid FROM public.rider WHERE user_id=auth.uid();
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'lifecycleStatus',c.lifecycle_status,'campaignType',c.campaign_type,'startDate',c.start_date,'endDate',c.end_date,'targetZones',coalesce(to_jsonb(c.target_zones),'[]'),'signupStatus',s.status,
 'canJoin',c.lifecycle_status='open_for_signup' AND (c.signup_deadline IS NULL OR c.signup_deadline>=now()) AND (s.status IS NULL OR s.status IN ('withdrawn','rejected','expired')),
 'canWithdraw',coalesce(s.status='joined' AND (c.signup_deadline IS NULL OR c.signup_deadline>=now()),false),
 'canConfirm',coalesce(s.status='selected' AND c.lifecycle_status IN ('confirmed','active'),false)) ORDER BY c.created_at DESC,c.id),'[]') INTO result
 FROM public.campaign c LEFT JOIN public.campaign_signup s ON s.campaign_id=c.id AND s.rider_id=rid
 WHERE c.lifecycle_status IN ('open_for_signup','selection_in_progress','confirmed') OR s.rider_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.campaign_assignment a WHERE a.campaign_id=c.id AND a.rider_id=rid);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_my_campaign_catalog() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_campaign_catalog() TO authenticated;
CREATE FUNCTION public.ops_ride_session_page(p_filters jsonb) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE page_no integer:=coalesce((p_filters->>'page')::integer,0); size integer:=coalesce((p_filters->>'pageSize')::integer,100); q text:=nullif(trim(p_filters->>'searchQuery'),''); snapshot timestamptz:=coalesce((p_filters->>'asOf')::timestamptz,now());
BEGIN
 IF page_no<0 OR size NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid ride page' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT to_jsonb(s)||jsonb_build_object('_settlement',public.get_ride_reward_read_state(s.id)) FROM public.ride_session s
 WHERE s.created_at<=snapshot
 AND (nullif(p_filters->>'riderId','') IS NULL OR s.rider_id=(p_filters->>'riderId')::uuid)
 AND (coalesce(p_filters->>'earningMode','all')='all' OR s.earning_mode::text=p_filters->>'earningMode')
 AND (coalesce(p_filters->>'verificationStatus','all')='all' OR coalesce(s.verification_result->>'status','pending')=p_filters->>'verificationStatus')
 AND (q IS NULL OR s.id::text=q OR s.rider_id::text=q OR EXISTS(SELECT 1 FROM public.rider r WHERE r.id=s.rider_id AND r.city ILIKE '%'||q||'%') OR EXISTS(SELECT 1 FROM public.rider r JOIN public."user" u ON u.id=r.user_id WHERE r.id=s.rider_id AND u.name ILIKE '%'||q||'%') OR EXISTS(SELECT 1 FROM public.campaign c WHERE c.id=s.campaign_id AND c.name ILIKE '%'||q||'%'))
 ORDER BY s.created_at DESC,s.id DESC LIMIT size OFFSET page_no*size;
END $$;
REVOKE ALL ON FUNCTION public.ops_ride_session_page(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops_ride_session_page(jsonb) TO service_role;
CREATE FUNCTION public.update_my_rider_profile(p_profile jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid; locale text:=p_profile->>'language'; BEGIN
 PERFORM public.assert_active_account(); SELECT id INTO STRICT rid FROM public.rider WHERE user_id=auth.uid();
 IF locale NOT IN ('en-US','nl-NL') OR locale IS NULL OR octet_length(p_profile::text)>8000 OR p_profile - ARRAY['phone','city','country','emergency_contact','emergency_phone','vehicle_type','language'] <> '{}'::jsonb THEN RAISE EXCEPTION 'Invalid rider profile' USING ERRCODE='22023'; END IF;
 UPDATE public."user" SET phone=nullif(trim(p_profile->>'phone'),'') WHERE id=auth.uid();
 UPDATE public.rider SET city=nullif(trim(p_profile->>'city'),''),country=nullif(trim(p_profile->>'country'),''),emergency_contact=nullif(trim(p_profile->>'emergency_contact'),''),emergency_phone=nullif(trim(p_profile->>'emergency_phone'),''),vehicle_type=nullif(trim(p_profile->>'vehicle_type'),'') WHERE id=rid;
 INSERT INTO public.user_preferences(user_id,language) VALUES(auth.uid(),locale) ON CONFLICT(user_id) DO UPDATE SET language=EXCLUDED.language,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.update_my_rider_profile(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_my_rider_profile(jsonb) TO authenticated;
CREATE FUNCTION public.cancel_my_community_ride(p_id uuid,p_expected timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.community_ride; BEGIN
 PERFORM public.assert_active_account();SELECT * INTO r FROM public.community_ride WHERE id=p_id AND organizer_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Organizer access required' USING ERRCODE='42501'; END IF;
 IF r.status='cancelled' THEN RETURN; END IF;
 IF p_expected IS NULL OR r.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Ride changed' USING ERRCODE='40001'; END IF;
 IF r.status NOT IN ('upcoming','active') THEN RAISE EXCEPTION 'Ride is closed' USING ERRCODE='22023'; END IF;
 UPDATE public.community_ride SET status='cancelled' WHERE id=p_id;
 INSERT INTO public.community_ride_change_log(community_ride_id,changed_by_user_id,changed_fields,before_values,after_values,participants_notified) VALUES(p_id,auth.uid(),ARRAY['status'],jsonb_build_object('status',r.status),jsonb_build_object('status','cancelled'),0);
END $$;
REVOKE ALL ON FUNCTION public.cancel_my_community_ride(uuid,timestamptz) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_my_community_ride(uuid,timestamptz) TO authenticated;
CREATE FUNCTION public.read_rider_wallet_snapshot(p_rider uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE balance public.rider_reward_balance; entries bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.rider WHERE id=p_rider) THEN RAISE EXCEPTION 'Rider unavailable' USING ERRCODE='P0002'; END IF;
 SELECT count(*) INTO entries FROM public.reward_transactions WHERE rider_id=p_rider;
 SELECT * INTO balance FROM public.rider_reward_balance WHERE rider_id=p_rider;
 IF NOT FOUND AND entries>0 THEN RAISE EXCEPTION 'Wallet projection unavailable' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('riderId',p_rider,'pointsBalance',coalesce(balance.points_balance,0),'lifetimePointsEarned',coalesce(balance.lifetime_points_earned,0),'transactionCount',entries,'asOf',statement_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.read_rider_wallet_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_rider_wallet_snapshot(uuid) TO service_role;
CREATE FUNCTION public.create_my_community_ride(p_operation uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid();rid uuid;receipt public.ops_command_receipt;result jsonb;public_name text;
BEGIN
 PERFORM public.assert_active_account();
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_operation::text,7));
 SELECT * INTO receipt FROM public.ops_command_receipt WHERE ops_command_receipt.actor_user_id=actor AND operation=p_operation;
 IF FOUND THEN IF receipt.kind<>'community_create' OR receipt.payload<>p_input THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;RETURN receipt.result;END IF;
 IF p_operation IS NULL OR length(trim(coalesce(p_input->>'title',''))) NOT BETWEEN 3 AND 200 OR nullif(p_input->>'scheduledAt','') IS NULL OR (p_input->>'scheduledAt')::timestamptz<=now() OR p_input->>'category' IS NULL OR p_input->>'category' NOT IN ('beginner','intermediate','challenging','social') OR p_input->>'maxParticipants' IS NULL OR (p_input->>'maxParticipants')::integer NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid community ride' USING ERRCODE='22023'; END IF;
 IF NOT public.can_create_community_ride(actor) THEN RAISE EXCEPTION 'Creator eligibility required' USING ERRCODE='42501';END IF;
 SELECT r.id,coalesce(nullif(split_part(trim(u.name),' ',1),''),'Rider') INTO STRICT rid,public_name FROM public.rider r JOIN public."user" u ON u.id=r.user_id WHERE r.user_id=actor;
 INSERT INTO public.community_ride(title,description,scheduled_at,meeting_point_name,category,max_participants,organizer_rider_id,organizer_user_id,created_by_user_id,organizer_type,organizer_name,status,is_public)
 VALUES(trim(p_input->>'title'),nullif(trim(p_input->>'description'),''),(p_input->>'scheduledAt')::timestamptz,nullif(trim(p_input->>'meetingPoint'),''),p_input->>'category',(p_input->>'maxParticipants')::integer,rid,actor,actor,'rider',public_name,'upcoming',true) RETURNING to_jsonb(community_ride.*) INTO result;
 INSERT INTO public.ops_command_receipt VALUES(actor,p_operation,'community_create',p_input,result,now());RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_my_community_ride(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_my_community_ride(uuid,jsonb) TO authenticated;
COMMIT;
