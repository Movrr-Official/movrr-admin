-- Prepared only. Existing operational notification delivery compatibility.
-- No worker activation, recipient changes, financial writes or authority changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $repair$ DECLARE d text;needle text; BEGIN
 d:=pg_get_functiondef('public.ops_deliver_notification_batch(uuid,integer)'::regprocedure);
 needle:='VALUES(r.notification_id,r.user_id,job.payload->>''type'',job.payload->>''title''';
 IF strpos(d,needle)=0 THEN RAISE EXCEPTION 'operational_notification_type_anchor_drift';END IF;
 d:=replace(d,needle,'VALUES(r.notification_id,r.user_id,(job.payload->>''type'')::public.notification_type,job.payload->>''title''');
 EXECUTE d;
END $repair$;
COMMIT;
