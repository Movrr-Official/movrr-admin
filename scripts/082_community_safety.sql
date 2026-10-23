-- Community safety. Apply only after 065 and 075; source phase does not apply this remotely.
BEGIN;
SET LOCAL lock_timeout='5s';

-- Preserve the publication decision for existing content. Only later submissions
-- start pending; existing content is restricted through an audited staff decision.
ALTER TABLE public.community_ride ADD COLUMN moderation_state text NOT NULL DEFAULT 'approved'
 CHECK(moderation_state IN ('pending','approved','restricted'));
ALTER TABLE public.community_ride ALTER COLUMN moderation_state SET DEFAULT 'pending';
ALTER TABLE public.community_ride ADD COLUMN moderation_version bigint NOT NULL DEFAULT 1 CHECK(moderation_version>0);
CREATE INDEX community_review_queue ON public.community_ride(created_at) WHERE moderation_state='pending';
-- The private path becomes the only cover authority. Existing public URL strings
-- must not outlive the coordinated private-bucket transition or staff review.
DO $$ DECLARE previous_role text:=current_setting('request.jwt.claim.role',true); BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 UPDATE public.community_ride SET cover_image_url=NULL WHERE cover_image_url IS NOT NULL;
 PERFORM set_config('request.jwt.claim.role',coalesce(previous_role,''),true);
END $$;

-- Existing is_public and lifecycle values remain authoritative alongside review.
CREATE TABLE public.community_block (
 blocker_rider_id uuid NOT NULL REFERENCES public.rider(id) ON DELETE CASCADE,
 blocked_rider_id uuid NOT NULL REFERENCES public.rider(id) ON DELETE CASCADE,
 display_name text NOT NULL CHECK(length(display_name)<=200),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_rider_id,blocked_rider_id), CHECK(blocker_rider_id<>blocked_rider_id)
);
CREATE INDEX community_block_reverse ON public.community_block(blocked_rider_id,blocker_rider_id);
-- Evidence deliberately has no content/account FK: removal must not destroy evidence.
CREATE TABLE public.community_report (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_user_id uuid NOT NULL,
 ride_id uuid NOT NULL, subject_rider_id uuid,
 target text NOT NULL CHECK(target IN ('ride','text','image','organiser')),
 reason text NOT NULL CHECK(reason IN ('harassment','sexual','violence','hate','spam','impersonation','other')),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 content_version bigint NOT NULL CHECK(content_version>0),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'), created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','actioned')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(reporter_user_id,ride_id,target,content_version)
);
CREATE INDEX community_report_queue ON public.community_report(status,reason,created_at);
CREATE INDEX community_report_rate ON public.community_report(reporter_user_id,created_at);
CREATE INDEX community_report_cover ON public.community_report((evidence->>'cover_image_path'));
CREATE TABLE public.community_moderation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE,
 actor_user_id uuid NOT NULL, report_id uuid, ride_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('approve','restrict','dismiss','remove')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 2000),
 evidence jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_audit_cover ON public.community_moderation_audit((evidence->>'cover_image_path'));
ALTER TABLE public.community_block OWNER TO postgres;
ALTER TABLE public.community_report OWNER TO postgres;
ALTER TABLE public.community_moderation_audit OWNER TO postgres;
ALTER TABLE public.community_block ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_moderation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_block,public.community_report,public.community_moderation_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.community_report,public.community_moderation_audit TO service_role;
-- All writes and block reads use narrow RPCs; ordinary rider APIs see no reports.

CREATE FUNCTION public.community_pair_blocked(a uuid,b uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.community_block WHERE
 ((blocker_rider_id=a AND blocked_rider_id=b) OR (blocker_rider_id=b AND blocked_rider_id=a))
 AND (auth.role()='service_role' OR EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=auth.uid() AND r.id IN (a,b))))
$$;
CREATE FUNCTION public.community_content_visible(p_ride uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.community_ride c WHERE c.id=p_ride AND
 (c.organizer_user_id=auth.uid() OR
 (c.moderation_state='approved' AND ((c.is_public AND NOT EXISTS(
 SELECT 1 FROM public.community_block b JOIN public.rider r ON r.id=b.blocker_rider_id
 WHERE r.user_id=auth.uid() AND c.organizer_type='rider' AND b.blocked_rider_id=c.organizer_rider_id))
 OR EXISTS(SELECT 1 FROM public.community_ride_participant p JOIN public.rider r ON r.id=p.rider_id
 WHERE p.community_ride_id=c.id AND r.user_id=auth.uid()
 AND (p.status='joined' OR c.status IN ('completed','cancelled')))))))
