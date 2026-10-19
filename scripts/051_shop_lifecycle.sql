-- Canonical lifecycle over existing v2 wallet, redemption and inventory records.
-- Requires 050. Does not enable redemption or rewrite historical rows.
BEGIN;
CREATE TABLE public.shop_credential (
 fulfilment_id uuid PRIMARY KEY REFERENCES public.fulfilment(id) ON DELETE RESTRICT,
 value text NOT NULL, kind text NOT NULL CHECK(kind IN ('qr','one_time_code')),
 exposed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shop_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fulfilment_id uuid NOT NULL REFERENCES public.fulfilment(id),
 version integer NOT NULL, kind text NOT NULL, payload jsonb NOT NULL,
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, lease_until timestamptz, delivered_at timestamptz, last_error text,
 UNIQUE(fulfilment_id,version,kind)
);
CREATE INDEX shop_outbox_due ON public.shop_outbox(available_at,id) WHERE delivered_at IS NULL;
CREATE TABLE public.shop_recovery (
 fulfilment_id uuid PRIMARY KEY REFERENCES public.fulfilment(id),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), last_error text
);
CREATE INDEX shop_recovery_due ON public.shop_recovery(available_at,fulfilment_id);
CREATE TABLE public.shop_catalog_editor(catalog_id uuid PRIMARY KEY REFERENCES public.reward_catalog(id),actor_id uuid NOT NULL);
ALTER TABLE public.shop_catalog_editor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_catalog_editor FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.shop_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_recovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_credential,public.shop_outbox,public.shop_recovery FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.shop_outbox,public.shop_recovery TO service_role;
-- All fulfillment access uses target-scoped Platform reads. Dashboard membership
-- alone must not expose voucher pools, bearer hashes or another rider's orders.
REVOKE SELECT ON public.fulfilment,public.fulfilment_event,public.fulfilment_token,
 public.fulfilment_resource,public.fulfilment_resource_item,public.fulfilment_resource_allocation,
 public.partner_validation,public.platform_idempotency_key FROM anon,authenticated;
CREATE INDEX shop_fulfilment_due ON public.fulfilment(expires_at,id)
 WHERE state NOT IN ('completed','refunded','reversed');
CREATE UNIQUE INDEX shop_resource_code_once ON public.fulfilment_resource_item(resource_id,external_code_hash) WHERE external_code_hash IS NOT NULL;

