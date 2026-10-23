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

-- Register later-created Safety data with the existing lifecycle authority.
-- Include referenced principals, as the canonical barrier does for other tables;
-- a service claim must never bypass an account deletion fence.
INSERT INTO public.account_deletion_barrier_binding(schema_name,table_name,column_name,identity_kind) VALUES
 ('public','community_block','blocker_rider_id','rider'),
 ('public','community_block','blocked_rider_id','rider'),
 ('public','community_report','reporter_user_id','user'),
 ('public','community_report','subject_rider_id','rider'),
 ('public','community_moderation_audit','actor_user_id','user');
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['community_block','community_report','community_moderation_audit'] LOOP
  EXECUTE format('CREATE TRIGGER zzzz_account_deletion_write_barrier BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.account_deletion_write_barrier()',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER zzzz_account_deletion_write_barrier',t);
  EXECUTE format('CREATE TRIGGER account_deletion_truncate_barrier BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.account_deletion_truncate_barrier()',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER account_deletion_truncate_barrier',t);
 END LOOP;
END $$;

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
   IF EXISTS(SELECT 1 FROM public.community_cover_disposal WHERE path=NEW.cover_image_path) THEN RAISE EXCEPTION 'Cover disposal is pending' USING ERRCODE='42501'; END IF;
   IF split_part(NEW.cover_image_path,'/',1) IS DISTINCT FROM NEW.organizer_user_id::text
      OR split_part(NEW.cover_image_path,'/',2) IS DISTINCT FROM NEW.id::text
      OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='community-rides' AND name=NEW.cover_image_path) THEN
     RAISE EXCEPTION 'Invalid private cover' USING ERRCODE='22023';
   END IF;
 END IF;
 -- Never trust a user-supplied URL. The Platform API authorises private bytes.
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
 -- Check even idempotent/no-op requests before inspecting existing Safety data.
 PERFORM public.account_deletion_assert_writable(auth.uid());
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
 jsonb_strip_nulls(jsonb_build_object('title',CASE WHEN p_target IN ('ride','text') THEN c.title END,'description',CASE WHEN p_target IN ('ride','text') THEN c.description END,'cover_image_path',CASE WHEN p_target='image' THEN c.cover_image_path END,'moderation_version',c.moderation_version))) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.set_community_block(p_rider uuid,p_blocked boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid; label text;
BEGIN
 PERFORM public.assert_active_account();
 PERFORM public.account_deletion_assert_writable(auth.uid());
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
 USING(bucket_id<>'community-rides');
CREATE POLICY community_cover_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(bucket_id<>'community-rides' OR EXISTS(SELECT 1 FROM public.community_ride c WHERE c.organizer_user_id=auth.uid() AND split_part(name,'/',1)=auth.uid()::text AND split_part(name,'/',2)=c.id::text));
CREATE POLICY community_cover_no_replace ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id<>'community-rides') WITH CHECK(bucket_id<>'community-rides');
CREATE POLICY community_cover_delete_owner ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(bucket_id<>'community-rides' OR split_part(name,'/',1)=auth.uid()::text);
-- Preserve referenced evidence even through service-role cleanup calls.
CREATE FUNCTION public.community_cover_evidence_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.bucket_id='community-rides' THEN
  PERFORM 1 FROM public.community_safety_case WHERE id IN(SELECT case_id FROM public.community_cover_disposal WHERE path=OLD.name) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.community_cover_disposal d JOIN public.account_deletion_hold h ON h.community_case_id=d.case_id WHERE d.path=OLD.name AND h.released_at IS NULL) THEN RAISE EXCEPTION 'Community evidence is held' USING ERRCODE='42501'; END IF;
 END IF;
 IF OLD.bucket_id='community-rides' AND (TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM public.community_report WHERE evidence->>'cover_image_path'=OLD.name)
 OR EXISTS(SELECT 1 FROM public.community_moderation_audit WHERE evidence->>'cover_image_path'=OLD.name)
 OR EXISTS(SELECT 1 FROM public.community_ride WHERE cover_image_path=OLD.name)) THEN
 RAISE EXCEPTION 'Community evidence is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER community_cover_evidence_guard BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.community_cover_evidence_guard();

