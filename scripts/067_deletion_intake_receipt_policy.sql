-- Owner-approved intake receipt policy only. No erasure/retention-execution approvals.
-- Approval record: docs/operations/deletion-intake-separation.md, 20 October 2026.
-- Preserve immutable v1 and all existing request/receipt/evidence records.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regprocedure('public.account_deletion_intake_ready(integer)') IS NULL THEN RAISE EXCEPTION 'Apply intake separation 066 first';END IF;
 PERFORM 1 FROM public.account_deletion_contract_gate WHERE singleton FOR UPDATE;
 IF (SELECT count(*) FROM public.account_deletion_contract_gate)<>1 OR NOT EXISTS(
  SELECT 1 FROM public.account_deletion_contract_gate WHERE singleton AND operating_state='disabled'
  AND operating_version=0 AND active_policy_version=1 AND NOT managed_resources_execution_enabled
 ) THEN RAISE EXCEPTION 'Unexpected operating baseline; no policy publication performed';END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_policy_version WHERE version=2)
 OR NOT EXISTS(SELECT 1 FROM public.account_deletion_policy_version WHERE version=1 AND contract_version=1 AND technical_status='approved')
 OR (SELECT count(*) FROM public.account_deletion_retention_rule WHERE policy_version=1)<>13
 OR (SELECT count(*) FROM public.account_deletion_action_rule WHERE policy_version=1)<>28 THEN
  RAISE EXCEPTION 'Unexpected immutable policy baseline';END IF;
END $$;
INSERT INTO public.account_deletion_policy_version(version,contract_version,direction,technical_status,legal_status,finance_status,partner_status)
SELECT 2,contract_version,direction||jsonb_build_object(
 'intake','authenticated_request_and_manual_review_only',
 'receipt_access_approval','MOVRR-owner-2026-10-20-receipt-access-30d',
 'receipt_access_clock','original_request_submission_plus_30_days',
 'execution','separately_disabled_pending_applicable_approvals'),
 technical_status,legal_status,finance_status,partner_status
FROM public.account_deletion_policy_version WHERE version=1;

INSERT INTO public.account_deletion_action_rule(policy_version,scope,technical_status,legal_status,finance_status,partner_status,approval_reference,parameters)
SELECT 2,scope,technical_status,
 CASE WHEN scope='receipt.delivery' THEN 'approved' ELSE legal_status END,
 CASE WHEN scope='receipt.delivery' THEN 'not_required' ELSE finance_status END,
 CASE WHEN scope='receipt.delivery' THEN 'not_required' ELSE partner_status END,
 CASE WHEN scope='receipt.delivery' THEN 'MOVRR-owner-2026-10-20-receipt-access-30d' ELSE approval_reference END,
 CASE WHEN scope='receipt.delivery' THEN parameters||jsonb_build_object('scope','minimal_status_only',
  'approvalAuthority','MOVRR owner acting as controller','financePartnerApplicability','No financial disposition or partner operation; bounded credential only') ELSE parameters END
FROM public.account_deletion_action_rule WHERE policy_version=1;

INSERT INTO public.account_deletion_retention_rule(policy_version,category,purpose,owner,minimum_fields,lawful_basis,period,start_event,
 access_capability,expiry_mechanism,hold_review_policy,approval_status,approval_reference)
SELECT 2,category,purpose,owner,
 CASE WHEN category='receipt_access' THEN ARRAY['token_digest','expires_at'] ELSE minimum_fields END,
 CASE WHEN category='receipt_access' THEN 'GDPR Article 6(1)(c), Articles 12 and 17: facilitate a verified privacy request through bounded minimal status access; owner-approved 30-day credential validity only' ELSE lawful_basis END,
 CASE WHEN category='receipt_access' THEN interval '30 days' ELSE period END,
 CASE WHEN category='receipt_access' THEN 'barrier_established' ELSE start_event END,
 access_capability,expiry_mechanism,hold_review_policy,
 CASE WHEN category='receipt_access' THEN 'approved' ELSE approval_status END,
 CASE WHEN category='receipt_access' THEN 'MOVRR-owner-2026-10-20-receipt-access-30d' ELSE approval_reference END
FROM public.account_deletion_retention_rule WHERE policy_version=1;

DO $$ BEGIN
 IF NOT public.account_deletion_intake_ready(2) THEN RAISE EXCEPTION 'Approved intake receipt policy is incomplete';END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_action_rule a JOIN public.account_deletion_action_rule b USING(scope)
  WHERE a.policy_version=1 AND b.policy_version=2 AND a.scope<>'receipt.delivery'
  AND (to_jsonb(a)-'policy_version') IS DISTINCT FROM (to_jsonb(b)-'policy_version')) THEN
  RAISE EXCEPTION 'Unrelated action approval changed';END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_retention_rule a JOIN public.account_deletion_retention_rule b USING(category)
  WHERE a.policy_version=1 AND b.policy_version=2 AND a.category<>'receipt_access'
  AND (to_jsonb(a)-'policy_version') IS DISTINCT FROM (to_jsonb(b)-'policy_version')) THEN
  RAISE EXCEPTION 'Unrelated retention rule changed';END IF;
END $$;
UPDATE public.account_deletion_contract_gate SET active_policy_version=2 WHERE singleton;
-- Intake still Disabled/version 0. Only the existing MFA Admin command may enable it.
COMMIT;
