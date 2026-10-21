-- OWNER APPROVAL REQUIRED. Exactly one incident identity; never a generic RPC.
-- Transaction rollback restores both data and the immutable-role trigger.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(70001,1);
-- Changing the historical classification requires temporarily suspending its
-- immutable-field trigger. This lock prevents EVERY concurrent User operation
-- until the original trigger has been restored in the same transaction.
LOCK TABLE public."user" IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE uid constant uuid:='007b5ab8-fea0-41f2-9068-055f154d7db0';
 rid constant uuid:='183c4512-228b-441a-9b4f-e1d97359773a'; dep record; n bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user'::regclass
  AND tgname='enforce_user_role_immutable_for_clients' AND tgenabled='O') THEN
  RAISE EXCEPTION 'Immutable account-role trigger state changed'; END IF;
 PERFORM 1 FROM auth.users WHERE id=uid AND lower(email)='powerdonnl@gmail.com'
  AND raw_user_meta_data->>'server_assigned_role'='partner_operations_manager'
  AND last_sign_in_at IS NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now()) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Auth identity changed; inspect again'; END IF;
 PERFORM 1 FROM public."user" WHERE id=uid AND role='rider' AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'Account classification/status changed'; END IF;
 PERFORM 1 FROM public.rider WHERE id=rid AND user_id=uid AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rider identity changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=uid AND role IS NOT NULL) THEN
  RAISE EXCEPTION 'Unexpected Staff authority; inspect again'; END IF;
 IF (SELECT count(*) FROM public.organisation_membership WHERE user_id=uid)<>1 OR NOT EXISTS(
  SELECT 1 FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id
  WHERE m.id='16773fed-3edd-493b-bce4-fc366beb2cea' AND m.user_id=uid
   AND m.organisation_id='17be1d12-9e61-4654-afd0-fad0bf2d0278'
   AND m.role='owner' AND m.bundle_key='org.owner' AND m.status='active'
   AND o.type='reward_partner' AND o.name='Powerdon'
 ) THEN RAISE EXCEPTION 'Partner ownership changed'; END IF;
 -- Refuse all Rider history, including cascade and SET NULL relationships.
 IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f' AND c.confrelid='public.rider'::regclass
  AND (cardinality(c.conkey)<>1 OR c.confkey<>ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.rider'::regclass AND attname='id')]::smallint[])) THEN
  RAISE EXCEPTION 'Rider foreign key contract changed; inspect again'; END IF;
 FOR dep IN SELECT c.conrelid::regclass rel,a.attname col FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
  WHERE c.contype='f' AND c.confrelid='public.rider'::regclass
   AND c.conrelid<>'public.rider_reward_balance'::regclass LOOP
  EXECUTE format('SELECT count(*) FROM %s WHERE %I=$1',dep.rel,dep.col) INTO n USING rid;
  IF n<>0 THEN RAISE EXCEPTION 'Unexpected Rider dependency: %',dep.rel; END IF;
 END LOOP;
 PERFORM 1 FROM public.rider_reward_balance WHERE rider_id=rid AND points_balance=0
  AND lifetime_points_earned=0 AND daily_points_earned=0 AND weekly_points_earned=0 AND tier_points_last30=0 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nonzero/missing Rider balance; financial review required'; END IF;
END $$;
ALTER TABLE public."user" DISABLE TRIGGER enforce_user_role_immutable_for_clients;
UPDATE public."user" SET role=NULL WHERE id='007b5ab8-fea0-41f2-9068-055f154d7db0';
ALTER TABLE public."user" ENABLE TRIGGER enforce_user_role_immutable_for_clients;
-- No ledger, transaction, redemption, audit or membership deletions.
DELETE FROM public.rider_reward_balance WHERE rider_id='183c4512-228b-441a-9b4f-e1d97359773a';
DELETE FROM public.rider WHERE id='183c4512-228b-441a-9b4f-e1d97359773a' AND user_id='007b5ab8-fea0-41f2-9068-055f154d7db0';
UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data-'server_assigned_role'
 WHERE id='007b5ab8-fea0-41f2-9068-055f154d7db0';
COMMIT;