CREATE FUNCTION public.community_cover_orphan_authorized(p_ride uuid,p_path text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.assert_active_account();
 PERFORM public.account_deletion_assert_writable(auth.uid());
 RETURN public.community_rider_account_active(auth.uid()) AND EXISTS(SELECT 1 FROM public.community_ride WHERE id=p_ride AND organizer_user_id=auth.uid())
 AND split_part(p_path,'/',1)=auth.uid()::text AND split_part(p_path,'/',2)=p_ride::text
 AND NOT EXISTS(SELECT 1 FROM public.community_ride WHERE cover_image_path=p_path)
 AND NOT EXISTS(SELECT 1 FROM public.community_report WHERE evidence->>'cover_image_path'=p_path)
 AND NOT EXISTS(SELECT 1 FROM public.community_cover_disposal WHERE path=p_path)
 AND NOT EXISTS(SELECT 1 FROM public.community_moderation_audit WHERE evidence->>'cover_image_path'=p_path);
END $$;
REVOKE ALL ON FUNCTION public.community_cover_orphan_authorized(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.community_cover_orphan_authorized(uuid,text) TO authenticated;

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
 jsonb_build_object('title',c.title,'description',c.description,'cover_image_path',c.cover_image_path,'moderation_version',c.moderation_version)));
END $$;

