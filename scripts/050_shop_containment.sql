-- Phase A. No financial/catalog rows are changed. Activation is a separate release gate.
BEGIN;
ALTER POLICY "Service role can manage reward catalog" ON public.reward_catalog TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.reward_catalog FROM anon, authenticated;

-- Explicit role grants survive REVOKE FROM PUBLIC; remove all three.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('create_reward_adjustment','admin_create_reward_adjustment',
 'admin_update_reward_redemption_status','request_reward_redemption',
 'redeem_reward_for_me','redeem_reward_product','wallet_settle_debit',
 'adjust_rider_points_atomic','award_reward_points_capped') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',f.signature);
 END LOOP;
END $$;

CREATE TABLE public.shop_release_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 redemption_enabled boolean NOT NULL DEFAULT false,
 changed_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL
);
INSERT INTO public.shop_release_control(singleton,reason) VALUES(true,'Shop remediation: public redemption disabled pending acceptance');
ALTER TABLE public.shop_release_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_release_control FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.shop_release_control TO service_role;

-- Reject old service-role handlers too. Only the canonical transactional commands
-- introduced by the next migration may write these lifecycle records.
CREATE FUNCTION public.guard_shop_lifecycle_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('movrr.shop_command',true) IS DISTINCT FROM 'v1' THEN
  RAISE EXCEPTION 'Shop lifecycle commands unavailable during remediation' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_shop_lifecycle_write() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER shop_lifecycle_command_only BEFORE INSERT OR UPDATE OR DELETE ON public.reward_redemptions
 FOR EACH ROW EXECUTE FUNCTION public.guard_shop_lifecycle_write();
CREATE TRIGGER shop_lifecycle_command_only BEFORE INSERT OR UPDATE OR DELETE ON public.fulfilment
 FOR EACH ROW EXECUTE FUNCTION public.guard_shop_lifecycle_write();

-- Client dashboard sessions use server-side capability checks, not broad table writes.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.fulfilment,
 public.fulfilment_event,public.fulfilment_token,public.fulfilment_resource,
 public.fulfilment_resource_item,public.fulfilment_resource_allocation,
 public.partner_validation,public.platform_idempotency_key FROM anon,authenticated;
COMMIT;