CREATE FUNCTION public.shop_authorize(p_actor uuid,p_action text,p_org uuid DEFAULT NULL,p_rider uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Actor required' USING ERRCODE='42501'; END IF;
 IF p_action='redeem' AND EXISTS(SELECT 1 FROM rider WHERE id=p_rider AND user_id=p_actor) THEN RETURN 'rider'; END IF;
 SELECT role INTO v_role FROM admin_users WHERE user_id=p_actor;
 IF v_role IS NOT NULL AND (
  (p_action='read' AND v_role IN ('super_admin','admin','operations_manager','partner_operations_manager','support_agent','support_lead','security_admin')) OR
  (p_action IN ('cancel','refund','consume','collect','adjust','retry') AND v_role IN ('super_admin','admin','operations_manager','partner_operations_manager'))
 ) THEN RETURN 'admin'; END IF;
 IF p_action='read' AND EXISTS(SELECT 1 FROM rider WHERE id=p_rider AND user_id=p_actor) THEN RETURN 'rider'; END IF;
 IF p_org IS NOT NULL AND EXISTS(SELECT 1 FROM organisation_membership WHERE user_id=p_actor AND organisation_id=p_org AND status='active'
  AND ((p_action='read') OR (p_action IN ('consume','collect') AND role IN ('owner','manager','staff')) OR
  (p_action IN ('cancel','refund','retry') AND role IN ('owner','manager')))) THEN RETURN 'organisation'; END IF;
 RAISE EXCEPTION 'Target not authorized' USING ERRCODE='42501';
END $$;

CREATE FUNCTION public.shop_record_transition(p_id uuid,p_state text,p_reason text,p_actor uuid,p_principal text,p_correlation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f fulfilment; v_outcome text; v_status text; BEGIN
 SELECT * INTO STRICT f FROM fulfilment WHERE id=p_id FOR UPDATE;
 IF nullif(trim(p_reason),'') IS NULL OR nullif(trim(p_correlation),'') IS NULL THEN RAISE EXCEPTION 'Reason and correlation required' USING ERRCODE='22023'; END IF;
 PERFORM set_config('movrr.shop_command','v1',true);
 v_outcome:=CASE WHEN p_state='completed' THEN 'success' WHEN p_state IN ('cancelled','failed','expired','refunded','reversed') THEN p_state ELSE NULL END;
 UPDATE fulfilment SET state=p_state,outcome=v_outcome,version=version+1,updated_at=now(),
 completed_at=CASE WHEN p_state='completed' THEN now() ELSE completed_at END WHERE id=p_id;
 v_status:=CASE WHEN p_state='completed' THEN 'fulfilled' WHEN p_state IN ('cancelled','failed','expired','refunded','reversed') THEN 'cancelled' ELSE 'approved' END;
 UPDATE reward_redemptions SET status=v_status,approved_at=coalesce(approved_at,now()),
 fulfilled_at=CASE WHEN v_status='fulfilled' THEN now() ELSE fulfilled_at END,
 cancelled_at=CASE WHEN v_status='cancelled' THEN coalesce(cancelled_at,now()) ELSE cancelled_at END
 WHERE id=f.redemption_id;
 INSERT INTO fulfilment_event(fulfilment_id,from_state,to_state,reason,correlation_id,actor_user_id,payload)
 VALUES(p_id,f.state,p_state,p_reason,p_correlation,p_actor,jsonb_build_object('version',f.version+1));
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(p_actor,p_principal,'fulfilment.'||p_state,'fulfilment',p_id::text,
 jsonb_build_object('state',f.state,'version',f.version),jsonb_build_object('state',p_state,'version',f.version+1),p_correlation,p_reason);
 INSERT INTO shop_outbox(fulfilment_id,version,kind,payload) VALUES(p_id,f.version+1,'notification',
 jsonb_build_object('riderId',f.rider_id,'redemptionId',f.redemption_id,'catalogItemId',f.catalog_item_id,
 'state',p_state,'reason',p_reason,'correlationId',p_correlation,'occurredAt',now(),
 'pointsSpent',(SELECT points_spent FROM reward_redemptions WHERE id=f.redemption_id)));
 INSERT INTO shop_outbox(fulfilment_id,version,kind,payload)
 SELECT fulfilment_id,version,'email',payload FROM shop_outbox WHERE fulfilment_id=p_id AND version=f.version+1 AND kind='notification';
END $$;

-- A digital reward must be a real imported partner voucher. Random generated
-- strings are never advertised as merchant value. QR resources also use real pools.
CREATE FUNCTION public.shop_catalog(p_actor uuid) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (to_jsonb(c)-'visibility_rules'-'resource_id') || jsonb_build_object(
 'partner',jsonb_build_object('name',p.name,'website',p.website),
 'available', c.fulfilment_type IN ('instant_digital','qr_barcode') AND r.resource_kind='voucher_pool' AND r.status='active'
 AND EXISTS(SELECT 1 FROM fulfilment_resource_item i WHERE i.resource_id=r.id AND i.status='available' AND nullif(i.display_payload->>'code','') IS NOT NULL AND ((i.display_payload->>'expiresAt') IS NULL OR (i.display_payload->>'expiresAt')::timestamptz>now()))
 AND (c.inventory_type='unlimited' OR coalesce(c.inventory_count,0)>0)
 AND (c.fulfilment_type<>'qr_barcode' OR p.organisation_id IS NOT NULL)
 AND c.points_price>=0 AND c.visibility_rules='{}'::jsonb,
 'eligible',coalesce(b.points_balance,0)>=c.points_price AND
 (c.max_per_rider IS NULL OR (SELECT count(*) FROM reward_redemptions rr WHERE rr.rider_id=rid.id AND rr.reward_id=c.id AND rr.status NOT IN ('cancelled','rejected'))<c.max_per_rider),
 'redemption_enabled',(SELECT redemption_enabled FROM shop_release_control WHERE singleton))
 FROM reward_catalog c LEFT JOIN fulfilment_resource r ON r.id=c.resource_id
 LEFT JOIN reward_partner p ON p.id=c.partner_id
 LEFT JOIN rider rid ON rid.user_id=p_actor LEFT JOIN rider_reward_balance b ON b.rider_id=rid.id
 WHERE c.status='active' AND c.fulfilment_type IN ('instant_digital','qr_barcode') AND r.resource_kind='voucher_pool'
 ORDER BY c.is_featured DESC,c.featured_rank,c.updated_at DESC
$$;

CREATE FUNCTION public.shop_public_catalog_visible(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM reward_catalog c JOIN fulfilment_resource r ON r.id=c.resource_id
 LEFT JOIN reward_partner p ON p.id=c.partner_id WHERE c.id=p_id AND c.status='active'
 AND c.fulfilment_type IN ('instant_digital','qr_barcode') AND r.resource_kind='voucher_pool'
 AND c.points_price>=0 AND c.visibility_rules='{}'::jsonb AND (c.fulfilment_type<>'qr_barcode' OR p.organisation_id IS NOT NULL))
$$;
ALTER POLICY "Public read active rewards" ON public.reward_catalog USING(public.shop_public_catalog_visible(id));

CREATE OR REPLACE FUNCTION public.allocate_reward_resource(p_fulfilment_id uuid,p_resource_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_f fulfilment; v_r fulfilment_resource; v_a fulfilment_resource_allocation; v_item fulfilment_resource_item; v_code text;
BEGIN
 SELECT * INTO v_f FROM fulfilment WHERE id=p_fulfilment_id FOR UPDATE;
 IF NOT FOUND OR v_f.metadata->'_engine'->>'resourceId' IS DISTINCT FROM p_resource_id::text THEN
  RAISE EXCEPTION 'Fulfilment resource mismatch' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_a FROM fulfilment_resource_allocation WHERE fulfilment_id=p_fulfilment_id AND resource_id=p_resource_id;
 IF NOT FOUND THEN
  IF v_f.state NOT IN ('created','processing','reserved') THEN RAISE EXCEPTION 'Fulfilment cannot allocate resources' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_r FROM fulfilment_resource WHERE id=p_resource_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Resource unavailable' USING ERRCODE='22023'; END IF;
  IF v_r.resource_kind='voucher_pool' THEN
   SELECT * INTO v_item FROM fulfilment_resource_item WHERE resource_id=p_resource_id AND status='available' AND nullif(display_payload->>'code','') IS NOT NULL AND ((display_payload->>'expiresAt') IS NULL OR (display_payload->>'expiresAt')::timestamptz>now()) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN RAISE EXCEPTION 'No available items in voucher pool' USING ERRCODE='22023'; END IF;
   v_code:=v_item.display_payload->>'code';
   UPDATE fulfilment_resource_item SET status='reserved',updated_at=now() WHERE id=v_item.id;
  ELSE RAISE EXCEPTION 'Unsupported resource kind' USING ERRCODE='22023'; END IF;
  INSERT INTO fulfilment_resource_allocation(fulfilment_id,resource_id,resource_item_id,status,metadata)
   VALUES(p_fulfilment_id,p_resource_id,v_item.id,'reserved',jsonb_build_object('code',v_code)) RETURNING * INTO v_a;
 END IF;
 RETURN jsonb_build_object('allocationId',v_a.id,'fulfilmentId',v_a.fulfilment_id,'resourceId',v_a.resource_id,
  'resourceItemId',v_a.resource_item_id,'status',v_a.status,'code',v_a.metadata->>'code');
END;
$$;

CREATE FUNCTION public.shop_prepare(p_id uuid,p_actor uuid,p_principal text,p_correlation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f fulfilment; a jsonb; secret text; t uuid; item_expiry timestamptz; BEGIN
 SELECT * INTO STRICT f FROM fulfilment WHERE id=p_id FOR UPDATE;
 IF f.state NOT IN ('created','processing','reserved','ready') THEN RETURN; END IF;
 PERFORM set_config('movrr.shop_command','v1',true);
 a:=allocate_reward_resource(f.id,(f.metadata->'_engine'->>'resourceId')::uuid);
 IF a->>'status' NOT IN ('reserved','fulfilled') OR nullif(a->>'code','') IS NULL THEN
  RAISE EXCEPTION 'Reward allocation unavailable' USING ERRCODE='22023'; END IF;
 SELECT (display_payload->>'expiresAt')::timestamptz INTO item_expiry FROM fulfilment_resource_item WHERE id=(a->>'resourceItemId')::uuid;
 f.expires_at:=least(coalesce(f.expires_at,now()+interval '30 days'),coalesce(item_expiry,now()+interval '30 days'));
 IF f.expires_at<=now() THEN RAISE EXCEPTION 'Reward inventory expired' USING ERRCODE='22023'; END IF;
 UPDATE fulfilment SET expires_at=f.expires_at WHERE id=f.id;
 IF f.fulfilment_type='instant_digital' THEN
  INSERT INTO shop_credential(fulfilment_id,value,kind) VALUES(f.id,a->>'code','one_time_code') ON CONFLICT DO NOTHING;
  PERFORM shop_record_transition(f.id,'ready','digital_voucher_ready',p_actor,p_principal,p_correlation);
 ELSE
  IF f.partner_org_id IS NULL THEN RAISE EXCEPTION 'QR partner required' USING ERRCODE='22023'; END IF;
  secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  INSERT INTO shop_credential(fulfilment_id,value,kind) VALUES(f.id,secret,'qr') ON CONFLICT DO NOTHING;
  SELECT value INTO secret FROM shop_credential WHERE fulfilment_id=f.id;
  INSERT INTO fulfilment_token(fulfilment_id,token_type,token_hash,expires_at)
  VALUES(f.id,'qr',encode(sha256(convert_to(secret,'UTF8')),'hex'),f.expires_at) ON CONFLICT(token_hash) DO NOTHING;
  PERFORM shop_record_transition(f.id,'awaiting_collection','reward_ready_for_collection',p_actor,p_principal,p_correlation);
 END IF;
 DELETE FROM shop_recovery WHERE fulfilment_id=f.id;
END $$;

-- First-class free claims use the same v2 kernel and receipt, with no ledger row.
ALTER TABLE public.reward_redemptions DROP CONSTRAINT IF EXISTS reward_redemptions_points_spent_check;
ALTER TABLE public.reward_redemptions DROP CONSTRAINT IF EXISTS reward_redemptions_points_spent_positive;
ALTER TABLE public.reward_redemptions ADD CONSTRAINT reward_redemptions_points_spent_nonnegative CHECK(points_spent>=0);
CREATE OR REPLACE FUNCTION public.wallet_settle_debit(
 p_rider_id uuid,p_catalog_item_id uuid,p_operation_id text,p_actor_id uuid,p_correlation_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_catalog public.reward_catalog; v_balance integer; v_redemption uuid:=gen_random_uuid();
 v_fulfilment uuid:=gen_random_uuid(); v_transaction uuid; v_result jsonb; v_prior jsonb;
 v_now timestamptz:=now(); v_partner uuid; v_count integer;
BEGIN
 IF p_operation_id IS NULL OR length(trim(p_operation_id)) NOT BETWEEN 1 AND 200 OR
    p_correlation_id IS NULL OR length(trim(p_correlation_id))=0 THEN
   RAISE EXCEPTION 'Valid operation and correlation identifiers required' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM rider WHERE id=p_rider_id AND user_id=p_actor_id) THEN
   RAISE EXCEPTION 'Rider identity mismatch' USING ERRCODE='42501';
 END IF;
 -- Stable per-rider lock also serializes distinct purchases, including the first balance row.
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||p_rider_id::text,0));
 SELECT payload INTO v_prior FROM platform_idempotency_key
 WHERE principal_id=p_rider_id::text AND scope='wallet.debit.v2' AND key=p_operation_id;
 IF FOUND THEN
   IF v_prior->'redemption'->>'catalogItemId' IS DISTINCT FROM p_catalog_item_id::text THEN
     RAISE EXCEPTION 'Operation identifier already used for another reward' USING ERRCODE='22023';
   END IF;
   RETURN v_prior;
 END IF;
 SELECT points_balance INTO v_balance FROM rider_reward_balance WHERE rider_id=p_rider_id FOR UPDATE;
 IF NOT FOUND THEN v_balance:=0; END IF;
 SELECT * INTO v_catalog FROM reward_catalog WHERE id=p_catalog_item_id FOR UPDATE;
 IF NOT FOUND OR v_catalog.status<>'active' OR v_catalog.fulfilment_type IS NULL OR
    v_catalog.fulfilment_type NOT IN ('instant_digital','qr_barcode') OR v_catalog.points_price<0 OR
    v_catalog.resource_id IS NULL THEN
   RAISE EXCEPTION 'Reward not available' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM fulfilment_resource WHERE id=v_catalog.resource_id AND status='active') THEN
   RAISE EXCEPTION 'Reward resource unavailable' USING ERRCODE='22023';
 END IF;
 IF v_catalog.max_per_rider IS NOT NULL THEN
   SELECT count(*) INTO v_count FROM reward_redemptions WHERE rider_id=p_rider_id AND reward_id=p_catalog_item_id AND status NOT IN ('cancelled','rejected');
   IF v_count>=v_catalog.max_per_rider THEN RAISE EXCEPTION 'Reward limit reached' USING ERRCODE='22023'; END IF;
 END IF;
 IF v_balance<v_catalog.points_price THEN RAISE EXCEPTION 'Insufficient balance' USING ERRCODE='22023'; END IF;
 IF v_catalog.inventory_type='limited' THEN
   IF coalesce(v_catalog.inventory_count,0)<=0 THEN RAISE EXCEPTION 'Reward out of stock' USING ERRCODE='22023'; END IF;
   UPDATE reward_catalog SET inventory_count=inventory_count-1,updated_at=v_now WHERE id=p_catalog_item_id;
 END IF;
 SELECT organisation_id INTO v_partner FROM reward_partner WHERE id=v_catalog.partner_id;
 INSERT INTO reward_redemptions(id,rider_id,reward_id,reward_sku,reward_title,points_spent,status,requested_at,metadata)
 VALUES(v_redemption,p_rider_id,p_catalog_item_id,v_catalog.sku,v_catalog.title,v_catalog.points_price,'requested',v_now,
   jsonb_build_object('wallet_contract',2,'idempotency_key',p_operation_id,'fulfilment_id',v_fulfilment,'platform_status','committed','actor_id',p_actor_id));
 IF v_catalog.points_price>0 THEN
 INSERT INTO reward_transactions(rider_id,points_earned,source,metadata,created_at)
 VALUES(p_rider_id,-v_catalog.points_price,'adjustment',jsonb_build_object(
   'wallet_contract',2,'wallet_operation_id','debit:'||p_operation_id,'settlement_kind','debit',
   'redemption_id',v_redemption,'fulfilment_id',v_fulfilment,'correlation_id',p_correlation_id,
   'adjustment_direction','debit','actor_id',p_actor_id),v_now) RETURNING id INTO v_transaction;
 UPDATE reward_redemptions SET metadata=metadata||jsonb_build_object('ledger_transaction_id',v_transaction) WHERE id=v_redemption;
 END IF;
 INSERT INTO fulfilment(id,redemption_id,rider_id,catalog_item_id,fulfilment_type,state,version,partner_org_id,idempotency_key,metadata)
 VALUES(v_fulfilment,v_redemption,p_rider_id,p_catalog_item_id,v_catalog.fulfilment_type,'created',0,v_partner,
   'wallet:'||p_rider_id::text||':'||p_operation_id,jsonb_build_object('wallet_contract',2,'_engine',jsonb_build_object(
     'resourceId',v_catalog.resource_id,'pointsCost',v_catalog.points_price,'correlationId',p_correlation_id,'tokenType','qr')));
 SELECT coalesce((SELECT points_balance FROM rider_reward_balance WHERE rider_id=p_rider_id),0) INTO v_balance;
 v_result:=jsonb_build_object('redemption',jsonb_build_object('id',v_redemption,'riderId',p_rider_id,
   'catalogItemId',p_catalog_item_id,'pointsSpent',v_catalog.points_price,'status','committed',
   'fulfilmentId',v_fulfilment,'idempotencyKey',p_operation_id,'ledgerTransactionId',v_transaction,'isFree',v_catalog.points_price=0,'createdAt',v_now),
   'transactionId',v_transaction,'balanceAfter',v_balance);
 INSERT INTO platform_idempotency_key(principal_id,scope,key,payload)
 VALUES(p_rider_id::text,'wallet.debit.v2',p_operation_id,v_result);
 RETURN v_result;
END;
$$;

CREATE FUNCTION public.shop_redeem(p_actor uuid,p_catalog uuid,p_expected_price integer,p_operation text,p_correlation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; prior jsonb; receipt jsonb; c reward_catalog; r fulfilment_resource; available jsonb; BEGIN
 SELECT id INTO rid FROM rider WHERE user_id=p_actor;
 PERFORM shop_authorize(p_actor,'redeem',NULL,rid);
 IF nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 THEN RAISE EXCEPTION 'Valid operation required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||rid::text,0));
 SELECT payload INTO prior FROM platform_idempotency_key WHERE principal_id=rid::text AND scope='wallet.debit.v2' AND key=p_operation;
 IF FOUND THEN
  IF prior->'redemption'->>'catalogItemId' IS DISTINCT FROM p_catalog::text THEN RAISE EXCEPTION 'Operation reused for another reward' USING ERRCODE='22023'; END IF;
  RETURN prior || jsonb_build_object('fulfilment',(SELECT to_jsonb(f) FROM fulfilment f WHERE f.id=(prior->'redemption'->>'fulfilmentId')::uuid));
 END IF;
 IF NOT (SELECT redemption_enabled FROM shop_release_control WHERE singleton) THEN RAISE EXCEPTION 'Redemption temporarily unavailable' USING ERRCODE='55000'; END IF;
 SELECT * INTO c FROM reward_catalog WHERE id=p_catalog FOR UPDATE;
 IF NOT FOUND OR p_expected_price IS NULL OR p_expected_price<>c.points_price THEN RAISE EXCEPTION 'Reward price changed; review and confirm again' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM fulfilment_resource WHERE id=c.resource_id FOR UPDATE;
 SELECT x INTO available FROM shop_catalog(p_actor) x WHERE x->>'id'=p_catalog::text;
 IF available IS NULL OR NOT coalesce((available->>'available')::boolean,false) THEN RAISE EXCEPTION 'Reward not available' USING ERRCODE='22023'; END IF;
 PERFORM set_config('movrr.shop_command','v1',true);
 receipt:=wallet_settle_debit(rid,p_catalog,p_operation,p_actor,p_correlation);
 UPDATE fulfilment SET metadata=metadata||jsonb_build_object('inventory_debited',c.inventory_type='limited') WHERE id=(receipt->'redemption'->>'fulfilmentId')::uuid;
 PERFORM shop_prepare((receipt->'redemption'->>'fulfilmentId')::uuid,p_actor,'rider',p_correlation);
 RETURN receipt || jsonb_build_object('fulfilment',(SELECT to_jsonb(f) FROM fulfilment f WHERE f.id=(receipt->'redemption'->>'fulfilmentId')::uuid));
END $$;

CREATE FUNCTION public.shop_get_credential(p_actor uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f fulfilment; c shop_credential; t fulfilment_token; who text; a fulfilment_resource_allocation; rid uuid; BEGIN
 SELECT rider_id INTO rid FROM fulfilment WHERE id=p_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||rid::text,0));
 SELECT * INTO STRICT f FROM fulfilment WHERE id=p_id FOR UPDATE;
 who:=shop_authorize(p_actor,'read',f.partner_org_id,f.rider_id);
 IF who='admin' THEN PERFORM shop_authorize(p_actor,'adjust'); END IF;
 -- Partners validate presented credentials; never retrieve riders' bearer secrets.
 IF who='organisation' THEN RAISE EXCEPTION 'Owner credential access required' USING ERRCODE='42501'; END IF;
 IF f.state NOT IN ('ready','awaiting_collection','completed') OR f.expires_at<=now() THEN RETURN NULL; END IF;
 SELECT * INTO c FROM shop_credential WHERE fulfilment_id=p_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO t FROM fulfilment_token WHERE fulfilment_id=p_id ORDER BY created_at DESC LIMIT 1;
 IF c.kind='qr' AND (t.id IS NULL OR t.status<>'active' OR t.expires_at<=now()) THEN RETURN NULL; END IF;
 IF c.kind='one_time_code' AND f.state='ready' THEN
  PERFORM set_config('movrr.shop_command','v1',true);
  SELECT * INTO STRICT a FROM fulfilment_resource_allocation WHERE fulfilment_id=f.id FOR UPDATE;
  IF a.status<>'reserved' THEN RAISE EXCEPTION 'Resource not reserved' USING ERRCODE='22023'; END IF;
  UPDATE fulfilment_resource_item SET status='fulfilled',updated_at=now() WHERE id=a.resource_item_id AND status='reserved';
  IF a.resource_item_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Resource state conflict' USING ERRCODE='40001'; END IF;
  UPDATE fulfilment_resource_allocation SET status='fulfilled',fulfilled_at=now() WHERE id=a.id;
  PERFORM shop_record_transition(f.id,'completed','digital_voucher_delivered',p_actor,who,'delivery:'||f.id::text);
 END IF;
 UPDATE shop_credential SET exposed_at=coalesce(exposed_at,now()) WHERE fulfilment_id=p_id;
 RETURN jsonb_build_object('fulfilmentId',p_id,'tokenType',c.kind,'status','active','displayHint',c.value,'expiresAt',f.expires_at);
END $$;

-- Full cancellation/refund is a single transaction. Delivered digital value and
-- collected rewards cannot be refunded without external revocation; fail closed.
CREATE FUNCTION public.shop_unwind(p_id uuid,p_actor uuid,p_principal text,p_reason text,p_correlation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f fulfilment; a fulfilment_resource_allocation; points integer; BEGIN
 SELECT * INTO STRICT f FROM fulfilment WHERE id=p_id FOR UPDATE;
 IF f.state='refunded' OR f.metadata->>'unwind_complete'='true' THEN RETURN; END IF;
 IF f.state IN ('completed','collected','delivered','dispatched','reversed') THEN RAISE EXCEPTION 'Delivered reward cannot be refunded' USING ERRCODE='22023'; END IF;
 PERFORM set_config('movrr.shop_command','v1',true);
 IF f.state NOT IN ('cancelled','failed','expired') THEN
  PERFORM shop_record_transition(f.id,'cancelled',p_reason,p_actor,p_principal,p_correlation);
 END IF;
 UPDATE fulfilment_token SET status='revoked',revoked_at=now() WHERE fulfilment_id=f.id AND status='active';
 FOR a IN SELECT * FROM fulfilment_resource_allocation WHERE fulfilment_id=f.id FOR UPDATE LOOP
  -- Never return a fulfilled merchant voucher to a pool.
  IF a.status='fulfilled' THEN RAISE EXCEPTION 'Resource already delivered' USING ERRCODE='22023'; END IF;
  IF a.status='reserved' THEN
   UPDATE fulfilment_resource_item SET status='available',updated_at=now() WHERE id=a.resource_item_id AND status='reserved';
   IF a.resource_item_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Resource state conflict' USING ERRCODE='40001'; END IF;
   UPDATE fulfilment_resource_allocation SET status='released',released_at=now() WHERE id=a.id;
  END IF;
 END LOOP;
 SELECT -d.points_earned-coalesce((SELECT sum(t.points_earned) FROM reward_transactions t WHERE t.metadata->>'original_debit_id'=d.id::text AND t.metadata->>'settlement_kind'='compensating_refund'),0)
 INTO points FROM reward_transactions d WHERE d.rider_id=f.rider_id AND d.metadata->>'redemption_id'=f.redemption_id::text AND d.metadata->>'wallet_contract'='2' AND d.metadata->>'settlement_kind'='debit';
 IF (SELECT points_spent FROM reward_redemptions WHERE id=f.redemption_id)=0 THEN
  IF points IS NOT NULL THEN RAISE EXCEPTION 'Free claim has unexpected debit' USING ERRCODE='22023'; END IF;
  points:=0;
 END IF;
 IF points IS NULL THEN RAISE EXCEPTION 'Original debit missing' USING ERRCODE='22023'; END IF;
 IF points>0 THEN PERFORM wallet_settle_refund(f.rider_id,points,f.id,'shop-refund:'||f.id::text,p_reason,p_correlation); END IF;
 IF coalesce((f.metadata->>'inventory_restored')::boolean,false)=false THEN
  UPDATE reward_catalog SET inventory_count=coalesce(inventory_count,0)+1,updated_at=now() WHERE id=f.catalog_item_id AND coalesce((f.metadata->>'inventory_debited')::boolean,true);
  UPDATE fulfilment SET metadata=metadata||'{"inventory_restored":true}'::jsonb WHERE id=f.id;
 END IF;
 UPDATE fulfilment SET metadata=metadata||'{"unwind_complete":true}'::jsonb WHERE id=f.id;
 IF (SELECT points_spent FROM reward_redemptions WHERE id=f.redemption_id)>0 THEN
  PERFORM shop_record_transition(f.id,'refunded',p_reason,p_actor,p_principal,p_correlation);
 END IF;
 DELETE FROM shop_recovery WHERE fulfilment_id=f.id;
END $$;

CREATE FUNCTION public.shop_fulfilment_command(p_actor uuid,p_id uuid,p_action text,p_version integer,p_operation text,p_reason text,p_correlation text,p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f fulfilment; tid uuid; token fulfilment_token; rid uuid; who text; prior jsonb; result jsonb; a fulfilment_resource_allocation; target uuid:=p_id; BEGIN
 IF nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 OR p_action NOT IN ('cancel','refund','consume','collect','retry') THEN RAISE EXCEPTION 'Invalid command' USING ERRCODE='22023'; END IF;
 IF p_action='consume' THEN
  SELECT fulfilment_id INTO p_id FROM fulfilment_token WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  IF target IS NOT NULL AND target IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'Token belongs to another reward' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT rider_id INTO rid FROM fulfilment WHERE id=p_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Reward not found' USING ERRCODE='P0002'; END IF;
 -- Same global lock order as v2 debit/refund: rider -> balance -> catalog/resource.
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||rid::text,0));
 SELECT * INTO STRICT f FROM fulfilment WHERE id=p_id FOR UPDATE;
 who:=shop_authorize(p_actor,p_action,f.partner_org_id,f.rider_id);
 SELECT payload INTO prior FROM platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.command.v1' AND key=p_operation;
 IF FOUND THEN
  IF prior->>'fulfilmentId' IS DISTINCT FROM p_id::text OR prior->>'action' IS DISTINCT FROM p_action THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF;
  RETURN prior;
 END IF;
 IF (p_action<>'consume' AND p_version IS NULL) OR (p_version IS NOT NULL AND p_version<>f.version) THEN RAISE EXCEPTION 'Fulfilment version changed' USING ERRCODE='40001'; END IF;
 PERFORM set_config('movrr.shop_command','v1',true);
 IF p_action='retry' THEN
  IF f.state IN ('completed','refunded','reversed') OR f.metadata->>'unwind_complete'='true' OR (f.state IN ('ready','awaiting_collection','validated') AND f.expires_at>now()) THEN RAISE EXCEPTION 'Reward has no interrupted or overdue work' USING ERRCODE='22023'; END IF;
  INSERT INTO shop_recovery(fulfilment_id) VALUES(f.id) ON CONFLICT(fulfilment_id) DO UPDATE SET available_at=now();
  INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason) VALUES(p_actor,who,'fulfilment.retry','fulfilment',f.id::text,jsonb_build_object('recovery','queued'),p_correlation,p_reason);
 ELSIF p_action IN ('cancel','refund') THEN
  PERFORM shop_unwind(f.id,p_actor,who,p_reason,p_correlation);
 ELSIF p_action='consume' THEN
  SELECT * INTO STRICT token FROM fulfilment_token WHERE fulfilment_id=f.id AND token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') FOR UPDATE;
  IF token.status<>'active' OR token.expires_at<=now() OR f.expires_at<=now() OR f.state<>'awaiting_collection' THEN RAISE EXCEPTION 'Token expired, consumed or unavailable' USING ERRCODE='22023'; END IF;
  UPDATE fulfilment_token SET status='consumed',consumed_at=now() WHERE id=token.id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Token already consumed' USING ERRCODE='40001'; END IF;
  PERFORM shop_record_transition(f.id,'validated','partner_validated',p_actor,who,p_correlation);
  INSERT INTO partner_validation(fulfilment_id,partner_org_id,actor_user_id,action,decision,correlation_id) VALUES(f.id,f.partner_org_id,p_actor,'validate','accepted',p_correlation);
 ELSE
  IF f.state<>'validated' THEN RAISE EXCEPTION 'Reward must be validated before collection' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT a FROM fulfilment_resource_allocation WHERE fulfilment_id=f.id FOR UPDATE;
  IF a.status<>'reserved' THEN RAISE EXCEPTION 'Resource not reserved' USING ERRCODE='22023'; END IF;
  UPDATE fulfilment_resource_item SET status='fulfilled',updated_at=now() WHERE id=a.resource_item_id AND status='reserved';
  IF a.resource_item_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Resource state conflict' USING ERRCODE='40001'; END IF;
  UPDATE fulfilment_resource_allocation SET status='fulfilled',fulfilled_at=now() WHERE id=a.id;
  PERFORM shop_record_transition(f.id,'completed','collection_confirmed',p_actor,who,p_correlation);
  INSERT INTO partner_validation(fulfilment_id,partner_org_id,actor_user_id,action,decision,correlation_id) VALUES(f.id,f.partner_org_id,p_actor,'confirm_collection','accepted',p_correlation);
 END IF;
 SELECT jsonb_build_object('fulfilmentId',id,'action',p_action,'fulfilment',to_jsonb(x)) INTO result FROM fulfilment x WHERE id=f.id;
 INSERT INTO platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.command.v1',p_operation,result);
 RETURN result;
