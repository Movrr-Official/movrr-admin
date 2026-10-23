-- P1: one refund writer for canonical and explicitly reconciled historical debits.
-- Installs contracts only. Does not settle any production obligation or enable Shop.
BEGIN;
CREATE TABLE public.shop_legacy_debit_binding (
 redemption_id uuid PRIMARY KEY REFERENCES public.reward_redemptions(id),
 debit_id uuid UNIQUE NOT NULL REFERENCES public.reward_transactions(id),
 verified_by uuid NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_legacy_debit_binding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_legacy_debit_binding FROM PUBLIC,anon,authenticated,service_role;

-- The only refund ledger INSERT. Both lifecycle adapters delegate here.
CREATE FUNCTION public.wallet_settle_refund_entry(p_rider uuid,p_redemption uuid,p_debit uuid,p_points integer,p_operation text,p_reason text,p_correlation text,p_fulfilment uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.reward_transactions; r public.reward_redemptions; prior jsonb; refunded bigint; tid uuid; result jsonb;
BEGIN
 IF p_points IS NULL OR p_points<=0 OR length(trim(p_operation)) NOT BETWEEN 1 AND 200 OR p_operation IS NULL OR nullif(trim(p_reason),'') IS NULL OR nullif(trim(p_correlation),'') IS NULL THEN RAISE EXCEPTION 'Valid refund operation, amount, reason and correlation required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||p_rider::text,0));
 PERFORM 1 FROM public.rider_reward_balance WHERE rider_id=p_rider FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Wallet required' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT r FROM public.reward_redemptions WHERE id=p_redemption AND rider_id=p_rider FOR UPDATE;
 SELECT * INTO STRICT d FROM public.reward_transactions WHERE id=p_debit AND rider_id=p_rider;
 IF d.source<>'redemption' OR d.points_earned>=0 OR -d.points_earned<>r.points_spent THEN RAISE EXCEPTION 'Original committed debit required' USING ERRCODE='22023'; END IF;
 IF p_fulfilment IS NULL THEN
  IF r.status<>'cancelled' OR NOT EXISTS(SELECT 1 FROM public.shop_legacy_debit_binding WHERE redemption_id=r.id AND debit_id=d.id) OR EXISTS(SELECT 1 FROM public.fulfilment WHERE redemption_id=r.id) THEN RAISE EXCEPTION 'Explicit historical reconciliation required' USING ERRCODE='22023'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.fulfilment f WHERE f.id=p_fulfilment AND f.redemption_id=r.id AND f.rider_id=p_rider AND f.state IN ('cancelled','failed','expired','refunded')) OR d.metadata->>'redemption_id' IS DISTINCT FROM r.id::text OR d.metadata->>'wallet_contract' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Fulfilment is not refundable' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT payload INTO prior FROM public.platform_idempotency_key WHERE principal_id=p_rider::text AND scope='wallet.refund.v2' AND key=p_operation;
 IF FOUND THEN
  IF prior->>'originalDebitId' IS DISTINCT FROM d.id::text OR (prior->>'points')::integer<>p_points OR prior->>'fulfilmentId' IS DISTINCT FROM p_fulfilment::text THEN RAISE EXCEPTION 'Refund operation identifier reused with different parameters' USING ERRCODE='22023'; END IF;
  RETURN prior;
 END IF;
 IF EXISTS(SELECT 1 FROM public.reward_transactions t WHERE (t.metadata->>'original_debit_id'=d.id::text OR t.points_earned>0 AND t.metadata->>'redemption_id'=r.id::text) AND (t.rider_id<>p_rider OR t.metadata->>'settlement_kind' IS DISTINCT FROM 'compensating_refund' OR t.metadata->>'original_debit_id' IS DISTINCT FROM d.id::text OR t.points_earned<=0)) THEN RAISE EXCEPTION 'Unclassified historical credit requires reconciliation' USING ERRCODE='22023'; END IF;
 SELECT coalesce(sum(points_earned),0) INTO refunded FROM public.reward_transactions WHERE rider_id=p_rider AND metadata->>'original_debit_id'=d.id::text AND metadata->>'settlement_kind'='compensating_refund';
 IF refunded<0 OR p_points>(-d.points_earned)-refunded THEN RAISE EXCEPTION 'Refund exceeds remaining refundable amount' USING ERRCODE='22023'; END IF;
 INSERT INTO public.reward_transactions(rider_id,points_earned,source,metadata)
 VALUES(p_rider,p_points,'adjustment',jsonb_build_object('wallet_contract',2,'wallet_operation_id','refund:'||p_operation,'settlement_kind','compensating_refund','original_debit_id',d.id,'redemption_id',r.id,'fulfilment_id',p_fulfilment,'reason',p_reason,'correlation_id',p_correlation,'adjustment_direction','credit')) RETURNING id INTO tid;
 result:=jsonb_build_object('transactionId',tid,'balanceAfter',(SELECT points_balance FROM public.rider_reward_balance WHERE rider_id=p_rider),'fulfilmentId',p_fulfilment,'redemptionId',r.id,'points',p_points,'originalDebitId',d.id);
 INSERT INTO public.platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_rider::text,'wallet.refund.v2',p_operation,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_settle_refund(p_rider_id uuid,p_points integer,p_fulfilment_id uuid,p_operation_id text,p_reason text,p_correlation_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.fulfilment; debit uuid; candidates integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||p_rider_id::text,0));
 PERFORM 1 FROM public.rider_reward_balance WHERE rider_id=p_rider_id FOR UPDATE;
 SELECT * INTO f FROM public.fulfilment WHERE id=p_fulfilment_id AND rider_id=p_rider_id FOR UPDATE;
 IF NOT FOUND OR f.state NOT IN ('failed','cancelled','expired','refunded') THEN RAISE EXCEPTION 'Fulfilment is not refundable' USING ERRCODE='22023'; END IF;
 SELECT count(*),(array_agg(id))[1] INTO candidates,debit FROM public.reward_transactions WHERE rider_id=p_rider_id AND metadata->>'wallet_contract'='2' AND metadata->>'settlement_kind'='debit' AND metadata->>'redemption_id'=f.redemption_id::text;
 IF candidates<>1 THEN RAISE EXCEPTION 'Original committed debit required' USING ERRCODE='22023'; END IF;
 RETURN public.wallet_settle_refund_entry(p_rider_id,f.redemption_id,debit,p_points,p_operation_id,p_reason,p_correlation_id,p_fulfilment_id);
