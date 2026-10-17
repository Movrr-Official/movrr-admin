/* Local Docker/PostGIS integration only. Never reads .env or opens a network DB connection. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const container = process.argv[2];
if (!container || !/^movrr-geography-retirement-test(?:-[a-z0-9]+)?$/.test(container)) throw Error('Explicit isolated local test container required');
assert.equal(cp.execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "movrr.task"}}', container], { encoding: 'utf8' }).trim(), 'geography-retirement');
const database = `geography_retirement_${process.pid}`;
function sql(text, db = database) {
  return cp.execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', db, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
let checks = 0;
function equal(query, expected) { assert.equal(sql(query), String(expected)); checks++; }
function rejects(query, pattern) { assert.throws(() => sql(query), error => pattern.test(error.stderr?.toString() || error.message)); checks++; }
const packageRoot = path.join(root, 'scripts/manual/campaign-geography-retirement');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'manifest.json')));
const originals = JSON.parse(fs.readFileSync(path.join(packageRoot, 'original-zones.json')));
const campaign = manifest.campaign_id;
const route = manifest.route_id;
const operation = '00000000-0000-4000-8000-000000000002';
const actor = '00000000-0000-4000-8000-000000000001';
const other = 'ffffffff-0000-4000-8000-000000000001';
const actorSetting = `SET movrr.geography_actor_id='${actor}';`;
const migration = fs.readFileSync(path.join(root, 'scripts/053_campaign_geography_retirement.sql'), 'utf8');
try {
  sql(`CREATE DATABASE ${database};`, 'postgres');
  sql(`CREATE EXTENSION postgis;
    DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${actor}');
    CREATE TABLE campaign(id uuid PRIMARY KEY,lifecycle_status text,start_date date,end_date date);
    CREATE TABLE campaign_zone(id uuid PRIMARY KEY,campaign_id uuid NOT NULL REFERENCES campaign,name text,geom geometry NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE route(id uuid PRIMARY KEY,campaign_id uuid REFERENCES campaign,status text DEFAULT 'pending');
    CREATE TABLE rider_route(id uuid PRIMARY KEY,campaign_id uuid,route_id uuid,status text);
    CREATE TABLE campaign_assignment(id uuid PRIMARY KEY,campaign_id uuid,status text);
    CREATE TABLE campaign_hot_zone(id uuid PRIMARY KEY,campaign_id uuid);
    CREATE TABLE zone_visit(id uuid PRIMARY KEY,campaign_zone_id uuid);
    CREATE TABLE route_stop(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),route_id uuid,lat double precision,lng double precision,stop_order integer);
    CREATE FUNCTION validate_route_stop_in_campaign_zone() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END;';
    CREATE TRIGGER trg_validate_route_stop_in_campaign_zone BEFORE INSERT OR UPDATE ON route_stop FOR EACH ROW EXECUTE FUNCTION validate_route_stop_in_campaign_zone();
    CREATE TABLE ride_session(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid,route_id uuid,rider_route_id uuid,status text);
    CREATE TABLE route_tracking(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid,route_id uuid,end_time timestamptz);
    CREATE TABLE reward_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid,points_earned integer);
    CREATE TABLE platform_audit_record(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_user_id uuid NOT NULL,principal_type text NOT NULL,
      capability text,target_entity_type text NOT NULL,target_entity_id text NOT NULL,previous_state jsonb,resulting_state jsonb,correlation_id text NOT NULL,reason text);
    ALTER TABLE campaign_zone ENABLE ROW LEVEL SECURITY;
    CREATE POLICY campaign_zone_select_all ON campaign_zone FOR SELECT USING(true);
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT ALL ON campaign_zone TO anon,authenticated,service_role;
    CREATE VIEW campaign_zone_geojson AS SELECT id,campaign_id,name,ST_AsGeoJSON(geom)::jsonb geojson,created_at FROM campaign_zone;
    GRANT SELECT ON campaign_zone_geojson TO anon,authenticated,service_role;
    CREATE FUNCTION is_point_in_campaign_zone(p_campaign_id uuid,p_lat double precision,p_lng double precision) RETURNS boolean LANGUAGE sql STABLE AS
      'SELECT EXISTS(SELECT 1 FROM campaign_zone WHERE campaign_id=p_campaign_id AND ST_Contains(geom,ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)))';
    INSERT INTO campaign VALUES('${campaign}','completed','2026-01-11','2026-05-24'),('${other}','active','2020-01-01','2099-01-01'),('ffffffff-0000-4000-8000-000000000099','draft',NULL,NULL);
    INSERT INTO route(id,campaign_id) VALUES('${route}','${campaign}');
    INSERT INTO campaign_assignment VALUES(gen_random_uuid(),'${campaign}','assigned');
    INSERT INTO rider_route VALUES(gen_random_uuid(),'${campaign}','${route}','completed');
    INSERT INTO route_stop(route_id,lat,lng,stop_order) SELECT '${route}',52.10862+(52.118-52.10862)*i/80.0,4.28668+(4.231-4.28668)*i/80.0,i FROM generate_series(0,80)i;
    INSERT INTO reward_transactions(campaign_id,points_earned) VALUES('${other}',42);
    INSERT INTO campaign_zone(id,campaign_id,name,geom) SELECT ('ffffffff-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${other}','Unrelated test area '||i,ST_GeomFromText('POLYGON((0 0,2 0,2 2,0 2,0 0))',4326) FROM generate_series(1,56)i;`);
  for (const row of originals) {
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    sql(`INSERT INTO campaign_zone VALUES('${row.id}','${campaign}',${quote(row.name)},ST_GeomFromEWKB(decode('${row.geometry_ewkb_hex}','hex')),'${row.created_at}');`);
  }
  const geometryBefore = sql(`SELECT md5(string_agg(encode(ST_AsEWKB(geom),'hex'),'' ORDER BY id)) FROM campaign_zone;`);
  const legacyBefore = sql(`SELECT md5(pg_get_functiondef('is_point_in_campaign_zone(uuid,double precision,double precision)'::regprocedure));`);
  const aclBefore = sql(`SELECT relacl::text FROM pg_class WHERE oid='campaign_zone'::regclass;`);
  const viewAclBefore = sql(`SELECT relacl::text FROM pg_class WHERE oid='campaign_zone_geojson'::regclass;`);
  const policyBefore = sql(`SELECT pg_get_expr(polqual,polrelid) FROM pg_policy WHERE polrelid='campaign_zone'::regclass;`);
  // A failed/rolled-back migration cannot leave partial metadata or change live responses.
  sql(migration.replace(/COMMIT;\s*$/, 'ROLLBACK;'));
  equal(`SELECT count(*) FROM information_schema.columns WHERE table_name='campaign_zone' AND column_name='retired_at';`, 0);
  equal(`SELECT count(*) FROM campaign_zone_geojson;`, 136);
  sql(migration);
  equal(`SELECT relacl::text FROM pg_class WHERE oid='campaign_zone'::regclass;`, aclBefore);
  equal(`SELECT relacl::text FROM pg_class WHERE oid='campaign_zone_geojson'::regclass;`, viewAclBefore);
  equal(`SELECT pg_get_expr(polqual,polrelid) FROM pg_policy WHERE polrelid='campaign_zone'::regclass;`, policyBefore);
  equal(`SELECT prosecdef FROM pg_proc WHERE oid='get_campaign_geography(uuid)'::regprocedure;`, 'f');
  equal(`SELECT (get_campaign_geography('${campaign}')->>'state');`, 'available');
  equal(`SELECT jsonb_array_length(get_campaign_geography('${campaign}')->'zones');`, 80);
  const revisionBefore = sql(`SELECT get_campaign_geography('${campaign}')->>'revision';`);
  rejects(`UPDATE campaign SET lifecycle_status='active' WHERE id='${campaign}';`, /historical/);
  rejects(`UPDATE campaign SET lifecycle_status='paused' WHERE id='${campaign}';`, /historical/);
  rejects(`INSERT INTO ride_session(campaign_id,status) VALUES('${campaign}','active');`, /not available/);
  rejects(`INSERT INTO route_stop(route_id,lat,lng) VALUES('${route}',52.10862,4.28668);`, /Historical campaign/);
  rejects(`UPDATE campaign_zone SET retired_at=now(),retirement_reason='Obsolete',retirement_operation_id='${operation}' WHERE campaign_id='${campaign}';`, /operator identity/);
  rejects(`${actorSetting} UPDATE campaign_zone SET retired_at=now(),retirement_reason='Obsolete',retirement_operation_id='${operation}',name='Rewritten' WHERE campaign_id='${campaign}';`, /preserve/);
  rejects(`${actorSetting} UPDATE campaign_zone SET retired_at=now(),retirement_reason=NULL,retirement_operation_id='${operation}' WHERE campaign_id='${campaign}';`, /retirement_complete/);
  equal(`BEGIN; ${actorSetting} UPDATE campaign_zone SET retired_at=now(),retirement_reason='Partial test',retirement_operation_id='${operation}' WHERE id='${originals[0].id}';
    SELECT (get_campaign_geography('${campaign}')->>'state')||':'||jsonb_array_length(get_campaign_geography('${campaign}')->'zones')||':'||(get_campaign_geography('${campaign}')->>'retiredCount'); ROLLBACK;`, 'available:79:1');
  const otherRoute = 'ffffffff-0000-4000-8000-000000000098';
  sql(`INSERT INTO route(id,campaign_id) VALUES('${otherRoute}','${other}'); INSERT INTO route_stop(route_id,lat,lng) VALUES('${otherRoute}',1,1);`);
  rejects(`BEGIN; UPDATE campaign_zone SET geom=ST_GeomFromText('POLYGON((0 0,2 0,2 2,0 2,0 0),(0.8 0.8,0.8 1.2,1.2 1.2,1.2 0.8,0.8 0.8))',4326) WHERE campaign_id='${other}'; INSERT INTO route_stop(route_id,lat,lng) VALUES('${otherRoute}',1,1); COMMIT;`, /current campaign area/);
  // An ongoing session is never silently stripped of its evidence: retirement must stop.
  sql(`ALTER TABLE ride_session DISABLE TRIGGER guard_new_campaign_ride_geography; INSERT INTO ride_session(campaign_id,status) VALUES('${campaign}','paused'); ALTER TABLE ride_session ENABLE TRIGGER guard_new_campaign_ride_geography;`);
  rejects(`${actorSetting} UPDATE campaign_zone SET retired_at=now(),retirement_reason='Obsolete',retirement_operation_id='${operation}' WHERE campaign_id='${campaign}';`, /ongoing/);
  sql(`UPDATE ride_session SET status='completed' WHERE campaign_id='${campaign}';`);
  equal(`SELECT status FROM ride_session WHERE campaign_id='${campaign}';`, 'completed');
  sql(`DELETE FROM ride_session WHERE campaign_id='${campaign}';`);
  sql(`${actorSetting} UPDATE campaign_zone SET retired_at=now(),retirement_reason='Retired obsolete synthetic geography',retirement_operation_id='${operation}' WHERE campaign_id='${campaign}';`);
  equal(`SELECT count(*) FROM campaign_zone WHERE campaign_id='${campaign}';`, 80);
  equal(`SELECT count(*) FROM campaign_zone_geojson WHERE campaign_id='${campaign}';`, 0);
  equal(`SELECT get_campaign_geography('${campaign}')->>'state';`, 'retired');
  equal(`SELECT get_campaign_geography('${campaign}')->>'retiredCount';`, 80);
  assert.notEqual(sql(`SELECT get_campaign_geography('${campaign}')->>'revision';`), revisionBefore); checks++;
  equal(`SELECT md5(string_agg(encode(ST_AsEWKB(geom),'hex'),'' ORDER BY id)) FROM campaign_zone;`, geometryBefore);
  equal(`SELECT md5(pg_get_functiondef('is_point_in_campaign_zone(uuid,double precision,double precision)'::regprocedure));`, legacyBefore);
  equal(`SELECT is_point_in_campaign_zone('${campaign}',52.10862,4.28668);`, 't');
  equal(`SELECT count(*) FROM campaign_zone WHERE campaign_id='${other}' AND retired_at IS NULL;`, 56);
  equal(`SELECT points_earned FROM reward_transactions;`, 42);
  equal(`SELECT count(*) FROM platform_audit_record WHERE correlation_id='${operation}';`, 80);
  rejects(`DELETE FROM campaign_zone WHERE campaign_id='${campaign}';`, /historical evidence/);
  rejects(`UPDATE campaign_zone SET name='Changed' WHERE campaign_id='${campaign}';`, /preserve/);
  rejects(`INSERT INTO campaign_zone(id,campaign_id,name,geom) VALUES(gen_random_uuid(),'${campaign}','Unapproved replacement',ST_GeomFromText('POLYGON((0 0,2 0,2 2,0 0))',4326));`, /replaced implicitly/);
  sql(`SET ROLE authenticated; UPDATE campaign_zone SET retired_at=NULL WHERE campaign_id='${campaign}';`);
  equal(`SELECT count(*) FROM campaign_zone WHERE campaign_id='${campaign}' AND retired_at IS NOT NULL;`, 80);
  equal(`SET ROLE anon; SELECT count(*) FROM campaign_zone_geojson;`, 56);
  equal(`SET ROLE authenticated; SELECT get_campaign_geography('${campaign}')->>'state';`, 'retired');
  rejects(`SET ROLE authenticated; SELECT count(*) FROM campaign_zone_history_geojson;`, /permission/);
  equal(`SET ROLE service_role; SELECT count(*) FROM campaign_zone_history_geojson WHERE campaign_id='${campaign}';`, 80);
  // A paused fully retired campaign cannot bypass the terminal-campaign check.
  sql(`ALTER TABLE campaign DISABLE TRIGGER guard_campaign_geography_activation; UPDATE campaign SET lifecycle_status='paused' WHERE id='${campaign}'; ALTER TABLE campaign ENABLE TRIGGER guard_campaign_geography_activation;`);
  rejects(`UPDATE campaign SET lifecycle_status='active' WHERE id='${campaign}';`, /retired/);
  sql(`UPDATE campaign SET lifecycle_status='completed' WHERE id='${campaign}';`);
  rejects(`INSERT INTO ride_session(campaign_id,route_id,status) VALUES('${other}','${route}','active');`, /identity/);
  sql(`INSERT INTO ride_session(campaign_id,status) VALUES('${other}','active'); INSERT INTO ride_session(status) VALUES('active');`);
  equal(`SELECT count(*) FROM ride_session;`, 2);
  sql(`${actorSetting} UPDATE campaign_zone SET retired_at=NULL,retirement_reason=NULL,retirement_operation_id=NULL WHERE campaign_id='${campaign}';`);
  equal(`SELECT count(*) FROM campaign_zone_geojson WHERE campaign_id='${campaign}';`, 80);
  equal(`SELECT count(*) FROM platform_audit_record WHERE correlation_id='${operation}';`, 160);
  equal(`SELECT md5(string_agg(encode(ST_AsEWKB(geom),'hex'),'' ORDER BY id)) FROM campaign_zone;`, geometryBefore);
  // Run the actual guarded production package against the isolated replica, not a hand-written approximation.
  sql(`CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY); INSERT INTO supabase_migrations.schema_migrations VALUES('${manifest.schema_migration_version}');`);
  const retireScript = fs.readFileSync(path.join(packageRoot, 'retire.sql'), 'utf8');
  const rollbackScript = fs.readFileSync(path.join(packageRoot, 'rollback.sql'), 'utf8');
  rejects(retireScript, /approval is absent/);
  equal(`SELECT count(*) FROM campaign_zone WHERE retired_at IS NOT NULL;`, 0);
  sql(`SET movrr.geography_execution='retire:${manifest.proposed_operation_id}'; ${actorSetting}\n${retireScript}`);
  equal(`SELECT count(*) FROM campaign_zone WHERE campaign_id='${campaign}' AND retired_at IS NOT NULL;`, 80);
  equal(`SELECT count(*) FROM campaign_zone_geojson WHERE campaign_id='${campaign}';`, 0);
  rejects(rollbackScript, /approval is absent/);
  sql(`SET movrr.geography_execution='rollback:${manifest.proposed_operation_id}'; ${actorSetting}\n${rollbackScript}`);
  equal(`SELECT count(*) FROM campaign_zone_geojson WHERE campaign_id='${campaign}';`, 80);
  equal(`SELECT count(*) FROM platform_audit_record WHERE correlation_id='${manifest.proposed_operation_id}';`, 160);
  equal(`SELECT md5(string_agg(encode(ST_AsEWKB(geom),'hex'),'' ORDER BY id)) FROM campaign_zone;`, geometryBefore);
  console.log(JSON.stringify({ checks, passed: checks, environment: 'isolated local Docker/PostGIS', productionConnected: false }));
} finally {
  sql(`DROP DATABASE IF EXISTS ${database};`, 'postgres');
}
