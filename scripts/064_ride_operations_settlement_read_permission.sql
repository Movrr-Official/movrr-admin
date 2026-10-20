-- X08 live acceptance: 058 is SECURITY INVOKER and calls this existing private
-- read authority. Its production ACL granted only the owner, so service reads
-- failed with 42501. Grant only the already privileged backend service binding;
-- rider/anonymous callers must continue through their ownership-guarded readers.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_proc
  WHERE oid='public.get_ride_reward_read_state(uuid)'::regprocedure
   AND provolatile='s' AND prosecdef
 ) THEN
  RAISE EXCEPTION 'Review changed settlement read authority before granting service access';
 END IF;
 IF has_function_privilege('anon','public.get_ride_reward_read_state(uuid)','execute')
 OR has_function_privilege('authenticated','public.get_ride_reward_read_state(uuid)','execute') THEN
  RAISE EXCEPTION 'Settlement read authority must remain private to backend callers';
 END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.get_ride_reward_read_state(uuid) TO service_role;
COMMIT;
