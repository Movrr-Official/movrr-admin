-- Manual rollback only after explicit production authorization. Restores the pre-065 boundary.
BEGIN;
SET LOCAL lock_timeout='5s';
DROP TRIGGER IF EXISTS community_rider_authorization ON public.community_ride;
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
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_my_community_ride(p_id uuid, p_expected timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.community_ride; BEGIN
 PERFORM public.assert_active_account();SELECT * INTO r FROM public.community_ride WHERE id=p_id AND organizer_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Organizer access required' USING ERRCODE='42501'; END IF;
 IF r.status='cancelled' THEN RETURN; END IF;
 IF p_expected IS NULL OR r.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Ride changed' USING ERRCODE='40001'; END IF;
 IF r.status NOT IN ('upcoming','active') THEN RAISE EXCEPTION 'Ride is closed' USING ERRCODE='22023'; END IF;
 UPDATE public.community_ride SET status='cancelled' WHERE id=p_id;
 INSERT INTO public.community_ride_change_log(community_ride_id,changed_by_user_id,changed_fields,before_values,after_values,participants_notified) VALUES(p_id,auth.uid(),ARRAY['status'],jsonb_build_object('status',r.status),jsonb_build_object('status','cancelled'),0);
END $function$
;

CREATE OR REPLACE FUNCTION public.create_my_community_ride(p_operation uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$
;

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
 PERFORM public.assert_active_account();
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
$function$
;
GRANT EXECUTE ON FUNCTION public.can_create_community_ride(uuid) TO PUBLIC,anon,authenticated,service_role;
DROP FUNCTION public.enforce_community_rider_authorization();
DROP FUNCTION public.community_rider_account_active(uuid);
COMMIT;