END $$;

-- Evidence candidates are read-only. Historical timestamp matching never authorizes a credit.
CREATE FUNCTION public.shop_redemption_debits(p_id uuid) RETURNS SETOF public.reward_transactions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT t.* FROM public.reward_transactions t JOIN public.reward_redemptions r ON r.id=p_id AND r.rider_id=t.rider_id
 WHERE t.points_earned<0 AND (
  t.metadata->>'redemption_id'=r.id::text OR t.id::text=r.metadata->>'ledger_transaction_id' OR
  EXISTS(SELECT 1 FROM public.shop_legacy_debit_binding b WHERE b.redemption_id=r.id AND b.debit_id=t.id) OR
  (t.source='redemption' AND r.metadata->>'wallet_contract' IS DISTINCT FROM '2' AND t.created_at=r.requested_at AND t.metadata->>'reward_id'=r.reward_id::text AND t.metadata->>'reward_sku'=r.reward_sku))
$$;

CREATE FUNCTION public.shop_redemption_financials(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.reward_redemptions; d public.reward_transactions; n integer; charged integer; refunded integer; actor text; safe_reason text; cancelled boolean; verified boolean; unclassified boolean:=false;
BEGIN
 SELECT * INTO STRICT r FROM public.reward_redemptions WHERE id=p_id;
 SELECT count(*) INTO n FROM public.shop_redemption_debits(r.id);
 cancelled:=r.status IN ('cancelled','rejected');
 IF n=1 THEN
  SELECT * INTO d FROM public.shop_redemption_debits(r.id);
  charged:=-d.points_earned;
  SELECT coalesce(sum(points_earned),0)::integer INTO refunded FROM public.reward_transactions WHERE rider_id=r.rider_id AND metadata->>'original_debit_id'=d.id::text AND metadata->>'settlement_kind'='compensating_refund';
  verified:=d.source='redemption' AND (d.metadata->>'redemption_id'=r.id::text OR EXISTS(SELECT 1 FROM public.shop_legacy_debit_binding WHERE redemption_id=r.id AND debit_id=d.id));
  SELECT EXISTS(SELECT 1 FROM public.reward_transactions t WHERE (t.metadata->>'original_debit_id'=d.id::text OR t.points_earned>0 AND t.metadata->>'redemption_id'=r.id::text) AND (t.rider_id<>r.rider_id OR t.metadata->>'settlement_kind' IS DISTINCT FROM 'compensating_refund' OR t.metadata->>'original_debit_id' IS DISTINCT FROM d.id::text OR t.points_earned<=0)) INTO unclassified;
 ELSIF n=0 THEN charged:=0;refunded:=0;verified:=true;
 ELSE charged:=NULL;refunded:=NULL;verified:=false; END IF;
 SELECT CASE a.principal_type WHEN 'organisation' THEN 'merchant' WHEN 'admin' THEN 'admin' ELSE 'system' END INTO actor FROM public.platform_audit_record a
 WHERE (a.target_entity_type='reward_redemptions' AND a.target_entity_id=r.id::text OR a.target_entity_type='fulfilment' AND a.target_entity_id IN(SELECT id::text FROM public.fulfilment WHERE redemption_id=r.id)) AND a.capability='fulfilment.cancelled'
 OR a.target_entity_type='reward_redemptions' AND a.target_entity_id=r.id::text AND a.capability='fulfilment.cancel'
 ORDER BY a.created_at,a.id LIMIT 1;
 -- Internal operator reasons are not rider-safe. Only explicitly curated copy is exposed.
 safe_reason:=nullif(r.metadata->>'rider_cancellation_reason','');
 RETURN jsonb_build_object('redemptionStatus',r.status,'originalPointsCharged',charged,'pointsRefunded',refunded,
  'reservationReleased',CASE WHEN cancelled AND r.metadata->>'wallet_contract' IS DISTINCT FROM '2' THEN r.points_spent ELSE 0 END,
  'outstandingRefund',CASE WHEN cancelled AND charged IS NOT NULL THEN greatest(0,charged-refunded) WHEN cancelled THEN NULL ELSE 0 END,
  'netPointsSpent',charged-refunded,'cancellationActor',actor,'cancellationReason',safe_reason,
  'reconciliationRequired',NOT coalesce(verified,false) OR n>1 OR refunded>charged OR charged<>r.points_spent AND charged>0 OR unclassified,
  'state',CASE WHEN n>1 OR refunded>charged OR charged<>r.points_spent AND charged>0 OR unclassified THEN 'reconciliation_required' WHEN cancelled AND charged>refunded THEN 'refund_outstanding' WHEN cancelled AND refunded>0 THEN 'refunded' WHEN cancelled THEN 'reservation_released' ELSE 'charged' END);
END $$;

CREATE FUNCTION public.shop_redemption_financials_many(p_ids uuid[]) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(id::text,public.shop_redemption_financials(id)),'{}'::jsonb) FROM unnest(p_ids[1:500]) id
$$;
REVOKE ALL ON FUNCTION public.shop_redemption_financials_many(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shop_redemption_financials_many(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.shop_cancel_legacy_reservation(p_actor uuid,p_id uuid,p_expected_status text,p_operation text,p_reason text,p_correlation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.reward_redemptions; d public.reward_transactions; prior jsonb; result jsonb; n integer; refunded integer; remaining integer; receipt jsonb; uid uuid;
BEGIN
 IF public.shop_authorize(p_actor,'cancel')<>'admin' THEN RAISE EXCEPTION 'Historical reservations require staff review' USING ERRCODE='42501'; END IF;
 IF nullif(trim(p_reason),'') IS NULL OR nullif(trim(p_correlation),'') IS NULL OR nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 THEN RAISE EXCEPTION 'Reason, correlation and operation required' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT r FROM public.reward_redemptions WHERE id=p_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||r.rider_id::text,0));
 PERFORM 1 FROM public.rider_reward_balance WHERE rider_id=r.rider_id FOR UPDATE;
 SELECT * INTO STRICT r FROM public.reward_redemptions WHERE id=p_id FOR UPDATE;
 IF r.metadata->>'wallet_contract'='2' OR r.requested_at>(SELECT containment_at FROM public.shop_release_control WHERE singleton) OR EXISTS(SELECT 1 FROM public.fulfilment WHERE redemption_id=r.id) THEN RAISE EXCEPTION 'Use canonical fulfillment command' USING ERRCODE='22023'; END IF;
 SELECT payload INTO prior FROM public.platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.legacy-resolution.v1' AND key=p_operation;
 IF FOUND THEN IF prior->>'redemptionId' IS DISTINCT FROM r.id::text THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='22023'; END IF;RETURN prior;END IF;
 IF r.status NOT IN ('requested','approved','cancelled') OR r.status IS DISTINCT FROM p_expected_status THEN RAISE EXCEPTION 'Historical reservation changed or already delivered; review required' USING ERRCODE='40001'; END IF;
 SELECT count(*) INTO n FROM public.shop_redemption_debits(r.id);
 IF n>1 THEN RAISE EXCEPTION 'Ambiguous historical debits; explicit reconciliation required' USING ERRCODE='22023'; END IF;
 IF n=1 THEN
  SELECT * INTO d FROM public.shop_redemption_debits(r.id);
  IF NOT EXISTS(SELECT 1 FROM public.shop_legacy_debit_binding WHERE redemption_id=r.id AND debit_id=d.id) THEN RAISE EXCEPTION 'Explicit debit reconciliation required before cancellation/refund' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM set_config('movrr.shop_command','v1',true);
 UPDATE public.reward_redemptions SET status='cancelled',cancelled_at=coalesce(cancelled_at,now()) WHERE id=r.id;
 IF n=1 THEN
  SELECT coalesce(sum(points_earned),0)::integer INTO refunded FROM public.reward_transactions WHERE rider_id=r.rider_id AND metadata->>'original_debit_id'=d.id::text AND metadata->>'settlement_kind'='compensating_refund';
  remaining:=-d.points_earned-refunded;
  IF remaining<0 THEN RAISE EXCEPTION 'Historical refund exceeds debit' USING ERRCODE='22023'; END IF;
  IF remaining>0 THEN receipt:=public.wallet_settle_refund_entry(r.rider_id,r.id,d.id,remaining,'legacy-refund:'||r.id::text,p_reason,p_correlation,NULL); END IF;
 END IF;
 result:=jsonb_build_object('redemptionId',r.id,'status','cancelled','reservedPointsReleased',CASE WHEN r.status<>'cancelled' THEN r.points_spent ELSE 0 END,'financialTransactionCreated',receipt IS NOT NULL,'refund',receipt,'financial',public.shop_redemption_financials(r.id)||jsonb_build_object('cancellationActor',coalesce(public.shop_redemption_financials(r.id)->>'cancellationActor','admin')));
 INSERT INTO public.platform_audit_record(actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason) VALUES(p_actor,'admin',CASE WHEN r.status='cancelled' THEN 'fulfilment.refund' ELSE 'fulfilment.cancel' END,'reward_redemptions',r.id::text,jsonb_build_object('status',r.status),result,p_correlation,p_reason);
 SELECT user_id INTO STRICT uid FROM public.rider WHERE id=r.rider_id;
 -- Stable notification id per financial outcome; same operation never creates a duplicate.
 IF r.status<>'cancelled' OR receipt IS NOT NULL THEN
  INSERT INTO public.notifications(id,user_id,type,title,message,metadata) VALUES(gen_random_uuid(),uid,'reward',CASE WHEN receipt IS NOT NULL THEN 'Reward points refunded' ELSE 'Reward request cancelled' END,
   CASE WHEN receipt IS NOT NULL THEN format('%s MOVRR Points refunded.',remaining) ELSE 'Your reward request was cancelled. Reserved points have been released.' END,
   jsonb_build_object('redemptionId',r.id,'event',CASE WHEN receipt IS NOT NULL THEN 'redemption_refunded' ELSE 'redemption_cancelled' END,'financial',public.shop_redemption_financials(r.id),'refundTransactionId',receipt->>'transactionId'));
 END IF;
 INSERT INTO public.platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.legacy-resolution.v1',p_operation,result);
 RETURN result;
END $$;

CREATE FUNCTION public.shop_reconcile_legacy_refund(p_actor uuid,p_id uuid,p_debit uuid,p_expected_status text,p_expected_points integer,p_operation text,p_reason text,p_correlation text,p_expected_refunded integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.reward_redemptions; d public.reward_transactions; bound uuid; matches integer; prior jsonb; result jsonb; refunded integer; internal_operation text;
BEGIN
 IF public.shop_authorize(p_actor,'refund')<>'admin' THEN RAISE EXCEPTION 'Explicit staff reconciliation required' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT r FROM public.reward_redemptions WHERE id=p_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||r.rider_id::text,0));
 PERFORM 1 FROM public.rider_reward_balance WHERE rider_id=r.rider_id FOR UPDATE;
 SELECT * INTO STRICT r FROM public.reward_redemptions WHERE id=p_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.shop_redemption_debits(r.id) WHERE id=p_debit;
 SELECT count(*) INTO matches FROM public.shop_redemption_debits(r.id);
 IF matches<>1 OR p_expected_points IS DISTINCT FROM -d.points_earned OR p_expected_points IS DISTINCT FROM r.points_spent OR r.metadata->>'wallet_contract'='2' THEN RAISE EXCEPTION 'Ambiguous or unsupported historical debit' USING ERRCODE='22023'; END IF;
 IF nullif(trim(p_operation),'') IS NULL OR length(p_operation)>200 OR nullif(trim(p_reason),'') IS NULL OR nullif(trim(p_correlation),'') IS NULL THEN RAISE EXCEPTION 'Operation, reason and correlation required' USING ERRCODE='22023'; END IF;
 SELECT payload INTO prior FROM public.platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.legacy-reconciliation.v1' AND key=p_operation;
 IF FOUND THEN
  IF prior->>'redemptionId' IS DISTINCT FROM r.id::text OR prior->>'verifiedDebitId' IS DISTINCT FROM d.id::text OR (prior->>'expectedRefunded')::integer IS DISTINCT FROM p_expected_refunded THEN RAISE EXCEPTION 'Reconciliation operation reused' USING ERRCODE='22023'; END IF;
  RETURN prior;
 END IF;
 SELECT coalesce(sum(points_earned),0)::integer INTO refunded FROM public.reward_transactions WHERE rider_id=r.rider_id AND metadata->>'original_debit_id'=d.id::text AND metadata->>'settlement_kind'='compensating_refund';
 IF refunded IS DISTINCT FROM p_expected_refunded OR refunded>=-d.points_earned THEN RAISE EXCEPTION 'Refund evidence changed; explicit reconciliation required' USING ERRCODE='40001'; END IF;
 -- Reject a debit that could also belong to another historical redemption.
 IF EXISTS(SELECT 1 FROM public.reward_redemptions x WHERE x.id<>r.id AND x.rider_id=r.rider_id AND (d.metadata->>'redemption_id'=x.id::text OR d.id::text=x.metadata->>'ledger_transaction_id' OR (x.requested_at=d.created_at AND x.reward_id::text=d.metadata->>'reward_id' AND x.points_spent=-d.points_earned))) THEN RAISE EXCEPTION 'Debit ownership is ambiguous' USING ERRCODE='22023'; END IF;
 SELECT debit_id INTO bound FROM public.shop_legacy_debit_binding WHERE redemption_id=r.id;
 IF bound IS NOT NULL AND bound<>d.id THEN RAISE EXCEPTION 'Reconciliation binding changed' USING ERRCODE='40001'; END IF;
 INSERT INTO public.shop_legacy_debit_binding(redemption_id,debit_id,verified_by,reason) VALUES(r.id,d.id,p_actor,p_reason) ON CONFLICT(redemption_id) DO NOTHING;
 internal_operation:='reconcile:'||encode(sha256(convert_to(p_actor::text||':'||r.id::text||':'||p_operation,'UTF8')),'hex');
 result:=public.shop_cancel_legacy_reservation(p_actor,r.id,p_expected_status,internal_operation,p_reason,p_correlation);
 IF (public.shop_redemption_financials(r.id)->>'outstandingRefund')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Refund did not reconcile' USING ERRCODE='40001'; END IF;
 result:=result||jsonb_build_object('verifiedDebitId',d.id,'expectedRefunded',p_expected_refunded);
 INSERT INTO public.platform_idempotency_key(principal_id,scope,key,payload) VALUES(p_actor::text,'shop.legacy-reconciliation.v1',p_operation,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.wallet_settle_refund_entry(uuid,uuid,uuid,integer,text,text,text,uuid),public.shop_redemption_debits(uuid),public.shop_redemption_financials(uuid),public.shop_reconcile_legacy_refund(uuid,uuid,uuid,text,integer,text,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.shop_redemption_financials(uuid),public.shop_reconcile_legacy_refund(uuid,uuid,uuid,text,integer,text,text,text,integer) TO service_role;

-- Explicitly labelled rider copy is separate from internal audit reasons.
CREATE FUNCTION public.shop_fulfilment_command_with_feedback(p_actor uuid,p_id uuid,p_action text,p_version integer,p_operation text,p_reason text,p_correlation text,p_token text,p_rider_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; rid uuid; prior boolean; BEGIN
 IF p_rider_reason IS NOT NULL AND (length(trim(p_rider_reason))<1 OR length(p_rider_reason)>1000) THEN RAISE EXCEPTION 'Invalid rider cancellation reason' USING ERRCODE='22023'; END IF;
 -- Commands retain all existing scope checks, lock ordering, receipts and version checks.
 IF p_id IS NOT NULL THEN
  SELECT rider_id INTO rid FROM public.fulfilment WHERE id=p_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||rid::text,0));
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.platform_idempotency_key WHERE principal_id=p_actor::text AND scope='shop.command.v1' AND key=p_operation) INTO prior;
 result:=public.shop_fulfilment_command(p_actor,p_id,p_action,p_version,p_operation,p_reason,p_correlation,p_token);
 IF NOT prior AND p_action IN ('cancel','refund') AND p_rider_reason IS NOT NULL THEN
  PERFORM set_config('movrr.shop_command','v1',true);
  UPDATE public.reward_redemptions SET metadata=metadata||jsonb_build_object('rider_cancellation_reason',trim(p_rider_reason)) WHERE id=(SELECT redemption_id FROM public.fulfilment WHERE id=p_id);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.shop_fulfilment_command_with_feedback(uuid,uuid,text,integer,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shop_fulfilment_command_with_feedback(uuid,uuid,text,integer,text,text,text,text,text) TO service_role;

-- Refund lifecycle notifications own refund copy; suppress the generic earnings
-- trigger for these same ledger entries when that trigger exists.
DO $$ DECLARE body text; BEGIN
 IF to_regprocedure('public.notify_reward_transaction()') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.notify_reward_transaction()'::regprocedure) INTO body;
  EXECUTE regexp_replace(body,'BEGIN','BEGIN IF NEW.metadata->>''settlement_kind''=''compensating_refund'' THEN RETURN NEW; END IF;','i');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.shop_deliver_notification(p_id uuid,p_lease uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.shop_outbox; uid uuid; financial jsonb; BEGIN
 SELECT * INTO STRICT o FROM public.shop_outbox WHERE id=p_id FOR UPDATE;
 IF o.kind<>'notification' THEN RAISE EXCEPTION 'Notification intent required' USING ERRCODE='22023'; END IF;
 IF o.delivered_at IS NOT NULL THEN RETURN; END IF;
 IF o.lease_token IS DISTINCT FROM p_lease OR o.lease_until<now() THEN RAISE EXCEPTION 'Outbox lease lost' USING ERRCODE='40001'; END IF;
 SELECT user_id INTO STRICT uid FROM public.rider WHERE id=(o.payload->>'riderId')::uuid;
 financial:=public.shop_redemption_financials((o.payload->>'redemptionId')::uuid);
 -- Cancellation and its atomic refund produce one rider-facing outcome.
 IF NOT(o.payload->>'state'='cancelled' AND EXISTS(SELECT 1 FROM public.shop_outbox x WHERE x.fulfilment_id=o.fulfilment_id AND x.kind='notification' AND x.payload->>'state'='refunded' AND x.version=o.version+1)) THEN
  INSERT INTO public.notifications(id,user_id,type,title,message,metadata) VALUES(o.id,uid,'reward',CASE WHEN o.payload->>'state'='refunded' THEN 'Reward points refunded' WHEN o.payload->>'state'='cancelled' THEN 'Reward cancelled' ELSE 'Reward update' END,
   CASE o.payload->>'state' WHEN 'refunded' THEN format('%s MOVRR Points refunded.',financial->>'pointsRefunded') WHEN 'cancelled' THEN 'Your reward was cancelled. Open My Rewards for its financial status.' WHEN 'completed' THEN 'Your reward is ready. Open My Rewards to view it.' WHEN 'awaiting_collection' THEN 'Your reward is ready for collection.' ELSE 'Your reward status has changed.' END,
   jsonb_build_object('fulfilmentId',o.fulfilment_id,'redemptionId',o.payload->>'redemptionId','state',o.payload->>'state','event','redemption_'||(o.payload->>'state'),'financial',financial)) ON CONFLICT(id) DO NOTHING;
 END IF;
 UPDATE public.shop_outbox SET delivered_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=p_id;
END $$;

-- Existing realtime infrastructure only; no new extension, provider or secret.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
 END IF;
END $$;
COMMIT;