END $$;

CREATE FUNCTION public.shop_adjust_points(p_actor uuid,p_rider uuid,p_points integer,p_reason text,p_operation text,p_correlation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE who text; prior jsonb; result jsonb; bal integer; tx uuid; BEGIN
 who:=shop_authorize(p_actor,'adjust');
 IF p_points IS NULL OR p_points=0 OR abs(p_points::bigint)>1000000 OR nullif(trim(p_reason),'') IS NULL OR nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 THEN RAISE EXCEPTION 'Invalid adjustment' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||p_rider::text,0));
 SELECT payload INTO prior FROM platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.adjust.v1' AND key=p_operation;
 IF FOUND THEN
  IF prior->>'riderId' IS DISTINCT FROM p_rider::text OR (prior->>'points')::integer<>p_points OR prior->>'reason' IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF;
  RETURN prior;
 END IF;
 SELECT points_balance INTO bal FROM rider_reward_balance WHERE rider_id=p_rider FOR UPDATE;
 IF bal IS NULL OR bal+p_points<0 THEN RAISE EXCEPTION 'Invalid rider or insufficient balance' USING ERRCODE='22023'; END IF;
 INSERT INTO reward_transactions(rider_id,points_earned,source,metadata) VALUES(p_rider,p_points,'adjustment',jsonb_build_object('reason',p_reason,'actor_id',p_actor,'correlation_id',p_correlation,'adjustment_direction',CASE WHEN p_points>0 THEN 'credit' ELSE 'debit' END,'admin_operation_id',p_operation)) RETURNING id INTO tx;
 result:=jsonb_build_object('transactionId',tx,'riderId',p_rider,'points',p_points,'reason',p_reason,'balanceAfter',(SELECT points_balance FROM rider_reward_balance WHERE rider_id=p_rider));
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason) VALUES(p_actor,who,'rewards.manage','reward_transactions',tx::text,result,p_correlation,p_reason);
 INSERT INTO platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.adjust.v1',p_operation,result);
 RETURN result;