$$;
CREATE POLICY community_safety_visibility ON public.community_ride AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(organizer_user_id=auth.uid() OR public.community_content_visible(id));
-- Preserve the approved roster and count for accessible shared rides. A block
-- prevents new interactions; it does not erase an existing participant.
CREATE POLICY community_participant_safety_visibility ON public.community_ride_participant AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(public.community_content_visible(community_ride_id));

CREATE FUNCTION public.community_safety_content_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed boolean; trusted boolean:=coalesce(auth.role()='service_role',false);
BEGIN
 IF TG_OP='INSERT' THEN
   NEW.moderation_state:='pending'; NEW.moderation_version:=1;
 ELSE
   changed:=ROW(NEW.title,NEW.description,NEW.organizer_name,NEW.meeting_point_name,NEW.meeting_point_address,NEW.cover_image_path,NEW.cover_image_url)
    IS DISTINCT FROM ROW(OLD.title,OLD.description,OLD.organizer_name,OLD.meeting_point_name,OLD.meeting_point_address,OLD.cover_image_path,OLD.cover_image_url);
   IF NOT trusted AND (NEW.moderation_state IS DISTINCT FROM OLD.moderation_state OR NEW.moderation_version<>OLD.moderation_version) THEN
     RAISE EXCEPTION 'Publication requires staff review' USING ERRCODE='42501';
   END IF;
   IF changed THEN
     NEW.moderation_state:='pending'; NEW.moderation_version:=OLD.moderation_version+1;
   END IF;
 END IF;
 -- Covers may only reference an immutable object belonging to this organiser/ride.
 IF NEW.cover_image_path IS NOT NULL AND (TG_OP='INSERT' OR NEW.cover_image_path IS DISTINCT FROM OLD.cover_image_path) THEN
   IF split_part(NEW.cover_image_path,'/',1) IS DISTINCT FROM NEW.organizer_user_id::text
      OR split_part(NEW.cover_image_path,'/',2) IS DISTINCT FROM NEW.id::text
      OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='community-rides' AND name=NEW.cover_image_path) THEN
     RAISE EXCEPTION 'Invalid private cover' USING ERRCODE='22023';
   END IF;
 END IF;
 -- Never trust a user-supplied URL, including remote images. Clients sign the path.
 NEW.cover_image_url:=NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER community_safety_content_guard BEFORE INSERT OR UPDATE ON public.community_ride
 FOR EACH ROW EXECUTE FUNCTION public.community_safety_content_guard();

