-- Additive operating control and independent-verification corrections.
-- Requires 051/053. Never enables redemption or changes financial records.
BEGIN;
DO $$ DECLARE expected record; actual text; BEGIN
 FOR expected IN SELECT * FROM (VALUES
 ('shop_redeem','dec5627bf23523686816677aade6dc76cb34964f50fd8841acbd02b98659c49a'),
 ('shop_catalog','fad8cd48ec4f2e4394221ef8a31c5842c0e31f4421045dc4618014b4dff83b3e'),
 ('shop_recover','1a10863de0e55933434ee55d4918a2026da1c27f24d6e268ec45b0f68b83d972'),
 ('shop_claim_outbox','4c818a43b3bf3e9e808969454389b1d1c4d83a404366cf8a15c018f230b8f3fa'),
 ('shop_fulfilment_command','706a6d8764ed02e6b5f8e6174519ff723df6649f45a0b317f4e5917de1b866cf'),
 ('shop_cancel_legacy_reservation','6c048dc4bd505c8157e0f879b6679f95fb89f87df258e281e34e816d8daf998b'),
 ('shop_health','7c1828b29b231c89299c00c80f81ad59983f8c959b035a55551275931a1c28ff'),
 ('shop_save_catalog','e36b0b966b599ae65d582c72cb22ff4a24f9d7b2aaef7232d2f4dc44262c6a0d'),
 ('shop_import_codes','e283f4b20f8e4928c6b310fc460f03b4ed864e00cc2089a07ad9da1617b36231'),
 ('allocate_reward_resource','0e62664733e6f498001096f82e015bdf1ebc26860370810560cd755bdee5a18c')
 ) v(name,digest) LOOP
  SELECT encode(sha256(convert_to(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \n\r\t'),'UTF8')),'hex') INTO actual
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=expected.name;
  IF actual IS DISTINCT FROM expected.digest THEN RAISE EXCEPTION 'Review changed Shop contract before migration: %',expected.name; END IF;
 END LOOP;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.shop_release_control WHERE singleton AND NOT redemption_enabled) THEN
  RAISE EXCEPTION 'Disable public redemption before installing operating control';
 END IF;
END $$;
ALTER TABLE public.shop_release_control
 ADD state text NOT NULL DEFAULT 'disabled' CHECK(state IN ('enabled','disabled','hold')),
 ADD version bigint NOT NULL DEFAULT 0,
 ADD changed_by uuid,
 ADD containment_at timestamptz;
UPDATE public.shop_release_control SET containment_at=changed_at;
ALTER TABLE public.shop_release_control ALTER COLUMN containment_at SET NOT NULL;
-- This generated projection is required by the currently deployed catalog API.
-- It cannot be independently written; state is the only operating authority.
ALTER TABLE public.shop_release_control DROP COLUMN redemption_enabled;
ALTER TABLE public.shop_release_control ADD redemption_enabled boolean GENERATED ALWAYS AS (state='enabled') STORED;

CREATE TABLE public.shop_readiness_evidence (
 criterion text PRIMARY KEY CHECK(criterion ~ '^f([1-9]|1[0-3])$' OR criterion IN ('digital','qr','supply','integration','device','provider','web')),
 passed boolean NOT NULL,
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 10 AND 2000),
 revision text NOT NULL CHECK(revision ~ '^[a-f0-9]{40}$'),
 checked_by uuid NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 valid_until timestamptz NOT NULL,
 version bigint NOT NULL DEFAULT 1
);
CREATE TABLE public.shop_worker_health(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),finished_at timestamptz NOT NULL,result jsonb NOT NULL);
ALTER TABLE public.shop_readiness_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_worker_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_readiness_evidence,public.shop_worker_health FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.shop_outbox ADD revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.shop_recovery ADD revision bigint NOT NULL DEFAULT 0;
CREATE FUNCTION public.shop_bump_queue_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN NEW.revision:=OLD.revision+1;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.shop_bump_queue_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER shop_outbox_revision BEFORE UPDATE ON public.shop_outbox FOR EACH ROW EXECUTE FUNCTION public.shop_bump_queue_revision();
CREATE TRIGGER shop_recovery_revision BEFORE UPDATE ON public.shop_recovery FOR EACH ROW EXECUTE FUNCTION public.shop_bump_queue_revision();
CREATE INDEX shop_item_code_lookup ON public.fulfilment_resource_item(external_code_hash);
CREATE FUNCTION public.shop_voucher_available(p_item uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record; code_hash text; BEGIN
 SELECT i.id,i.status,i.external_code_hash,i.display_payload,r.partner_org_id,r.status pool_status,r.resource_kind INTO v
 FROM fulfilment_resource_item i JOIN fulfilment_resource r ON r.id=i.resource_id WHERE i.id=p_item;
 IF NOT FOUND OR v.status IS DISTINCT FROM 'available' OR v.pool_status IS DISTINCT FROM 'active' OR v.resource_kind IS DISTINCT FROM 'voucher_pool' OR nullif(trim(v.display_payload->>'code'),'') IS NULL OR (v.display_payload->>'expiresAt')::timestamptz<=now() THEN RETURN false; END IF;
 code_hash:=coalesce(v.external_code_hash,encode(sha256(convert_to(trim(v.display_payload->>'code'),'UTF8')),'hex'));
 RETURN NOT EXISTS(SELECT 1 FROM fulfilment_resource_item other JOIN fulfilment_resource pool ON pool.id=other.resource_id
  WHERE other.id<>v.id AND pool.partner_org_id IS NOT DISTINCT FROM v.partner_org_id AND
  (other.external_code_hash=code_hash OR (other.external_code_hash IS NULL AND encode(sha256(convert_to(trim(other.display_payload->>'code'),'UTF8')),'hex')=code_hash)));
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;
CREATE FUNCTION public.shop_resource_available_count(p_resource uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT count(*)::integer FROM fulfilment_resource_item WHERE resource_id=p_resource AND shop_voucher_available(id)
$$;
REVOKE ALL ON FUNCTION public.shop_voucher_available(uuid),public.shop_resource_available_count(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.shop_resource_available_count(uuid) TO service_role;

CREATE FUNCTION public.shop_require_controller(p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM admin_users WHERE user_id=p_actor AND role IN ('super_admin','security_admin')) THEN
  RAISE EXCEPTION 'Security administrator required' USING ERRCODE='42501';
 END IF;
END $$;

CREATE FUNCTION public.shop_readiness(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE missing jsonb; health jsonb; scheduler jsonb; worker jsonb; inventory boolean; BEGIN
 PERFORM shop_require_controller(p_actor);
 SELECT coalesce(jsonb_agg(k ORDER BY k),'[]'::jsonb) INTO missing FROM
 (SELECT 'f'||generate_series(1,13) k UNION ALL SELECT unnest(ARRAY['digital','qr','supply','integration','device','provider','web'])) required
 WHERE NOT EXISTS(SELECT 1 FROM shop_readiness_evidence e WHERE e.criterion=k AND e.passed AND e.valid_until>now());
 health:=shop_health(p_actor);
 scheduler:=shop_scheduler_health(p_actor);
 SELECT result||jsonb_build_object('finishedAt',finished_at,'fresh',finished_at>now()-interval '10 minutes') INTO worker FROM shop_worker_health WHERE singleton;
 SELECT count(DISTINCT c->>'fulfilment_type')=2 INTO inventory FROM shop_catalog(p_actor) c WHERE (c->>'available')::boolean;
 RETURN jsonb_build_object('missingEvidence',missing,'financial',health,'scheduler',scheduler,'worker',worker,'inventoryReady',inventory,
 'ready',jsonb_array_length(missing)=0 AND inventory AND
 coalesce((health->>'walletMismatches')::integer=0 AND (health->>'unpairedPaidClaims')::integer=0 AND (health->>'freeFinancialEntries')::integer=0 AND (health->>'recoveryFailures')::integer=0 AND (health->>'deliveryFailures')::integer=0 AND (health->>'overdue')::integer=0,false) AND
 coalesce((scheduler->>'active')::boolean AND (scheduler->>'httpStatus')::integer=200 AND (scheduler->>'lastDispatchAt')::timestamptz>now()-interval '10 minutes',false) AND
 coalesce((worker->>'fresh')::boolean AND (worker->>'failed')::integer=0 AND (worker->>'notificationFailures')::integer=0,false));
END $$;

CREATE FUNCTION public.shop_operating_status(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM shop_authorize(p_actor,'read');
 RETURN (SELECT to_jsonb(s)||jsonb_build_object('canManage',EXISTS(SELECT 1 FROM admin_users WHERE user_id=p_actor AND role IN ('super_admin','security_admin')),
 'evidence',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY criterion) FROM shop_readiness_evidence e),'[]'::jsonb)) FROM shop_release_control s WHERE singleton);
END $$;

CREATE FUNCTION public.shop_record_readiness(p_actor uuid,p_criterion text,p_passed boolean,p_reference text,p_revision text,p_valid_until timestamptz,p_expected bigint,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old shop_readiness_evidence; result jsonb; prior jsonb; fingerprint text; operating shop_release_control; BEGIN
 PERFORM shop_require_controller(p_actor);
 IF nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 OR p_valid_until IS NULL OR p_valid_until<=now() OR p_valid_until>now()+interval '30 days' THEN RAISE EXCEPTION 'Evidence identity and future validity (maximum 30 days) required' USING ERRCODE='22023'; END IF;
 -- Serialize evidence changes with enable/disable and in-flight purchases.
 SELECT * INTO operating FROM shop_release_control WHERE singleton FOR UPDATE;
 fingerprint:=jsonb_build_array(p_criterion,p_passed,p_reference,p_revision,p_valid_until,p_expected)::text;
 SELECT payload INTO prior FROM platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.evidence.v1' AND key=p_operation;
 IF FOUND THEN IF prior->>'fingerprint' IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF; RETURN prior; END IF;
 SELECT * INTO old FROM shop_readiness_evidence WHERE criterion=p_criterion FOR UPDATE;
 IF coalesce(old.version,0) IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Evidence changed; refresh' USING ERRCODE='40001'; END IF;
 INSERT INTO shop_readiness_evidence(criterion,passed,reference,revision,checked_by,valid_until,version)
 VALUES(p_criterion,p_passed,p_reference,p_revision,p_actor,p_valid_until,coalesce(old.version,0)+1)
 ON CONFLICT(criterion) DO UPDATE SET passed=EXCLUDED.passed,reference=EXCLUDED.reference,revision=EXCLUDED.revision,checked_by=EXCLUDED.checked_by,checked_at=now(),valid_until=EXCLUDED.valid_until,version=EXCLUDED.version;
 result:=jsonb_build_object('criterion',p_criterion,'version',coalesce(old.version,0)+1,'fingerprint',fingerprint);
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','settings.security','shop_readiness_evidence',p_criterion,to_jsonb(old),(SELECT to_jsonb(e) FROM shop_readiness_evidence e WHERE criterion=p_criterion),p_operation,p_reference);
 INSERT INTO platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.evidence.v1',p_operation,result);
 -- Revocation is an immediate durable hold, never an implicit re-enable.
 IF NOT p_passed THEN
  UPDATE shop_release_control SET state='hold',version=version+1,changed_at=now(),changed_by=p_actor,reason='Readiness revoked: '||p_criterion WHERE singleton AND state<>'hold';
  IF FOUND THEN
   INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
   VALUES(p_actor,'admin','settings.security','shop_release_control','global',to_jsonb(operating),(SELECT to_jsonb(s) FROM shop_release_control s WHERE singleton),p_operation,'Readiness revoked: '||p_criterion);
  END IF;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.shop_set_operating_state(p_actor uuid,p_state text,p_expected bigint,p_reason text,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old shop_release_control; prior jsonb; result jsonb; BEGIN
 PERFORM shop_require_controller(p_actor);
 IF p_state IS NULL OR p_state NOT IN ('enabled','disabled','hold') OR p_expected IS NULL OR nullif(trim(p_reason),'') IS NULL OR length(p_reason)>1000 OR nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 THEN RAISE EXCEPTION 'State, version, reason and operation required' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT old FROM shop_release_control WHERE singleton FOR UPDATE;
 SELECT payload INTO prior FROM platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.operating.v1' AND key=p_operation;
 IF FOUND THEN
  IF prior->>'state' IS DISTINCT FROM p_state OR prior->>'reason' IS DISTINCT FROM p_reason OR (prior->>'expectedVersion')::bigint IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF;
  RETURN prior;
 END IF;
 IF old.version<>p_expected THEN RAISE EXCEPTION 'Operating state changed; refresh' USING ERRCODE='40001'; END IF;
 IF p_state='enabled' THEN
  IF old.state='hold' THEN RAISE EXCEPTION 'Resolve hold and explicitly disable before launch review' USING ERRCODE='55000'; END IF;
  IF NOT (shop_readiness(p_actor)->>'ready')::boolean THEN RAISE EXCEPTION 'Launch acceptance or operational checks incomplete' USING ERRCODE='55000'; END IF;
 END IF;
 UPDATE shop_release_control SET state=p_state,version=version+1,changed_by=p_actor,changed_at=now(),reason=p_reason WHERE singleton;
 SELECT to_jsonb(s)||jsonb_build_object('expectedVersion',p_expected) INTO result FROM shop_release_control s WHERE singleton;
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(p_actor,'admin','settings.security','shop_release_control','global',to_jsonb(old),result,p_operation,p_reason);
 INSERT INTO platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.operating.v1',p_operation,result);
 RETURN result;
END $$;

CREATE FUNCTION public.shop_assert_purchasing() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s shop_release_control; BEGIN
 SELECT * INTO STRICT s FROM shop_release_control WHERE singleton FOR SHARE;
 IF s.state<>'enabled' OR EXISTS(
  SELECT 1 FROM (SELECT 'f'||generate_series(1,13) k UNION ALL SELECT unnest(ARRAY['digital','qr','supply','integration','device','provider','web'])) required
  WHERE NOT EXISTS(SELECT 1 FROM shop_readiness_evidence e WHERE e.criterion=k AND e.passed AND e.valid_until>now())
 ) THEN RAISE EXCEPTION 'Reward redemption is temporarily unavailable' USING ERRCODE='55000'; END IF;
END $$;

CREATE FUNCTION public.shop_purchase_availability() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('operating_state',s.state,'redemption_enabled',s.state='enabled' AND NOT EXISTS(
 SELECT 1 FROM (SELECT 'f'||generate_series(1,13) k UNION ALL SELECT unnest(ARRAY['digital','qr','supply','integration','device','provider','web'])) required
 WHERE NOT EXISTS(SELECT 1 FROM shop_readiness_evidence e WHERE e.criterion=k AND e.passed AND e.valid_until>now())))
 FROM shop_release_control s WHERE singleton
$$;

CREATE FUNCTION public.shop_finish_recovery(p_result jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NOT p_result ?& ARRAY['recovered','failed','delivered','notificationFailures'] THEN RAISE EXCEPTION 'Worker outcome required' USING ERRCODE='22023'; END IF;
 INSERT INTO shop_worker_health VALUES(true,now(),p_result) ON CONFLICT(singleton) DO UPDATE SET finished_at=now(),result=EXCLUDED.result;
END $$;

-- Narrow, drift-checked replacement of existing authoritative contracts. No
-- alternate writers or renamed compatibility engines are introduced.
DO $$ DECLARE body text; previous text; BEGIN
 SELECT pg_get_functiondef('public.shop_redeem(uuid,uuid,integer,text,text)'::regprocedure) INTO body;
 previous:=body;
 body:=replace(body,'IF NOT (SELECT redemption_enabled FROM shop_release_control WHERE singleton) THEN RAISE EXCEPTION ''Redemption temporarily unavailable'' USING ERRCODE=''55000''; END IF;','PERFORM shop_assert_purchasing();');
 IF body=previous THEN RAISE EXCEPTION 'Unexpected checkout contract'; END IF;
 EXECUTE body;
 SELECT pg_get_functiondef('public.shop_catalog(uuid)'::regprocedure) INTO body;
 body:=replace(body,'''redemption_enabled'',(SELECT redemption_enabled FROM shop_release_control WHERE singleton)',
 '''operating_state'',(SELECT state FROM shop_release_control WHERE singleton),''redemption_enabled'',(shop_purchase_availability()->>''redemption_enabled'')::boolean');
 body:=replace(body,'''available'', c.fulfilment_type','''available'', r.partner_org_id IS NOT DISTINCT FROM p.organisation_id AND c.fulfilment_type');
 body:=replace(body,'i.status=''available'' AND nullif(i.display_payload->>''code'','''') IS NOT NULL AND ((i.display_payload->>''expiresAt'') IS NULL OR (i.display_payload->>''expiresAt'')::timestamptz>now())','shop_voucher_available(i.id)');
 EXECUTE body;
 SELECT pg_get_functiondef('public.allocate_reward_resource(uuid,uuid)'::regprocedure) INTO body;
 body:=replace(body,'status=''available'' AND nullif(display_payload->>''code'','''') IS NOT NULL AND ((display_payload->>''expiresAt'') IS NULL OR (display_payload->>''expiresAt'')::timestamptz>now())','shop_voucher_available(id)');
 EXECUTE body;
 SELECT pg_get_functiondef('public.shop_recover(integer)'::regprocedure) INTO body;
 body:=replace(body,'ON CONFLICT DO NOTHING;',
 'AND NOT EXISTS(SELECT 1 FROM shop_recovery queued WHERE queued.fulfilment_id=fulfilment.id)
 ORDER BY created_at,id LIMIT 1000
 ON CONFLICT DO NOTHING;');
 body:=replace(body,'WHERE available_at<=now() ORDER BY','WHERE attempts<8 AND available_at<=now() ORDER BY');
 body:=replace(body,'IF (SELECT state FROM fulfilment WHERE id=f.fulfilment_id) IN (''created'',''processing'',''reserved'',''ready'') THEN',
 'IF (SELECT state FROM fulfilment WHERE id=f.fulfilment_id)=''validated'' THEN
    UPDATE shop_recovery SET attempts=8,last_error=''validated_requires_review'' WHERE fulfilment_id=f.fulfilment_id;
    count_failed:=count_failed+1;
    CONTINUE;
   ELSIF (SELECT state FROM fulfilment WHERE id=f.fulfilment_id) IN (''created'',''processing'',''reserved'',''ready'') THEN');
 EXECUTE body;
 SELECT pg_get_functiondef('public.shop_fulfilment_command(uuid,uuid,text,integer,text,text,text,text)'::regprocedure) INTO body;
 body:=replace(body,'DO UPDATE SET available_at=now();','DO UPDATE SET available_at=now(),attempts=0,last_error=NULL;');
 body:=replace(body,'INSERT INTO shop_recovery(fulfilment_id) VALUES(f.id) ON CONFLICT(fulfilment_id) DO UPDATE SET available_at=now(),attempts=0,last_error=NULL;',
 'INSERT INTO shop_recovery(fulfilment_id) VALUES(f.id) ON CONFLICT(fulfilment_id) DO UPDATE SET available_at=now(),attempts=0,last_error=NULL;
  UPDATE fulfilment SET version=version+1,updated_at=now() WHERE id=f.id;
  INSERT INTO fulfilment_event(fulfilment_id,from_state,to_state,reason,correlation_id,actor_user_id,payload)
  VALUES(f.id,f.state,f.state,''recovery_queued'',p_correlation,p_actor,jsonb_build_object(''version'',f.version+1));');
 body:=replace(body,'PERFORM shop_record_transition(f.id,''completed'',''collection_confirmed'',p_actor,who,p_correlation);',
 'PERFORM shop_record_transition(f.id,''completed'',''collection_confirmed'',p_actor,who,p_correlation);
  DELETE FROM shop_recovery WHERE fulfilment_id=f.id;');
 EXECUTE body;
 SELECT pg_get_functiondef('public.shop_claim_outbox(integer)'::regprocedure) INTO body;
 body:=replace(body,'WHERE delivered_at IS NULL AND available_at<=now()','WHERE delivered_at IS NULL AND attempts<8 AND available_at<=now()');
 EXECUTE body;
 -- Global operating-state changes must never move the historical cutoff.
 SELECT pg_get_functiondef('public.shop_cancel_legacy_reservation(uuid,uuid,text,text,text,text)'::regprocedure) INTO body;
 EXECUTE replace(body,'SELECT changed_at FROM shop_release_control','SELECT containment_at FROM shop_release_control');
 SELECT pg_get_functiondef('public.shop_health(uuid,uuid)'::regprocedure) INTO body;
 body:=replace(body,'SELECT changed_at FROM shop_release_control','SELECT containment_at FROM shop_release_control');
 body:=replace(body,'q.last_error IS NOT NULL AND','(q.last_error IS NOT NULL OR q.attempts>=8) AND');
 body:=replace(body,'o.last_error IS NOT NULL AND','(o.last_error IS NOT NULL OR o.attempts>=8) AND');
 EXECUTE body;
 SELECT pg_get_functiondef('public.shop_save_catalog(uuid,uuid,jsonb,timestamp with time zone)'::regprocedure) INTO body;
 body:=replace(body,'IF p_expected IS NOT NULL AND old.updated_at IS DISTINCT FROM p_expected','IF p_expected IS NULL OR old.updated_at IS DISTINCT FROM p_expected');
 body:=replace(body,'(r.partner_org_id=target_org OR (r.partner_org_id IS NULL AND who=''admin''))','(r.partner_org_id IS NOT DISTINCT FROM target_org)');
 body:=replace(body,'IF c.fulfilment_type NOT IN','IF (c.fulfilment_type=''qr_barcode'' AND target_org IS NULL) OR c.fulfilment_type NOT IN');
 EXECUTE body;
 SELECT pg_get_functiondef('public.shop_import_codes(uuid,uuid,text[],text,text,timestamp with time zone,uuid)'::regprocedure) INTO body;
 body:=replace(body,'IF p_expires_at<=now() THEN RAISE EXCEPTION ''Voucher expiry must be in the future'' USING ERRCODE=''22023''; END IF;','');
 body:=replace(body,'FOREACH code IN ARRAY p_codes LOOP',
 'IF p_expires_at<=now() THEN RAISE EXCEPTION ''Voucher expiry must be in the future'' USING ERRCODE=''22023''; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(''voucher-import-org:''||coalesce(r.partner_org_id::text,''MOVRR''),0));
 FOREACH code IN ARRAY p_codes LOOP');
 body:=replace(body,'INSERT INTO fulfilment_resource_item(resource_id,external_code_hash,display_payload,status)',
 'IF EXISTS(SELECT 1 FROM fulfilment_resource_item i JOIN fulfilment_resource pool ON pool.id=i.resource_id
    WHERE pool.partner_org_id IS NOT DISTINCT FROM r.partner_org_id AND pool.id<>p_resource
    AND coalesce(i.external_code_hash,encode(sha256(convert_to(trim(i.display_payload->>''code''),''UTF8'')),''hex''))=encode(sha256(convert_to(trim(code),''UTF8'')),''hex''))
   THEN RAISE EXCEPTION ''Voucher already exists in another pool for this organisation'' USING ERRCODE=''22023''; END IF;
  IF EXISTS(SELECT 1 FROM fulfilment_resource_item i WHERE i.resource_id=p_resource AND
   coalesce(i.external_code_hash,encode(sha256(convert_to(trim(i.display_payload->>''code''),''UTF8'')),''hex''))=encode(sha256(convert_to(trim(code),''UTF8'')),''hex'')) THEN CONTINUE; END IF;
  INSERT INTO fulfilment_resource_item(resource_id,external_code_hash,display_payload,status)');
 EXECUTE body;
END $$;

CREATE OR REPLACE FUNCTION public.shop_retry_outbox(p_id uuid,p_lease uuid,p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 UPDATE shop_outbox SET lease_token=NULL,lease_until=NULL,last_error=left(p_error,200),available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer))
 WHERE id=p_id AND lease_token=p_lease AND lease_until>=now() AND delivered_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox lease lost; retry outcome not persisted' USING ERRCODE='40001'; END IF;
END $$;

CREATE FUNCTION public.shop_exception_cases(p_actor uuid,p_org uuid DEFAULT NULL,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM shop_authorize(p_actor,'read',p_org);
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM (
 SELECT * FROM (
 SELECT q.fulfilment_id id,q.fulfilment_id,'recovery'::text kind,q.attempts,q.available_at,q.last_error,(q.attempts>=8) exhausted,q.revision FROM shop_recovery q JOIN fulfilment f ON f.id=q.fulfilment_id WHERE (p_org IS NULL OR f.partner_org_id=p_org)
 UNION ALL
 SELECT o.id,o.fulfilment_id,'delivery',o.attempts,o.available_at,o.last_error,(o.attempts>=8),o.revision FROM shop_outbox o JOIN fulfilment f ON f.id=o.fulfilment_id WHERE o.delivered_at IS NULL AND (o.last_error IS NOT NULL OR o.attempts>=8) AND (p_org IS NULL OR f.partner_org_id=p_org)
 ) cases WHERE (p_after IS NULL OR id>p_after) ORDER BY id LIMIT greatest(1,least(p_limit,100))
 ) x),'[]'::jsonb);
END $$;

CREATE FUNCTION public.shop_retry_case(p_actor uuid,p_id uuid,p_kind text,p_version bigint,p_operation text,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f fulfilment; prior jsonb; actual bigint; lease timestamptz; result jsonb; who text; BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('recovery','delivery') OR p_version IS NULL OR nullif(trim(p_reason),'') IS NULL OR length(p_reason)>1000 OR nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 THEN RAISE EXCEPTION 'Case, version, operation and reason required' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT f FROM fulfilment WHERE id=CASE WHEN p_kind='recovery' THEN p_id ELSE (SELECT fulfilment_id FROM shop_outbox WHERE id=p_id) END;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||f.rider_id::text,0));
 who:=shop_authorize(p_actor,'retry',f.partner_org_id);
 SELECT payload INTO prior FROM platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.case-retry.v1' AND key=p_operation;
 IF FOUND THEN IF prior->>'id' IS DISTINCT FROM p_id::text OR prior->>'kind' IS DISTINCT FROM p_kind OR prior->>'reason' IS DISTINCT FROM p_reason OR (prior->>'expectedVersion')::bigint IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF; RETURN prior; END IF;
 IF p_kind='recovery' THEN
  SELECT revision INTO STRICT actual FROM shop_recovery WHERE fulfilment_id=p_id FOR UPDATE;
 ELSE
  SELECT revision,lease_until INTO actual,lease FROM shop_outbox WHERE id=p_id AND delivered_at IS NULL FOR UPDATE;
 END IF;
 IF actual IS NULL OR actual<>p_version OR lease>now() THEN RAISE EXCEPTION 'Case changed or currently leased; refresh' USING ERRCODE='40001'; END IF;
 IF p_kind='recovery' THEN UPDATE shop_recovery SET attempts=0,available_at=now(),last_error=NULL WHERE fulfilment_id=p_id;
 ELSE UPDATE shop_outbox SET attempts=0,available_at=now(),last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=p_id; END IF;
 result:=jsonb_build_object('id',p_id,'kind',p_kind,'expectedVersion',p_version,'reason',p_reason,'queued',true);
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason) VALUES(p_actor,who,'fulfilment.cancel','shop_exception',p_id::text,result,p_operation,p_reason);
 INSERT INTO platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.case-retry.v1',p_operation,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.shop_require_controller(uuid),public.shop_readiness(uuid),public.shop_operating_status(uuid),public.shop_record_readiness(uuid,text,boolean,text,text,timestamptz,bigint,text),public.shop_set_operating_state(uuid,text,bigint,text,text),public.shop_assert_purchasing(),public.shop_purchase_availability(),public.shop_finish_recovery(jsonb),public.shop_exception_cases(uuid,uuid,uuid,integer),public.shop_retry_case(uuid,uuid,text,bigint,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.shop_readiness(uuid),public.shop_operating_status(uuid),public.shop_record_readiness(uuid,text,boolean,text,text,timestamptz,bigint,text),public.shop_set_operating_state(uuid,text,bigint,text,text),public.shop_finish_recovery(jsonb),public.shop_exception_cases(uuid,uuid,uuid,integer),public.shop_retry_case(uuid,uuid,text,bigint,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