END $$;

-- The two pre-launch reservation records are real obligations, not an alternate
-- purchase API. Staff may release an undelivered reservation; never create one.
-- Retire this command once those pre-containment obligations are resolved.
CREATE FUNCTION public.shop_cancel_legacy_reservation(p_actor uuid,p_id uuid,p_expected_status text,p_operation text,p_reason text,p_correlation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r reward_redemptions; prior jsonb; result jsonb; uid uuid; BEGIN
 PERFORM shop_authorize(p_actor,'cancel');
 IF nullif(trim(p_reason),'') IS NULL OR nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 THEN RAISE EXCEPTION 'Reason and operation required' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT r FROM reward_redemptions WHERE id=p_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||r.rider_id::text,0));
 SELECT * INTO STRICT r FROM reward_redemptions WHERE id=p_id FOR UPDATE;
 IF r.metadata->>'wallet_contract'='2' OR r.requested_at>(SELECT changed_at FROM shop_release_control WHERE singleton) OR EXISTS(SELECT 1 FROM fulfilment WHERE redemption_id=r.id) THEN RAISE EXCEPTION 'Use canonical fulfillment command' USING ERRCODE='22023'; END IF;
 SELECT payload INTO prior FROM platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.legacy-resolution.v1' AND key=p_operation;
 IF FOUND THEN IF prior->>'redemptionId' IS DISTINCT FROM r.id::text THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF; RETURN prior; END IF;
 IF r.status NOT IN ('requested','approved') OR r.status IS DISTINCT FROM p_expected_status THEN RAISE EXCEPTION 'Historical reservation changed or already delivered; review required' USING ERRCODE='40001'; END IF;
 PERFORM set_config('movrr.shop_command','v1',true);
 UPDATE reward_redemptions SET status='cancelled',cancelled_at=now(),metadata=metadata||jsonb_build_object('legacy_resolution_operation',p_operation) WHERE id=r.id;
 result:=jsonb_build_object('redemptionId',r.id,'status','cancelled','reservedPointsReleased',r.points_spent,'financialTransactionCreated',false);
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason) VALUES(p_actor,'admin','fulfilment.cancel','reward_redemptions',r.id::text,jsonb_build_object('status',r.status,'pointsReserved',r.points_spent),result,p_correlation,p_reason);
 SELECT user_id INTO uid FROM rider WHERE id=r.rider_id;
 INSERT INTO notifications(id,user_id,type,title,message,metadata) VALUES(gen_random_uuid(),uid,'reward','Reward request cancelled','Your historical reward reservation was cancelled. Reserved points are available again.',jsonb_build_object('redemptionId',r.id));
 INSERT INTO platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.legacy-resolution.v1',p_operation,result);
 RETURN result;