CREATE FUNCTION public.report_community_content(p_ride uuid,p_target text,p_reason text,p_description text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.community_ride; existing uuid; result uuid;
BEGIN
 PERFORM public.assert_active_account();
 IF NOT public.community_rider_account_active(auth.uid()) THEN RAISE EXCEPTION 'Rider required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,761));
 IF p_target IS NULL OR p_target NOT IN ('ride','text','image','organiser') OR p_reason IS NULL OR p_reason NOT IN ('harassment','sexual','violence','hate','spam','impersonation','other') OR length(coalesce(p_description,''))>2000 THEN
   RAISE EXCEPTION 'Invalid report' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.community_ride WHERE id=p_ride FOR SHARE;
 SELECT id INTO existing FROM public.community_report WHERE reporter_user_id=auth.uid() AND ride_id=p_ride AND target=p_target
 AND (content_version=c.moderation_version OR c.id IS NULL OR NOT public.community_content_visible(p_ride)) ORDER BY created_at DESC LIMIT 1;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF (SELECT count(*) FROM public.community_report WHERE reporter_user_id=auth.uid() AND created_at>now()-interval '24 hours')>=10 THEN
   RAISE EXCEPTION 'Report limit reached' USING ERRCODE='54000'; END IF;
 IF c.id IS NULL OR NOT public.community_content_visible(p_ride) OR c.organizer_user_id=auth.uid()
 OR (p_target='organiser' AND c.organizer_rider_id IS NULL) OR (p_target='image' AND c.cover_image_path IS NULL) THEN
   RAISE EXCEPTION 'Content unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.community_report(reporter_user_id,ride_id,subject_rider_id,target,reason,description,content_version,evidence)
 VALUES(auth.uid(),c.id,c.organizer_rider_id,p_target,p_reason,coalesce(p_description,''),c.moderation_version,
 jsonb_build_object('title',c.title,'description',c.description,'organizer_name',c.organizer_name,'meeting_point_name',c.meeting_point_name,'meeting_point_address',c.meeting_point_address,'cover_image_path',c.cover_image_path,'moderation_version',c.moderation_version)) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.set_community_block(p_rider uuid,p_blocked boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid; label text;
BEGIN
 PERFORM public.assert_active_account();
 IF NOT public.community_rider_account_active(auth.uid()) THEN RAISE EXCEPTION 'Rider required' USING ERRCODE='42501'; END IF;
 SELECT id INTO me FROM public.rider WHERE user_id=auth.uid();
 IF p_rider IS NULL OR p_rider=me OR p_blocked IS NULL THEN RAISE EXCEPTION 'Invalid rider' USING ERRCODE='22023'; END IF;
 -- Shared serialization with participation. No notifications identify a block.
 PERFORM pg_advisory_xact_lock(hashtextextended(least(me,p_rider)::text||greatest(me,p_rider)::text,762));
 IF NOT p_blocked THEN DELETE FROM public.community_block WHERE blocker_rider_id=me AND blocked_rider_id=p_rider; RETURN; END IF;
 SELECT organizer_name INTO label FROM public.community_ride WHERE organizer_type='rider' AND organizer_rider_id=p_rider AND public.community_content_visible(id) LIMIT 1;
 IF label IS NULL AND NOT EXISTS(SELECT 1 FROM public.community_block WHERE blocker_rider_id=me AND blocked_rider_id=p_rider)
 AND NOT EXISTS(SELECT 1 FROM public.community_ride_participant p WHERE p.rider_id=p_rider AND p.status='joined' AND public.community_content_visible(p.community_ride_id)) THEN
   RAISE EXCEPTION 'Rider unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.community_block(blocker_rider_id,blocked_rider_id,display_name) VALUES(me,p_rider,left(coalesce(label,'Rider'),200)) ON CONFLICT DO NOTHING;
 -- A block does not cancel commitments. Departure/removal uses the existing
 -- explicit authorised workflows; joining guards prevent new interactions.
END $$;
CREATE FUNCTION public.my_community_blocks() RETURNS TABLE(rider_id uuid,display_name text,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.assert_active_account();
 IF NOT public.community_rider_account_active(auth.uid()) THEN RAISE EXCEPTION 'Rider required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT b.blocked_rider_id,b.display_name,b.created_at FROM public.community_block b
 JOIN public.rider r ON r.id=b.blocker_rider_id WHERE r.user_id=auth.uid() ORDER BY b.created_at DESC;
END $$;
CREATE FUNCTION public.community_safety_participation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.community_ride; account uuid;
BEGIN
 IF NEW.status<>'joined' THEN RETURN NEW; END IF;
 SELECT * INTO c FROM public.community_ride WHERE id=NEW.community_ride_id;
 SELECT user_id INTO account FROM public.rider WHERE id=NEW.rider_id;
 IF c.organizer_type='rider' AND c.organizer_rider_id=NEW.rider_id THEN RETURN NEW; END IF;
 IF c.organizer_type='rider' AND c.organizer_rider_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(least(NEW.rider_id,c.organizer_rider_id)::text||greatest(NEW.rider_id,c.organizer_rider_id)::text,762));
 END IF;
 -- Serialize direct writes with publication decisions, in the same pair/ride
 -- lock order as the canonical join RPC. Re-read after acquiring the locks.
 SELECT * INTO c FROM public.community_ride WHERE id=NEW.community_ride_id FOR SHARE;
 IF NOT public.community_rider_account_active(account) OR c.moderation_state<>'approved' OR NOT c.is_public
 OR (c.organizer_type='rider' AND public.community_pair_blocked(NEW.rider_id,c.organizer_rider_id)) THEN
   RAISE EXCEPTION 'Ride unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER community_safety_participation_guard BEFORE INSERT OR UPDATE ON public.community_ride_participant
 FOR EACH ROW EXECUTE FUNCTION public.community_safety_participation_guard();

-- Acquire the pair lock before the join RPC touches a participant row. Keep its
-- canonical identity/capability, account, capacity and lifecycle contract intact.
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('public.join_community_ride(uuid,uuid)'::regprocedure);
 IF body NOT LIKE '%PERFORM public.assert_active_account();%' THEN RAISE EXCEPTION 'Join contract drift'; END IF;
 EXECUTE replace(body,'PERFORM public.assert_active_account();',E'PERFORM public.assert_active_account();\n PERFORM pg_advisory_xact_lock(hashtextextended(least(p_rider_id,c.organizer_rider_id)::text||greatest(p_rider_id,c.organizer_rider_id)::text,762)) FROM public.community_ride c WHERE c.id=p_community_ride_id AND c.organizer_rider_id IS NOT NULL;');
 body:=pg_get_functiondef('public.update_community_ride(uuid,timestamptz,text,text,timestamptz,text,text,integer,numeric,text,text,double precision,double precision,text)'::regprocedure);
 IF body NOT LIKE '%v_ride.title || '' has changed. Check the ride details.''%' THEN RAISE EXCEPTION 'Community notification contract drift'; END IF;
 EXECUTE replace(body,'v_ride.title || '' has changed. Check the ride details.''','''Ride details have changed. They will be available after safety review.''');
END $$;

-- Invite creation and resolution must not expose unpublished or blocked rides.
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('public.create_or_get_community_ride_invite(uuid,uuid,text)'::regprocedure);
 EXECUTE regexp_replace(body,'BEGIN',E'BEGIN\n PERFORM public.assert_active_account();\n IF NOT EXISTS(SELECT 1 FROM public.rider WHERE id=p_rider_id AND user_id=auth.uid() AND public.community_rider_account_active(auth.uid())) OR NOT EXISTS(SELECT 1 FROM public.community_ride c WHERE c.id=p_community_ride_id AND c.moderation_state=''approved'' AND c.is_public AND public.community_content_visible(c.id) AND (c.organizer_type<>''rider'' OR NOT public.community_pair_blocked(p_rider_id,c.organizer_rider_id))) THEN RAISE EXCEPTION ''Ride unavailable'' USING ERRCODE=''42501''; END IF;');
 body:=pg_get_functiondef('public.resolve_invite_code(text)'::regprocedure);
 IF body NOT LIKE '%IF v_invite.id IS NULL THEN%' THEN RAISE EXCEPTION 'Invite resolution contract drift'; END IF;
 EXECUTE replace(body,'IF v_invite.id IS NULL THEN','IF v_invite.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.community_ride c WHERE c.id=v_invite.community_ride_id AND c.moderation_state=''approved'' AND c.is_public AND public.community_content_visible(c.id)) THEN');
END $$;

-- Private immutable covers: restrictive policies also constrain older permissive policies.
UPDATE storage.buckets SET public=false WHERE id='community-rides';
-- Existing owner-only SELECT policies do not grant approved covers to viewers.
-- A restrictive policy alone cannot grant access; add this narrow read grant.
CREATE POLICY community_cover_authorized_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='community-rides' AND EXISTS(SELECT 1 FROM public.community_ride c
 WHERE c.cover_image_path=name AND public.community_content_visible(c.id)));
CREATE POLICY community_cover_read ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(bucket_id<>'community-rides' OR EXISTS(SELECT 1 FROM public.community_ride c WHERE
 (c.cover_image_path=name AND public.community_content_visible(c.id)) OR
 (c.organizer_user_id=auth.uid() AND split_part(name,'/',1)=auth.uid()::text AND split_part(name,'/',2)=c.id::text)));
CREATE POLICY community_cover_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(bucket_id<>'community-rides' OR EXISTS(SELECT 1 FROM public.community_ride c WHERE c.organizer_user_id=auth.uid() AND split_part(name,'/',1)=auth.uid()::text AND split_part(name,'/',2)=c.id::text));
CREATE POLICY community_cover_no_replace ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id<>'community-rides') WITH CHECK(bucket_id<>'community-rides');
CREATE POLICY community_cover_delete_owner ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(bucket_id<>'community-rides' OR split_part(name,'/',1)=auth.uid()::text);
-- Preserve referenced evidence even through service-role cleanup calls.
CREATE FUNCTION public.community_cover_evidence_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.bucket_id='community-rides' AND (TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM public.community_report WHERE evidence->>'cover_image_path'=OLD.name)
 OR EXISTS(SELECT 1 FROM public.community_moderation_audit WHERE evidence->>'cover_image_path'=OLD.name)
 OR EXISTS(SELECT 1 FROM public.community_ride WHERE cover_image_path=OLD.name)) THEN
 RAISE EXCEPTION 'Community evidence is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER community_cover_evidence_guard BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.community_cover_evidence_guard();