-- Safety lifecycle: clocks and controls, not approval or worker activation.
ALTER TABLE public.community_report ADD COLUMN resolved_at timestamptz;
CREATE TABLE public.community_safety_case (
 id uuid PRIMARY KEY, report_id uuid, ride_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), first_review_at timestamptz,
 urgency text NOT NULL DEFAULT 'routine' CHECK(urgency IN ('routine','urgent')),
 closed_at timestamptz, closed_by uuid, reopened_at timestamptz,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE public.community_safety_event (
 operation_id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES public.community_safety_case,
 actor_user_id uuid NOT NULL, action text NOT NULL, reason text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- Extend the existing hold authority; never manufacture deletion jobs for Safety.
ALTER TABLE public.account_deletion_hold ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE public.account_deletion_hold ADD COLUMN community_case_id uuid REFERENCES public.community_safety_case;
ALTER TABLE public.account_deletion_hold ADD CHECK(num_nonnulls(job_id,community_case_id)=1);
CREATE TABLE public.community_cover_disposal (
 path text PRIMARY KEY, case_id uuid NOT NULL, operation_id uuid NOT NULL, lease_until timestamptz,
 confirmed_at timestamptz, attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE public.community_safety_disposal_receipt (
 operation_id uuid PRIMARY KEY, case_digest text NOT NULL, policy_version integer NOT NULL,
 counts jsonb NOT NULL, completed_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['community_safety_case','community_safety_event','community_cover_disposal','community_safety_disposal_receipt'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO postgres',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER zzzz_account_deletion_write_barrier BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.account_deletion_write_barrier()',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER zzzz_account_deletion_write_barrier',t);
  EXECUTE format('CREATE TRIGGER account_deletion_truncate_barrier BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.account_deletion_truncate_barrier()',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER account_deletion_truncate_barrier',t);
 END LOOP;
END $$;
GRANT SELECT ON public.community_safety_case,public.community_safety_event TO service_role;
INSERT INTO public.account_deletion_barrier_binding VALUES
 ('public','community_safety_case','closed_by','user'),
 ('public','community_safety_event','actor_user_id','user');
INSERT INTO public.account_deletion_barrier_parent(table_name,column_name,parent_table) VALUES
 ('community_safety_case','report_id','community_report'),
 ('community_safety_event','case_id','community_safety_case');

CREATE FUNCTION public.community_safety_clock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='community_report' THEN
  IF TG_OP='INSERT' THEN
   INSERT INTO public.community_safety_case(id,report_id,ride_id) VALUES(NEW.id,NEW.id,NEW.ride_id);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
   IF OLD.status<>'open' OR NEW.status='open' THEN RAISE EXCEPTION 'Final report outcome is immutable' USING ERRCODE='40001'; END IF;
   NEW.resolved_at:=clock_timestamp();
  ELSIF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN RAISE EXCEPTION 'Resolution clock is immutable' USING ERRCODE='42501';
  END IF;
 ELSE
  INSERT INTO public.community_safety_case(id,report_id,ride_id,first_review_at)
   VALUES(coalesce(NEW.report_id,NEW.operation_id),NEW.report_id,NEW.ride_id,clock_timestamp()) ON CONFLICT DO NOTHING;
  UPDATE public.community_safety_case SET first_review_at=coalesce(first_review_at,clock_timestamp()) WHERE id=coalesce(NEW.report_id,NEW.operation_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER community_report_clock BEFORE INSERT OR UPDATE ON public.community_report FOR EACH ROW EXECUTE FUNCTION public.community_safety_clock();
CREATE TRIGGER community_decision_case BEFORE INSERT ON public.community_moderation_audit FOR EACH ROW EXECUTE FUNCTION public.community_safety_clock();

CREATE FUNCTION public.community_safety_policy(p_policy integer,p_category text,p_period interval,p_fields text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.account_deletion_retention_rule;
BEGIN
 SELECT * INTO r FROM public.account_deletion_retention_rule WHERE policy_version=p_policy AND category=p_category;
 IF p_policy IS DISTINCT FROM (SELECT active_policy_version FROM public.account_deletion_contract_gate WHERE singleton)
 OR r.start_event IS DISTINCT FROM (CASE p_category WHEN 'community_reports' THEN 'report_resolution' WHEN 'community_moderation' THEN 'case_closure' WHEN 'community_disposal_receipt' THEN 'disposal_completed' END)
 OR r.approval_status IS DISTINCT FROM 'approved' OR nullif(trim(r.approval_reference),'') IS NULL
 OR nullif(trim(r.lawful_basis),'') IS NULL OR r.period IS NULL OR r.period<=interval '0'
 OR (p_period IS NOT NULL AND r.period<>p_period) OR NOT p_fields <@ r.minimum_fields
 THEN RAISE EXCEPTION 'Safety privacy approval and field allowlist required' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION public.community_safety_hold_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;
BEGIN
 c:=CASE WHEN TG_OP='DELETE' THEN OLD.community_case_id ELSE NEW.community_case_id END;
 IF TG_OP='UPDATE' AND NEW.community_case_id IS DISTINCT FROM OLD.community_case_id THEN RAISE EXCEPTION 'Hold scope is immutable'; END IF;
 IF c IS NOT NULL THEN PERFORM 1 FROM public.community_safety_case WHERE id=c FOR UPDATE; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER community_safety_hold_lock BEFORE INSERT OR UPDATE OR DELETE ON public.account_deletion_hold FOR EACH ROW EXECUTE FUNCTION public.community_safety_hold_lock();

CREATE FUNCTION public.command_community_safety_case(p_operation uuid,p_actor uuid,p_case uuid,p_version bigint,p_action text,p_reason text,p_hold uuid DEFAULT NULL,p_authority text DEFAULT NULL,p_review timestamptz DEFAULT NULL,p_policy integer DEFAULT NULL,p_retain boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.community_safety_case; prior public.community_safety_event; payload jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor IS NULL THEN RAISE EXCEPTION 'Staff command required' USING ERRCODE='42501'; END IF;
 PERFORM public.account_deletion_assert_writable(p_actor);
 IF p_operation IS NULL OR p_case IS NULL OR p_action IS NULL OR p_reason IS NULL OR p_action NOT IN ('triage_urgent','triage_routine','close','reopen','hold','release') OR length(trim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Invalid case command' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('hold',p_hold,'authority',p_authority,'review',p_review,'policy',p_policy,'retain',p_retain);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,764));
 SELECT * INTO prior FROM public.community_safety_event WHERE operation_id=p_operation;
 IF FOUND THEN
  IF ROW(prior.case_id,prior.actor_user_id,prior.action,prior.reason,prior.payload) IS DISTINCT FROM ROW(p_case,p_actor,p_action,p_reason,payload) THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN;
 END IF;
 SELECT * INTO c FROM public.community_safety_case WHERE id=p_case FOR UPDATE;
 IF NOT FOUND OR c.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Case changed' USING ERRCODE='40001'; END IF;
 IF p_action='close' THEN
  IF (c.closed_at IS NOT NULL AND c.reopened_at IS NULL) OR EXISTS(SELECT 1 FROM public.community_report WHERE id=c.report_id AND status='open') THEN RAISE EXCEPTION 'Resolve the report before closure' USING ERRCODE='40001'; END IF;
  IF p_retain THEN
   PERFORM public.community_safety_policy(p_policy,'community_moderation',interval '24 months',ARRAY['case_id','decision','reviewer','timestamps'] || ARRAY(
    SELECT DISTINCT 'evidence.'||k FROM public.community_moderation_audit a CROSS JOIN LATERAL jsonb_object_keys(a.evidence) k WHERE a.case_id=p_case));
  ELSE
   IF EXISTS(SELECT 1 FROM public.account_deletion_hold WHERE community_case_id=p_case AND released_at IS NULL) THEN RAISE EXCEPTION 'Held evidence requires approved preservation before closure' USING ERRCODE='42501'; END IF;
   -- No default retained content archive. Required decision metadata stays separate.
   INSERT INTO public.community_cover_disposal(path,case_id,operation_id)
   SELECT DISTINCT evidence->>'cover_image_path',p_case,p_operation FROM public.community_moderation_audit WHERE case_id=p_case AND evidence->>'cover_image_path' IS NOT NULL ON CONFLICT DO NOTHING;
   UPDATE public.community_moderation_audit SET evidence='{}' WHERE case_id=p_case;
  END IF;
  UPDATE public.community_safety_case SET closed_at=coalesce(closed_at,clock_timestamp()),closed_by=coalesce(closed_by,p_actor),reopened_at=NULL WHERE id=p_case;
 ELSIF p_action='reopen' THEN
  IF c.closed_at IS NULL THEN RAISE EXCEPTION 'Case is already open' USING ERRCODE='40001'; END IF;
  -- Keep the original expiry clock; reopening never creates a retention extension.
  UPDATE public.community_safety_case SET reopened_at=clock_timestamp() WHERE id=p_case;
 ELSIF p_action='hold' THEN
  IF p_hold IS NULL OR nullif(trim(p_authority),'') IS NULL OR p_review IS NULL OR p_review<=clock_timestamp() THEN RAISE EXCEPTION 'Explicit hold authority and review required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.account_deletion_hold(id,community_case_id,category,authority_reference,owner_capability,review_due_at)
   VALUES(p_hold,p_case,'community_safety',p_authority,'privacy.deletion.compliance.review',p_review);
 ELSIF p_action='release' THEN
  UPDATE public.account_deletion_hold SET released_at=clock_timestamp() WHERE id=p_hold AND community_case_id=p_case AND released_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active scoped hold required' USING ERRCODE='40001'; END IF;
 ELSE
  UPDATE public.community_safety_case SET first_review_at=coalesce(first_review_at,clock_timestamp()),urgency=CASE p_action WHEN 'triage_urgent' THEN 'urgent' ELSE 'routine' END WHERE id=p_case;
 END IF;
 UPDATE public.community_safety_case SET version=version+1 WHERE id=p_case;
 INSERT INTO public.community_safety_event(operation_id,case_id,actor_user_id,action,reason,payload) VALUES(p_operation,p_case,p_actor,p_action,p_reason,payload);
END $$;

CREATE FUNCTION public.dispose_community_safety(p_operation uuid,p_case uuid,p_policy integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.community_safety_case; r public.community_report; prior public.community_safety_disposal_receipt; paths text[]; n integer:=0; m integer:=0; receipt_rule public.account_deletion_retention_rule;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_operation IS NULL THEN RAISE EXCEPTION 'Controlled worker required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,765));
 SELECT * INTO prior FROM public.community_safety_disposal_receipt WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.case_digest<>encode(sha256(convert_to(p_case::text,'UTF8')),'hex') OR prior.policy_version<>p_policy THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN prior.counts;
 END IF;
 PERFORM public.community_safety_policy(p_policy,'community_reports',interval '12 months',ARRAY['case_id','category','timestamps','outcome'] || ARRAY(
  SELECT DISTINCT field FROM public.community_report rep JOIN public.community_safety_case scase ON scase.report_id=rep.id CROSS JOIN LATERAL (
   SELECT 'reporter_reference' field WHERE rep.reporter_user_id IS NOT NULL
   UNION SELECT 'subject_reference' WHERE rep.subject_rider_id IS NOT NULL
   UNION SELECT 'description' WHERE rep.description<>''
   UNION SELECT 'evidence.'||k FROM jsonb_object_keys(rep.evidence) k
  ) fields WHERE scase.id=p_case));
 PERFORM public.community_safety_policy(p_policy,'community_moderation',interval '24 months',ARRAY['case_id','decision','reviewer','timestamps'] || ARRAY(
  SELECT DISTINCT 'evidence.'||k FROM public.community_moderation_audit a CROSS JOIN LATERAL jsonb_object_keys(a.evidence) k WHERE a.case_id=p_case));
 -- A receipt's finite period and minimal allowlist must be approved too. No TTL invented.
 PERFORM public.community_safety_policy(p_policy,'community_disposal_receipt',NULL,ARRAY['operation_id','case_digest','counts','completed_at']);
 SELECT * INTO receipt_rule FROM public.account_deletion_retention_rule WHERE policy_version=p_policy AND category='community_disposal_receipt';
 SELECT * INTO c FROM public.community_safety_case WHERE id=p_case FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','absent'); END IF;
 SELECT * INTO r FROM public.community_report WHERE id=c.report_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.account_deletion_hold WHERE community_case_id=p_case AND released_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.account_deletion_hold h JOIN public.account_deletion_jobs j ON j.id=h.job_id WHERE h.released_at IS NULL AND h.category IN ('all','community_safety','community_reports','community_moderation') AND
 (j.user_id=ANY(public.account_deletion_row_subjects('public','community_report',coalesce(to_jsonb(r),'{}'))) OR j.user_id=c.closed_by
 OR EXISTS(SELECT 1 FROM public.community_moderation_audit a WHERE a.case_id=p_case AND a.actor_user_id=j.user_id)
 OR EXISTS(SELECT 1 FROM public.community_safety_event e WHERE e.case_id=p_case AND e.actor_user_id=j.user_id))) THEN RETURN jsonb_build_object('state','held'); END IF;
 SELECT coalesce(array_agg(DISTINCT path),'{}') INTO paths FROM (
  SELECT evidence->>'cover_image_path' path FROM public.community_report WHERE id=c.report_id
  UNION SELECT evidence->>'cover_image_path' FROM public.community_moderation_audit WHERE case_id=p_case
  UNION SELECT path FROM public.community_cover_disposal WHERE case_id=p_case AND confirmed_at IS NULL
 ) x WHERE path IS NOT NULL;
 IF r.resolved_at IS NOT NULL AND r.resolved_at+interval '12 months'<=clock_timestamp() THEN
  UPDATE public.community_moderation_audit SET report_id=NULL WHERE report_id=r.id;
  -- Keep the audit-to-case link after report expiry through an explicit case_id.
  UPDATE public.community_safety_case SET report_id=NULL WHERE id=p_case;
  DELETE FROM public.community_report WHERE id=r.id; GET DIAGNOSTICS n=ROW_COUNT;
 END IF;
 IF c.closed_at IS NOT NULL AND c.closed_at+interval '24 months'<=clock_timestamp() THEN
  -- Reopening does not extend the clock. A separately authorised hold is the
  -- only way to preserve necessary evidence beyond the approved deadline.
  DELETE FROM public.community_moderation_audit WHERE case_id=p_case; GET DIAGNOSTICS m=ROW_COUNT;
  DELETE FROM public.account_deletion_hold WHERE community_case_id=p_case AND released_at IS NOT NULL;
  DELETE FROM public.community_safety_event WHERE case_id=p_case;
  DELETE FROM public.community_safety_case WHERE id=p_case;
 END IF;
 SELECT coalesce(array_agg(p),'{}') INTO paths FROM unnest(paths) p WHERE NOT EXISTS(SELECT 1 FROM public.community_ride WHERE cover_image_path=p)
 AND NOT EXISTS(SELECT 1 FROM public.community_report WHERE evidence->>'cover_image_path'=p)
 AND NOT EXISTS(SELECT 1 FROM public.community_moderation_audit WHERE evidence->>'cover_image_path'=p);
 IF n=0 AND m=0 AND cardinality(paths)=0 THEN RETURN jsonb_build_object('state','not_due'); END IF;
 INSERT INTO public.community_cover_disposal(path,case_id,operation_id)
 SELECT p,p_case,p_operation FROM unnest(paths) p ON CONFLICT(path) DO UPDATE SET operation_id=excluded.operation_id WHERE public.community_cover_disposal.confirmed_at IS NULL AND (public.community_cover_disposal.lease_until IS NULL OR public.community_cover_disposal.lease_until<clock_timestamp());
 INSERT INTO public.community_safety_disposal_receipt(operation_id,case_digest,policy_version,counts,expires_at)
 VALUES(p_operation,encode(sha256(convert_to(p_case::text,'UTF8')),'hex'),p_policy,jsonb_build_object('reports',n,'decisions',m),clock_timestamp()+receipt_rule.period);
 RETURN jsonb_build_object('reports',n,'decisions',m);
END $$;
ALTER TABLE public.community_moderation_audit ADD COLUMN case_id uuid;
-- The trigger always binds the audit to the canonical case before insertion.
CREATE FUNCTION public.community_safety_bind_audit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.case_id:=coalesce(NEW.report_id,NEW.operation_id);RETURN NEW;END $$;
CREATE TRIGGER community_safety_bind_audit BEFORE INSERT ON public.community_moderation_audit FOR EACH ROW EXECUTE FUNCTION public.community_safety_bind_audit();

CREATE FUNCTION public.my_community_safety_export() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reports jsonb; blocks jsonb;
BEGIN
 PERFORM public.assert_active_account();
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'target',target,'category',reason,'createdAt',created_at,'status',status,'resolvedAt',resolved_at)),'[]') INTO reports FROM public.community_report WHERE reporter_user_id=auth.uid();
 SELECT coalesce(jsonb_agg(jsonb_build_object('riderId',b.blocked_rider_id,'createdAt',b.created_at)),'[]') INTO blocks FROM public.community_block b JOIN public.rider r ON r.id=b.blocker_rider_id WHERE r.user_id=auth.uid();
 RETURN jsonb_build_object('reports',reports,'blocks',blocks,'restrictedEvidenceReview','privacy@movrr.nl');
END $$;
CREATE FUNCTION public.community_safety_deletion_inventory(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Privacy review required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('reports',(SELECT coalesce(jsonb_agg(id),'[]') FROM public.community_report WHERE reporter_user_id=p_user OR subject_rider_id IN(SELECT id FROM public.rider WHERE user_id=p_user)),
 'decisions',(SELECT coalesce(jsonb_agg(id),'[]') FROM public.community_moderation_audit WHERE actor_user_id=p_user),
 'blocks',(SELECT coalesce(jsonb_agg(jsonb_build_object('blocker',blocker_rider_id,'blocked',blocked_rider_id)),'[]') FROM public.community_block WHERE blocker_rider_id IN(SELECT id FROM public.rider WHERE user_id=p_user) OR blocked_rider_id IN(SELECT id FROM public.rider WHERE user_id=p_user)),
 'cases',(SELECT coalesce(jsonb_agg(c.id),'[]') FROM public.community_safety_case c WHERE c.closed_by=p_user OR EXISTS(SELECT 1 FROM public.community_safety_event e WHERE e.case_id=c.id AND e.actor_user_id=p_user)),
 'disposition','canonical_manifest_and_retention_approval_required');
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('community_safety_clock','community_safety_policy','community_safety_hold_lock','command_community_safety_case','dispose_community_safety','community_safety_bind_audit','my_community_safety_export','community_safety_deletion_inventory') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.command_community_safety_case(uuid,uuid,uuid,bigint,text,text,uuid,text,timestamptz,integer,boolean),public.dispose_community_safety(uuid,uuid,integer),public.community_safety_deletion_inventory(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_community_safety_export() TO authenticated;


-- Object work is claim/recheck/Storage API/confirm, never metadata-only erasure.
CREATE FUNCTION public.claim_community_cover_disposal(p_operation uuid) RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE task public.community_cover_disposal; receipt public.community_safety_disposal_receipt;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Controlled worker required' USING ERRCODE='42501'; END IF;
 SELECT * INTO receipt FROM public.community_safety_disposal_receipt WHERE operation_id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved disposal receipt required' USING ERRCODE='42501'; END IF;
 PERFORM public.community_safety_policy(receipt.policy_version,'community_disposal_receipt',NULL,ARRAY['operation_id','case_digest','counts','completed_at']);
 FOR task IN SELECT * FROM public.community_cover_disposal WHERE operation_id=p_operation AND confirmed_at IS NULL AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY path FOR UPDATE SKIP LOCKED LOOP
  IF NOT EXISTS(SELECT 1 FROM public.community_ride WHERE cover_image_path=task.path)
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_hold WHERE community_case_id=task.case_id AND released_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM public.community_report WHERE evidence->>'cover_image_path'=task.path)
  AND NOT EXISTS(SELECT 1 FROM public.community_moderation_audit WHERE evidence->>'cover_image_path'=task.path) THEN
   UPDATE public.community_cover_disposal SET attempts=attempts+1,lease_until=clock_timestamp()+interval '2 minutes' WHERE path=task.path;
   RETURN NEXT task.path;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.confirm_community_cover_disposal(p_operation uuid,p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Controlled worker required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='community-rides' AND name=p_path) THEN RAISE EXCEPTION 'Object deletion not confirmed' USING ERRCODE='40001'; END IF;
 UPDATE public.community_cover_disposal SET confirmed_at=coalesce(confirmed_at,clock_timestamp()),lease_until=NULL WHERE operation_id=p_operation AND path=p_path;
 IF NOT FOUND THEN RAISE EXCEPTION 'Disposal task unavailable' USING ERRCODE='40001'; END IF;
END $$;
CREATE FUNCTION public.expire_community_safety_receipts(p_policy integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Controlled worker required' USING ERRCODE='42501'; END IF;
 PERFORM public.community_safety_policy(p_policy,'community_disposal_receipt',NULL,ARRAY['operation_id','case_digest','counts','completed_at']);
 DELETE FROM public.community_cover_disposal t USING public.community_safety_disposal_receipt r WHERE t.operation_id=r.operation_id AND r.policy_version=p_policy AND r.expires_at<=clock_timestamp() AND t.confirmed_at IS NOT NULL;
 DELETE FROM public.community_safety_disposal_receipt r WHERE policy_version=p_policy AND expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM public.community_cover_disposal t WHERE t.operation_id=r.operation_id);
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.claim_community_cover_disposal(uuid),public.confirm_community_cover_disposal(uuid,text),public.expire_community_safety_receipts(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_community_cover_disposal(uuid),public.confirm_community_cover_disposal(uuid,text),public.expire_community_safety_receipts(integer) TO service_role;


CREATE FUNCTION public.community_safety_case_holds(p_cases uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR cardinality(p_cases)>100 THEN RAISE EXCEPTION 'Staff review required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'caseId',community_case_id,'reviewDueAt',review_due_at)),'[]') FROM public.account_deletion_hold WHERE community_case_id=ANY(p_cases) AND released_at IS NULL);
END $$;
CREATE FUNCTION public.community_safety_disposal_status(p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Controlled worker required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('remaining',(SELECT count(*) FROM public.community_cover_disposal WHERE operation_id=p_operation AND confirmed_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION public.community_safety_case_holds(uuid[]),public.community_safety_disposal_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.community_safety_case_holds(uuid[]),public.community_safety_disposal_status(uuid) TO service_role;


CREATE FUNCTION public.prepare_account_deletion_community_safety(p_job uuid,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.account_deletion_jobs; inventory jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Privacy worker required' USING ERRCODE='42501'; END IF;
 j:=public.account_deletion_assert_claim(p_job,p_token);
 inventory:=public.community_safety_deletion_inventory(j.user_id);
 IF jsonb_array_length(inventory->'reports')=0 AND jsonb_array_length(inventory->'decisions')=0 AND jsonb_array_length(inventory->'blocks')=0 AND jsonb_array_length(inventory->'cases')=0 THEN
  RETURN jsonb_build_object('state','confirmed','completionAuthorized',false);
 END IF;
 -- A retained copy or a destructive projection requires the approved exact
 -- canonical manifest. Never convert this inventory into an evidence archive.
 INSERT INTO public.account_deletion_review(job_id,category,reason_code,owner_capability,due_at)
 VALUES(j.id,'community_safety','approved_safety_disposition_required','privacy.deletion.compliance.review',clock_timestamp()) ON CONFLICT DO NOTHING;
 INSERT INTO public.account_deletion_audit(job_id,event_code) VALUES(j.id,'community_safety_disposition_review_required');
 RETURN jsonb_build_object('state','review','completionAuthorized',false);
END $$;
REVOKE ALL ON FUNCTION public.prepare_account_deletion_community_safety(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion_community_safety(uuid,uuid) TO service_role;

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
