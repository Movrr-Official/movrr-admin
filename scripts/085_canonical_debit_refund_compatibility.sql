-- Follow-up to 083. The deployed 051 writer records v2 debits as adjustment.
-- Accept only a fully bound canonical debit; historical adjustment entries still
-- require manual review and cannot authorize refunds. No ledger/data mutation.
-- Reproduction: Mobile npm run test:shop-acceptance (051/083/084/085).
-- Existing 083 ownership and ACLs are preserved; abort instead of creating a
-- missing SECURITY DEFINER function with default PUBLIC execution privileges.
BEGIN;
DO $preflight$
DECLARE refund oid; financial oid;
BEGIN
 refund:=to_regprocedure('public.wallet_settle_refund_entry(uuid,uuid,uuid,integer,text,text,text,uuid)');
 financial:=to_regprocedure('public.shop_redemption_financials(uuid)');
 IF refund IS NULL OR financial IS NULL THEN
  RAISE EXCEPTION '085 requires the existing 083 refund and financial read contracts';
 END IF;
 IF has_function_privilege('anon',refund,'EXECUTE') OR has_function_privilege('authenticated',refund,'EXECUTE')
    OR has_function_privilege('service_role',refund,'EXECUTE')
    OR has_function_privilege('anon',financial,'EXECUTE') OR has_function_privilege('authenticated',financial,'EXECUTE')
    OR NOT has_function_privilege('service_role',financial,'EXECUTE') THEN
  RAISE EXCEPTION '085 requires the restricted 083 execution privileges';
 END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.wallet_settle_refund_entry(p_rider uuid,p_redemption uuid,p_debit uuid,p_points integer,p_operation text,p_reason text,p_correlation text,p_fulfilment uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.reward_transactions; r public.reward_redemptions; prior jsonb; refunded bigint; tid uuid; result jsonb;
BEGIN
 IF p_points IS NULL OR p_points<=0 OR length(trim(p_operation)) NOT BETWEEN 1 AND 200 OR p_operation IS NULL OR nullif(trim(p_reason),'') IS NULL OR nullif(trim(p_correlation),'') IS NULL THEN RAISE EXCEPTION 'Valid refund operation, amount, reason and correlation required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet:'||p_rider::text,0));
 PERFORM 1 FROM public.rider_reward_balance WHERE rider_id=p_rider FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Wallet required' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT r FROM public.reward_redemptions WHERE id=p_redemption AND rider_id=p_rider FOR UPDATE;
 SELECT * INTO STRICT d FROM public.reward_transactions WHERE id=p_debit AND rider_id=p_rider;
 IF NOT coalesce(d.source='redemption' OR (p_fulfilment IS NOT NULL AND d.source='adjustment' AND r.metadata->>'wallet_contract'='2'
    AND d.metadata->>'wallet_contract'='2' AND d.metadata->>'settlement_kind'='debit'
    AND d.metadata->>'redemption_id'=r.id::text AND r.metadata->>'ledger_transaction_id'=d.id::text AND d.metadata->>'fulfilment_id'=p_fulfilment::text),false) OR d.points_earned>=0 OR -d.points_earned<>r.points_spent THEN RAISE EXCEPTION 'Original committed debit required' USING ERRCODE='22023'; END IF;
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

CREATE OR REPLACE FUNCTION public.shop_redemption_financials(p_id uuid) RETURNS jsonb
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
  verified:=(d.source='redemption' AND (d.metadata->>'redemption_id'=r.id::text OR EXISTS(SELECT 1 FROM public.shop_legacy_debit_binding WHERE redemption_id=r.id AND debit_id=d.id))) OR (d.source='adjustment' AND r.metadata->>'wallet_contract'='2'
    AND d.metadata->>'wallet_contract'='2' AND d.metadata->>'settlement_kind'='debit'
    AND d.metadata->>'redemption_id'=r.id::text AND r.metadata->>'ledger_transaction_id'=d.id::text AND EXISTS(SELECT 1 FROM public.fulfilment f WHERE f.id::text=d.metadata->>'fulfilment_id' AND f.redemption_id=r.id AND f.rider_id=r.rider_id));
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
COMMIT;