END $$;

-- Discover all due records using indexed predicates, not a latest-N list.
CREATE FUNCTION public.shop_recover(p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f record; actor uuid; count_ok integer:=0; count_failed integer:=0; BEGIN
 INSERT INTO shop_recovery(fulfilment_id,available_at)
 SELECT id,now() FROM fulfilment WHERE metadata->>'wallet_contract'='2' AND metadata->>'unwind_complete' IS DISTINCT FROM 'true' AND
 (state IN ('created','processing','reserved','failed','cancelled','expired') OR (state IN ('ready','awaiting_collection','validated') AND expires_at<=now())
 OR (state='ready' AND NOT EXISTS(SELECT 1 FROM shop_credential c WHERE c.fulfilment_id=fulfilment.id)))
 ON CONFLICT DO NOTHING;
 FOR f IN SELECT q.fulfilment_id,q.attempts FROM shop_recovery q WHERE available_at<=now() ORDER BY available_at,fulfilment_id LIMIT greatest(1,least(p_limit,100)) LOOP
  BEGIN
   -- A transaction/subtransaction retains the lease lock through the command.
   IF NOT pg_try_advisory_xact_lock(hashtextextended('wallet:'||(SELECT rider_id::text FROM fulfilment WHERE id=f.fulfilment_id),0)) THEN CONTINUE; END IF;
   PERFORM 1 FROM shop_recovery WHERE fulfilment_id=f.fulfilment_id AND available_at<=now() FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN CONTINUE; END IF;
   SELECT user_id INTO actor FROM rider WHERE id=(SELECT rider_id FROM fulfilment WHERE id=f.fulfilment_id);
   IF (SELECT state FROM fulfilment WHERE id=f.fulfilment_id) IN ('created','processing','reserved','ready') THEN
    -- Never create replacement value for unknown or unsupported old work.
    PERFORM shop_unwind(f.fulfilment_id,actor,'rider','interrupted_reward_refund','recovery:'||f.fulfilment_id::text);
   ELSIF (SELECT state FROM fulfilment WHERE id=f.fulfilment_id) NOT IN ('completed','refunded','reversed') THEN
    PERFORM shop_unwind(f.fulfilment_id,actor,'rider','expired_or_failed_reward_refund','recovery:'||f.fulfilment_id::text);
   ELSE DELETE FROM shop_recovery WHERE fulfilment_id=f.fulfilment_id;
   END IF;
   count_ok:=count_ok+1;
  EXCEPTION WHEN OTHERS THEN
   UPDATE shop_recovery SET attempts=attempts+1,available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),last_error=SQLSTATE WHERE fulfilment_id=f.fulfilment_id;
   count_failed:=count_failed+1;
  END;
 END LOOP;
 RETURN jsonb_build_object('recovered',count_ok,'failed',count_failed);
