-- P0: reward_partner is catalog identity and organisation-routing authority.
-- Preserve every record and intended public read. No financial mutation.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reward_partner') OR
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.reward_partner'::regclass) THEN
  RAISE EXCEPTION 'Review changed partner policies before containment';
 END IF;
 IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN RAISE EXCEPTION 'Verify authorized server access before containment'; END IF;
END $$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.reward_partner FROM PUBLIC,anon,authenticated;
-- Table revokes alone do not remove column-level privileges.
DO $$ DECLARE a record; BEGIN
 FOR a IN SELECT attname FROM pg_attribute WHERE attrelid='public.reward_partner'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE INSERT(%I),UPDATE(%I),REFERENCES(%I) ON public.reward_partner FROM PUBLIC,anon,authenticated',a.attname,a.attname,a.attname);
 END LOOP;
END $$;
ALTER TABLE public.reward_partner ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_partner_public_read ON public.reward_partner FOR SELECT TO anon,authenticated USING(true);
GRANT SELECT ON public.reward_partner TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
