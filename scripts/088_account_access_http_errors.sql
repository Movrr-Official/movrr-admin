-- Business rejections must not request transaction retries. PostgREST 14 retries
-- SQLSTATE 40001; use its explicit HTTP mapping for cooldown/conflict responses.
BEGIN;
DO $$
DECLARE definition text; prior text; following text;
BEGIN
 definition:=pg_get_functiondef('public.begin_account_access(uuid,uuid,uuid,uuid,text)'::regprocedure);
 FOREACH prior IN ARRAY ARRAY[
  'An access email is pending or cooling down. Retry in 15 minutes.',
  'Access email hourly limit reached. Retry later.',
  'Invitation superseded. Review membership before sending.'
 ] LOOP
  following:=CASE WHEN prior LIKE 'Invitation superseded.%' THEN 'PT409' ELSE 'PT429' END;
  IF position('RAISE EXCEPTION '||quote_literal(prior)||' USING ERRCODE=''40001'';' in definition)=0 THEN
   RAISE EXCEPTION 'Unexpected account access function; review before applying 088'; END IF;
  definition:=replace(definition,'RAISE EXCEPTION '||quote_literal(prior)||' USING ERRCODE=''40001'';',
    'RAISE EXCEPTION '||quote_literal(prior)||' USING ERRCODE='||quote_literal(following)||';');
 END LOOP;
 EXECUTE definition;
END $$;
COMMIT;