END $$;

CREATE FUNCTION public.shop_claim_outbox(p_limit integer DEFAULT 50) RETURNS SETOF public.shop_outbox
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE shop_outbox SET lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
 WHERE id IN (SELECT id FROM shop_outbox WHERE delivered_at IS NULL AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at,id LIMIT greatest(1,least(p_limit,100)) FOR UPDATE SKIP LOCKED) RETURNING *
$$;
CREATE FUNCTION public.shop_health(p_actor uuid,p_org uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE who text; result jsonb; mismatches integer; BEGIN
 who:=shop_authorize(p_actor,'read',p_org);
 result:=jsonb_build_object(
 'recoveryFailures',(SELECT count(*) FROM shop_recovery q JOIN fulfilment f ON f.id=q.fulfilment_id WHERE q.last_error IS NOT NULL AND (p_org IS NULL OR f.partner_org_id=p_org)),
 'deliveryFailures',(SELECT count(*) FROM shop_outbox o JOIN fulfilment f ON f.id=o.fulfilment_id WHERE o.last_error IS NOT NULL AND o.delivered_at IS NULL AND (p_org IS NULL OR f.partner_org_id=p_org)),
 'pendingDelivery',(SELECT count(*) FROM shop_outbox o JOIN fulfilment f ON f.id=o.fulfilment_id WHERE o.delivered_at IS NULL AND (p_org IS NULL OR f.partner_org_id=p_org)),
 'overdue',(SELECT count(*) FROM fulfilment f WHERE f.state IN ('ready','awaiting_collection','validated') AND f.expires_at<=now() AND (p_org IS NULL OR f.partner_org_id=p_org)),
 'recoveryCases',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT q.fulfilment_id AS id,q.attempts,q.available_at,q.last_error FROM shop_recovery q JOIN fulfilment f ON f.id=q.fulfilment_id WHERE (p_org IS NULL OR f.partner_org_id=p_org) ORDER BY (q.last_error IS NOT NULL) DESC,q.available_at LIMIT 50) x),'[]'::jsonb));
 IF who='admin' THEN
  result:=result||jsonb_build_object('legacyReservations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'title',r.reward_title,'status',r.status,'pointsReserved',r.points_spent)) FROM reward_redemptions r WHERE r.metadata->>'wallet_contract' IS DISTINCT FROM '2' AND r.status IN ('requested','approved') AND r.requested_at<=(SELECT changed_at FROM shop_release_control WHERE singleton)),'[]'::jsonb));
  SELECT count(*) INTO mismatches FROM rider_reward_balance b WHERE b.points_balance IS DISTINCT FROM greatest(0,
    coalesce((SELECT sum(points_earned) FROM reward_transactions t WHERE t.rider_id=b.rider_id),0)-
    coalesce((SELECT sum(points_spent) FROM reward_redemptions r WHERE r.rider_id=b.rider_id AND r.status IN ('requested','approved','fulfilled') AND r.metadata->>'wallet_contract' IS DISTINCT FROM '2'),0));
  result:=result||jsonb_build_object('walletMismatches',mismatches,
   'unpairedPaidClaims',(SELECT count(*) FROM reward_redemptions r WHERE r.metadata->>'wallet_contract'='2' AND r.points_spent>0 AND NOT EXISTS(SELECT 1 FROM reward_transactions t WHERE t.id::text=r.metadata->>'ledger_transaction_id' AND t.rider_id=r.rider_id AND t.points_earned=-r.points_spent)),
   'freeFinancialEntries',(SELECT count(*) FROM reward_transactions t JOIN reward_redemptions r ON r.id::text=t.metadata->>'redemption_id' WHERE r.metadata->>'wallet_contract'='2' AND r.points_spent=0));
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.shop_financial_receipts(p_actor uuid) RETURNS TABLE(transaction_id uuid,balance_after integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF shop_authorize(p_actor,'read')<>'admin' THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT (payload->>'transactionId')::uuid,(payload->>'balanceAfter')::integer FROM platform_idempotency_key
 WHERE scope IN ('wallet.debit.v2','wallet.refund.v2','shop.adjust.v1') AND payload->>'transactionId' IS NOT NULL AND payload->>'balanceAfter' IS NOT NULL;
END $$;
CREATE FUNCTION public.shop_deliver_notification(p_id uuid,p_lease uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o shop_outbox; uid uuid; BEGIN
 SELECT * INTO STRICT o FROM shop_outbox WHERE id=p_id FOR UPDATE;
 IF o.kind<>'notification' THEN RAISE EXCEPTION 'Notification intent required' USING ERRCODE='22023'; END IF;
 IF o.delivered_at IS NOT NULL THEN RETURN; END IF;
 IF o.lease_token IS DISTINCT FROM p_lease OR o.lease_until<now() THEN RAISE EXCEPTION 'Outbox lease lost' USING ERRCODE='40001'; END IF;
 SELECT user_id INTO STRICT uid FROM rider WHERE id=(o.payload->>'riderId')::uuid;
 INSERT INTO notifications(id,user_id,type,title,message,metadata) VALUES(o.id,uid,'reward','Reward update',
 CASE o.payload->>'state' WHEN 'completed' THEN 'Your reward is ready. Open My Rewards to view it.' WHEN 'awaiting_collection' THEN 'Your reward is ready for collection.' WHEN 'refunded' THEN 'Your reward points have been returned.' ELSE 'Your reward status has changed.' END,
 jsonb_build_object('fulfilmentId',o.fulfilment_id,'redemptionId',o.payload->>'redemptionId','state',o.payload->>'state')) ON CONFLICT(id) DO NOTHING;
 UPDATE shop_outbox SET delivered_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=p_id;
END $$;
CREATE FUNCTION public.shop_retry_outbox(p_id uuid,p_lease uuid,p_error text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE shop_outbox SET lease_token=NULL,lease_until=NULL,last_error=left(p_error,200),available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)) WHERE id=p_id AND lease_token=p_lease AND delivered_at IS NULL
$$;
CREATE FUNCTION public.shop_ack_email(p_id uuid,p_lease uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE shop_outbox SET delivered_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL
 WHERE id=p_id AND kind='email' AND lease_token=p_lease AND lease_until>=now() AND delivered_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Email delivery lease lost' USING ERRCODE='40001'; END IF;
END $$;

-- Preserve independently approved account-deletion obligations. Their existing
-- write barrier still validates the exact job, lease, table and operation.
CREATE FUNCTION public.shop_deletion_write_permitted(p_table text,p_op text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE permitted boolean; BEGIN
 IF to_regclass('public.account_deletion_write_permit') IS NULL THEN RETURN false; END IF;
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.account_deletion_write_permit WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND job_id IS NOT NULL AND $1=ANY(tables) AND $2=ANY(operations))' INTO permitted USING p_table,p_op;
 RETURN coalesce(permitted,false);
END $$;
CREATE OR REPLACE FUNCTION public.guard_shop_lifecycle_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF current_setting('movrr.shop_command',true) IS DISTINCT FROM 'v1' AND NOT public.shop_deletion_write_permitted(TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,TG_OP) THEN RAISE EXCEPTION 'Use canonical shop lifecycle command' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;

CREATE FUNCTION public.shop_import_codes(p_actor uuid,p_resource uuid,p_codes text[],p_operation text,p_correlation text,p_expires_at timestamptz DEFAULT NULL,p_partner_org uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r fulfilment_resource; who text; prior jsonb; result jsonb; fingerprint text; code text; inserted integer:=0; BEGIN
 IF p_codes IS NULL OR cardinality(p_codes) NOT BETWEEN 1 AND 1000 OR nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 THEN RAISE EXCEPTION 'Valid import required' USING ERRCODE='22023'; END IF;
 PERFORM set_config('movrr.shop_command','v1',true);
 PERFORM pg_advisory_xact_lock(hashtextextended('resource-import:'||p_resource::text,0));
 SELECT * INTO r FROM fulfilment_resource WHERE id=p_resource FOR UPDATE;
 IF NOT FOUND THEN
  who:=shop_authorize(p_actor,'cancel',p_partner_org);
  INSERT INTO fulfilment_resource(id,partner_org_id,resource_kind,name,status) VALUES(p_resource,p_partner_org,'voucher_pool','Voucher pool '||left(p_resource::text,8),'active') RETURNING * INTO r;
 ELSIF p_partner_org IS NOT NULL AND r.partner_org_id IS DISTINCT FROM p_partner_org THEN RAISE EXCEPTION 'Resource organisation mismatch' USING ERRCODE='42501'; END IF;
 who:=shop_authorize(p_actor,'cancel',r.partner_org_id);
 IF p_expires_at<=now() THEN RAISE EXCEPTION 'Voucher expiry must be in the future' USING ERRCODE='22023'; END IF;
 IF r.resource_kind<>'voucher_pool' THEN RAISE EXCEPTION 'Voucher pool required' USING ERRCODE='22023'; END IF;
 fingerprint:=encode(sha256(convert_to(array_to_json(p_codes)::text||coalesce(p_expires_at::text,''),'UTF8')),'hex');
 SELECT payload INTO prior FROM platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.import.v1' AND key=p_operation;
 IF FOUND THEN
  IF prior->>'fingerprint' IS DISTINCT FROM fingerprint OR prior->>'resourceId' IS DISTINCT FROM p_resource::text THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF;
  RETURN prior;
 END IF;
 FOREACH code IN ARRAY p_codes LOOP
  IF nullif(trim(code),'') IS NULL OR length(code)>2000 THEN RAISE EXCEPTION 'Invalid voucher code' USING ERRCODE='22023'; END IF;
  INSERT INTO fulfilment_resource_item(resource_id,external_code_hash,display_payload,status)
  VALUES(p_resource,encode(sha256(convert_to(trim(code),'UTF8')),'hex'),jsonb_strip_nulls(jsonb_build_object('code',trim(code),'expiresAt',p_expires_at)),'available') ON CONFLICT DO NOTHING;
  IF FOUND THEN inserted:=inserted+1; END IF;
 END LOOP;
 result:=jsonb_build_object('resourceId',p_resource,'imported',inserted,'fingerprint',fingerprint);
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,resulting_state,correlation_id,reason) VALUES(p_actor,who,'resources.manage','fulfilment_resource',p_resource::text,result,p_correlation,'voucher_import');
 INSERT INTO platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.import.v1',p_operation,result);
 RETURN result;
END $$;

CREATE FUNCTION public.shop_save_catalog(p_actor uuid,p_id uuid,p_payload jsonb,p_expected timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old reward_catalog; c reward_catalog; editor uuid; rid uuid; who text; target_org uuid; allowed text[]:=ARRAY['sku','title','description','category','status','points_price','partner_id','partner_url','thumbnail_url','gallery_urls','inventory_type','inventory_count','max_per_rider','featured_rank','is_featured','visibility_rules','tags','fulfilment_type','resource_id','published_at','updated_at']; BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Unexpected catalog field' USING ERRCODE='22023'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO STRICT old FROM reward_catalog WHERE id=p_id FOR UPDATE;
  IF p_expected IS NOT NULL AND old.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Catalog changed' USING ERRCODE='40001'; END IF;
  c:=jsonb_populate_record(old,p_payload);rid:=p_id;
 ELSE
  c:=jsonb_populate_record(NULL::reward_catalog,jsonb_build_object('status','draft','inventory_type','unlimited','gallery_urls','[]'::jsonb,'is_featured',false,'visibility_rules','{}'::jsonb,'tags','[]'::jsonb)||p_payload);rid:=gen_random_uuid();
  IF c.status='active' THEN RAISE EXCEPTION 'Create draft before independent approval' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT organisation_id INTO target_org FROM reward_partner WHERE id=c.partner_id;
 who:=shop_authorize(p_actor,'cancel',target_org);
 IF who='organisation' AND (c.status='active' OR (p_id IS NOT NULL AND old.partner_id IS DISTINCT FROM c.partner_id)) THEN RAISE EXCEPTION 'Admin approval required; save as draft' USING ERRCODE='42501'; END IF;
 IF c.resource_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fulfilment_resource r WHERE r.id=c.resource_id AND (r.partner_org_id=target_org OR (r.partner_org_id IS NULL AND who='admin'))) THEN RAISE EXCEPTION 'Resource organisation mismatch' USING ERRCODE='42501'; END IF;
 IF c.points_price<0 OR c.inventory_type NOT IN ('limited','unlimited') OR (c.inventory_type='limited' AND coalesce(c.inventory_count,-1)<0) THEN RAISE EXCEPTION 'Invalid catalog pricing or stock' USING ERRCODE='22023'; END IF;
 IF c.status='active' AND old.status='active' AND (c.points_price,c.resource_id,c.fulfilment_type,c.partner_id,c.visibility_rules,c.title,c.description,c.sku,c.inventory_type) IS DISTINCT FROM (old.points_price,old.resource_id,old.fulfilment_type,old.partner_id,old.visibility_rules,old.title,old.description,old.sku,old.inventory_type) THEN RAISE EXCEPTION 'Save material reward changes as draft for independent approval' USING ERRCODE='42501'; END IF;
 IF c.status='active' THEN
  SELECT actor_id INTO editor FROM shop_catalog_editor WHERE catalog_id=rid;
  IF editor=p_actor THEN RAISE EXCEPTION 'Independent catalog approval required' USING ERRCODE='42501'; END IF;
  IF c.fulfilment_type NOT IN ('instant_digital','qr_barcode') OR c.visibility_rules<>'{}'::jsonb OR
    NOT EXISTS(SELECT 1 FROM fulfilment_resource r WHERE r.id=c.resource_id AND r.status='active' AND r.resource_kind='voucher_pool') THEN RAISE EXCEPTION 'Reward is not launch deliverable' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM set_config('movrr.shop_catalog_command','v1',true);
 INSERT INTO reward_catalog(id,sku,title,description,category,status,points_price,partner_id,partner_url,thumbnail_url,gallery_urls,inventory_type,inventory_count,max_per_rider,featured_rank,is_featured,visibility_rules,tags,fulfilment_type,resource_id,published_at,created_at,updated_at)
 VALUES(rid,c.sku,c.title,c.description,c.category,c.status,c.points_price,c.partner_id,c.partner_url,c.thumbnail_url,coalesce(c.gallery_urls,'[]'),c.inventory_type,c.inventory_count,c.max_per_rider,c.featured_rank,coalesce(c.is_featured,false),coalesce(c.visibility_rules,'{}'),coalesce(c.tags,'{}'),c.fulfilment_type,c.resource_id,c.published_at,coalesce(old.created_at,now()),now())
 ON CONFLICT(id) DO UPDATE SET sku=EXCLUDED.sku,title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,status=EXCLUDED.status,points_price=EXCLUDED.points_price,partner_id=EXCLUDED.partner_id,partner_url=EXCLUDED.partner_url,thumbnail_url=EXCLUDED.thumbnail_url,gallery_urls=EXCLUDED.gallery_urls,inventory_type=EXCLUDED.inventory_type,inventory_count=EXCLUDED.inventory_count,max_per_rider=EXCLUDED.max_per_rider,featured_rank=EXCLUDED.featured_rank,is_featured=EXCLUDED.is_featured,visibility_rules=EXCLUDED.visibility_rules,tags=EXCLUDED.tags,fulfilment_type=EXCLUDED.fulfilment_type,resource_id=EXCLUDED.resource_id,published_at=EXCLUDED.published_at,updated_at=EXCLUDED.updated_at RETURNING * INTO c;
 IF c.status<>'active' THEN INSERT INTO shop_catalog_editor VALUES(rid,p_actor) ON CONFLICT(catalog_id) DO UPDATE SET actor_id=p_actor; END IF;
 INSERT INTO platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason)
 VALUES(p_actor,who,'rewards.manage','reward_catalog',rid::text,to_jsonb(old),to_jsonb(c),'catalog:'||gen_random_uuid()::text,'catalog_change');
 RETURN to_jsonb(c);
END $$;
CREATE FUNCTION public.shop_guard_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF current_setting('movrr.shop_command',true) IS DISTINCT FROM 'v1' AND current_setting('movrr.shop_catalog_command',true) IS DISTINCT FROM 'v1' AND NOT public.shop_deletion_write_permitted(TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,TG_OP) THEN RAISE EXCEPTION 'Use audited catalog command' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive catalog records instead' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shop_catalog_command_only BEFORE INSERT OR UPDATE OR DELETE ON public.reward_catalog FOR EACH ROW EXECUTE FUNCTION public.shop_guard_catalog();

-- Internal helpers and old financial/allocation primitives are not standalone APIs.
REVOKE ALL ON FUNCTION public.wallet_settle_refund(uuid,integer,uuid,text,text,text),public.allocate_reward_resource(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'shop\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
  IF f.proname IN ('shop_catalog','shop_redeem','shop_get_credential','shop_fulfilment_command','shop_adjust_points','shop_recover','shop_claim_outbox','shop_deliver_notification','shop_retry_outbox','shop_ack_email','shop_save_catalog','shop_import_codes','shop_health','shop_financial_receipts','shop_cancel_legacy_reservation') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig); END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.shop_public_catalog_visible(uuid) TO anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