CREATE FUNCTION public.moderate_community_content(p_operation uuid,p_actor uuid,p_ride uuid,p_version bigint,p_action text,p_reason text,p_report uuid DEFAULT NULL,p_report_version bigint DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.community_ride; r public.community_report; prior public.community_moderation_audit;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Staff command required' USING ERRCODE='42501'; END IF;
 -- Server action supplies the actor only after canonical session/capability/MFA checks.
 IF p_actor IS NULL OR p_operation IS NULL OR p_action IS NULL OR p_action NOT IN ('approve','restrict','dismiss','remove') OR length(trim(p_reason)) NOT BETWEEN 3 AND 2000 OR p_reason IS NULL THEN
 RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,763));
 SELECT * INTO prior FROM public.community_moderation_audit WHERE operation_id=p_operation;
 IF FOUND THEN
   IF ROW(prior.actor_user_id,prior.ride_id,prior.report_id,prior.action,prior.reason) IS DISTINCT FROM ROW(p_actor,p_ride,p_report,p_action,p_reason) THEN
    RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF; RETURN;
 END IF;
 SELECT * INTO c FROM public.community_ride WHERE id=p_ride FOR UPDATE;
 IF p_report IS NOT NULL THEN
   SELECT * INTO r FROM public.community_report WHERE id=p_report AND ride_id=p_ride FOR UPDATE;
   IF NOT FOUND OR r.status<>'open' OR r.version IS DISTINCT FROM p_report_version THEN RAISE EXCEPTION 'Report changed' USING ERRCODE='40001'; END IF;
 END IF;
 IF p_action IN ('approve','restrict','remove') THEN
   IF c.id IS NULL OR c.moderation_version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Content changed' USING ERRCODE='40001'; END IF;
   IF p_action='approve' AND p_report IS NOT NULL THEN RAISE EXCEPTION 'Resolve reports separately' USING ERRCODE='22023'; END IF;
   UPDATE public.community_ride SET moderation_state=CASE WHEN p_action='approve' THEN 'approved' ELSE 'restricted' END,
     moderation_version=moderation_version+1 WHERE id=p_ride;
 ELSIF p_report IS NULL THEN RAISE EXCEPTION 'Report required' USING ERRCODE='22023'; END IF;
 IF p_report IS NOT NULL THEN UPDATE public.community_report SET status=CASE WHEN p_action='dismiss' THEN 'dismissed' ELSE 'actioned' END,version=version+1 WHERE id=p_report; END IF;
 INSERT INTO public.community_moderation_audit(operation_id,actor_user_id,report_id,ride_id,action,reason,evidence)
 VALUES(p_operation,p_actor,p_report,p_ride,p_action,p_reason,coalesce(r.evidence,
 jsonb_build_object('title',c.title,'description',c.description,'organizer_name',c.organizer_name,'meeting_point_name',c.meeting_point_name,'meeting_point_address',c.meeting_point_address,'cover_image_path',c.cover_image_path,'moderation_version',c.moderation_version)));
END $$;

-- Explicit execution and ownership; helpers are not general rider APIs.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('community_pair_blocked','community_content_visible','community_safety_content_guard','report_community_content','set_community_block','my_community_blocks','community_safety_participation_guard','community_cover_evidence_guard','moderate_community_content') LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.signature);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.community_content_visible(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.report_community_content(uuid,text,text,text),public.set_community_block(uuid,boolean),public.my_community_blocks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_content(uuid,uuid,uuid,bigint,text,text,uuid,bigint) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
