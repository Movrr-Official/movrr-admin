// Real PostgreSQL 17 only. Hardcoded localhost connection; never loads .env.
const postgres = require("postgres"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const options = {
  host: "127.0.0.1",
  port: 55439,
  username: "postgres",
  password: "isolated-local-test-only",
  max: 16,
  onnotice: () => {},
};
const root = postgres({ ...options, database: "postgres" }),
  name = "movrr_alignment_" + process.pid;
let db,
  n = 0;
const equal = (a, b) => {
    assert.deepEqual(a, b);
    n++;
  },
  deny = async (fn, re) => {
    await assert.rejects(fn, re);
    n++;
  },
  id = () => crypto.randomUUID();
const q = (x) => '"' + x.replaceAll('"', '""') + '"';
async function fixture(db) {
  const schema = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/alignment/schema.json"), "utf8"),
  );
  await db.unsafe(
    `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS;END IF;END $$;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated,anon,service_role;`,
  );
  for (const e of schema.enums)
    await db.unsafe(
      "CREATE TYPE " +
        q(e.typname) +
        " AS ENUM (" +
        e.labels.map((x) => "'" + x.replaceAll("'", "''") + "'").join(",") +
        ")",
    );
  const tables = [...new Set(schema.columns.map((x) => x.table_name))];
  for (const table of tables) {
    const columns = schema.columns.filter((x) => x.table_name === table);
    const defs = columns.map((c) => {
      let type =
        c.data_type === "USER-DEFINED"
          ? q(c.udt_name)
          : c.data_type === "ARRAY"
            ? q(c.udt_name.slice(1)) + "[]"
            : c.data_type;
      let def = c.column_default;
      if (def?.includes("nextval")) def = null;
      return (
        q(c.column_name) +
        " " +
        type +
        (def ? " DEFAULT " + def : "") +
        (c.column_name === "id" ? " PRIMARY KEY" : "")
      );
    });
    await db.unsafe("CREATE TABLE " + q(table) + "(" + defs.join(",") + ")");
  }
  await db.unsafe(`ALTER TABLE rider ADD UNIQUE(user_id);ALTER TABLE user_preferences ADD UNIQUE(user_id);ALTER TABLE rider_reward_balance ADD PRIMARY KEY(rider_id);
 CREATE TABLE platform_settings(key text PRIMARY KEY,value jsonb,updated_at timestamptz DEFAULT now());
 CREATE TABLE admin_users(user_id uuid PRIMARY KEY,role text);
 CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,message text,metadata jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE campaign_signup(campaign_id uuid,rider_id uuid,status text,created_at timestamptz DEFAULT now(),joined_at timestamptz,selected_at timestamptz,confirmed_at timestamptz,withdrawn_at timestamptz,rejected_at timestamptz,updated_at timestamptz DEFAULT now(),PRIMARY KEY(campaign_id,rider_id));
 CREATE TABLE campaign_assignment(campaign_id uuid,rider_id uuid,assigned_at timestamptz,created_by uuid,UNIQUE(campaign_id,rider_id));
 CREATE TABLE route_tracking(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),rider_id uuid,ride_session_id uuid,end_time timestamptz,path jsonb);
 CREATE TABLE rider_route(id uuid PRIMARY KEY,rider_id uuid);
 CREATE TABLE ride_reward_execution_receipt(session_id uuid PRIMARY KEY,snapshot_digest text);
 CREATE UNIQUE INDEX unique_badge ON rider_badge_award(rider_id,badge_definition_id);
 ALTER TABLE rider_brand_preference ADD UNIQUE(rider_id,brand_id);
 CREATE TABLE community_ride_creator_grant(user_id uuid PRIMARY KEY,revoked_at timestamptz);
 CREATE TABLE community_ride_participant(community_ride_id uuid,rider_id uuid,status text,joined_at timestamptz DEFAULT now(),left_at timestamptz,UNIQUE(community_ride_id,rider_id));
 CREATE TABLE community_ride_change_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),community_ride_id uuid,changed_by_user_id uuid,changed_fields text[],before_values jsonb,after_values jsonb,participants_notified integer);
 CREATE FUNCTION insert_notification(uuid,text,text,text,jsonb) RETURNS void LANGUAGE sql AS $$ INSERT INTO notifications(user_id,type,title,message,metadata) VALUES($1,$2,$3,$4,$5) $$;
 SET check_function_bodies=off;`);
  await db.unsafe(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;",
  );
  const functions = fs.readFileSync(
    path.join(__dirname, "fixtures/alignment/production-functions.sql"),
    "utf8",
  );
  await db.unsafe(functions);
  for (const file of [
    "055_alignment_security.sql",
    "../../movrr-mobile/scripts/093_alignment_accessory_custody.sql",
    "056_alignment_capabilities.sql",
    "057_alignment_operations.sql",
    "058_alignment_reads.sql",
    "059_alignment_impact.sql",
  ]) {
    try {
      await db.begin((tx) =>
        tx.unsafe(
          fs
            .readFileSync(path.join(__dirname, file), "utf8")
            .replace(/^BEGIN;\s*$/m, "")
            .replace(/^COMMIT;\s*$/m, ""),
        ),
      );
    } catch (e) {
      console.error("Migration failed:", file);
      throw e;
    }
  }
  await db.unsafe(
    `GRANT SELECT,INSERT,UPDATE,DELETE ON rider,ride_session,user_preferences,reward_transactions TO authenticated;ALTER TABLE rider ENABLE ROW LEVEL SECURITY;ALTER TABLE ride_session ENABLE ROW LEVEL SECURITY;CREATE POLICY owner_rider ON rider TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());CREATE POLICY owner_ride ON ride_session TO authenticated USING(rider_id IN (SELECT id FROM rider WHERE user_id=auth.uid()));GRANT EXECUTE ON FUNCTION current_rider_id(),get_my_ride_summary(uuid,boolean),get_lifetime_impact_summary(),rider_campaign_opt_in(uuid),rider_campaign_confirm(uuid),rider_campaign_withdraw(uuid) TO authenticated;`,
  );
}
async function main() {
  await root.unsafe("CREATE DATABASE " + name);
  db = postgres({ ...options, database: name });
  await fixture(db);
  const user = id(),
    rider = id(),
    other = id(),
    otherRider = id(),
    operator = id(),
    viewer = id(),
    campaign = id(),
    item = id(),
    assignment = id(),
    replacement = id(),
    type = id();
  await db`INSERT INTO "user"(id,email,status,role,name) VALUES(${user},'rider@isolated.test','active','rider','Test Rider'),(${other},'other@isolated.test','active','rider','Other'),(${operator},'ops@isolated.test','active','rider','Ops'),(${viewer},'viewer@isolated.test','active','rider','Viewer')`;
  await db`INSERT INTO rider(id,user_id) VALUES(${rider},${user}),(${otherRider},${other})`;
  await db`INSERT INTO admin_users VALUES(${operator},'operations_manager'),(${viewer},'executive_viewer')`;
  await db`INSERT INTO campaign(id,name,lifecycle_status,campaign_type,created_at) VALUES(${campaign},'Open campaign','open_for_signup','swarm',now())`;
  const as = async (actor, sql, args = [], aal = "aal2") =>
    db.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`SELECT set_config('request.jwt.claim.sub',${actor},true),set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: "authenticated", aal })},true)`;
      return (await tx.unsafe(sql, args))[0]?.r;
    });
  const rpc = (actor, fn, args = []) =>
    as(
      actor,
      "SELECT " +
        fn +
        "(" +
        args
          .map(
            (_, i) =>
              "$" +
              (i + 1) +
              ((fn === "ops_accessory_command" && i === 2) ||
              (fn === "ops_assign_accessory" && i === 3) ||
              (fn === "ops_inventory_disposition" && i === 2) ||
              (fn === "update_community_ride" && [1, 4].includes(i)) ||
              (fn === "cancel_my_community_ride" && i === 1)
                ? "::text::timestamptz"
                : ""),
          )
          .join(",") +
        ") r",
      args,
    );
  equal(await rpc(user, "get_authenticated_rider_id"), rider);
  equal((await rpc(user, "get_my_campaign_catalog"))[0].signupStatus, null);
  equal((await rpc(user, "get_my_campaign_catalog"))[0].canJoin, true);
  await rpc(user, "rider_campaign_opt_in", [campaign]);
  equal((await rpc(user, "get_my_campaign_catalog"))[0].signupStatus, "joined");
  await rpc(user, "rider_campaign_withdraw", [campaign]);
  equal((await rpc(user, "get_my_campaign_catalog"))[0].signupStatus, "withdrawn");
  for (const status of ["suspended", "deleted"]) {
    await db`UPDATE "user" SET status=${status} WHERE id=${user}`;
    await deny(
      () => rpc(user, "rider_campaign_opt_in", [campaign]),
      /Account access restricted/,
    );
    await deny(
      () => rpc(user, "get_my_ride_summary_page", [50, null, null]),
      /Account access restricted/,
    );
    await deny(
      () => rpc(user, "get_authenticated_rider_id"),
      /Account access restricted/,
    );
  }
  await db`UPDATE "user" SET status='active' WHERE id=${user}`;
  await db`INSERT INTO campaign_accessory_inventory_item(id,accessory_type_id,asset_code,status,current_rider_id,current_campaign_id) VALUES(${item},${type},'TEST-ITEM','assigned',${rider},${campaign}),(${replacement},${type},'TEST-REPLACEMENT','available',null,null)`;
  await db`INSERT INTO rider_campaign_accessory_assignment(id,rider_id,campaign_id,inventory_item_id,status) VALUES(${assignment},${rider},${campaign},${item},'assigned')`;
  await deny(
    () => rpc(other, "confirm_campaign_accessory_installed", [assignment]),
    /unavailable/,
  );
  await Promise.all(
    Array.from({ length: 12 }, () =>
      rpc(user, "confirm_campaign_accessory_installed", [assignment]),
    ),
  );
  equal(
    (
      await db`SELECT count(*)::int n FROM rider_campaign_accessory_event WHERE assignment_id=${assignment}`
    )[0].n,
    1,
  );
  await rpc(user, "report_campaign_accessory_issue", [
    assignment,
    "damaged",
    "Synthetic damaged report",
  ]);
  const stamp = (
    await db`SELECT updated_at::text s FROM rider_campaign_accessory_assignment WHERE id=${assignment}`
  )[0].s;
  const op = id(),
    args = [
      assignment,
      "replace",
      stamp,
      op,
      "Replace damaged test equipment",
      replacement,
    ];
  const replaced = await Promise.all(
    Array.from({ length: 8 }, () => rpc(operator, "ops_accessory_command", args)),
  );
  equal(new Set(replaced.map((x) => x.replacementAssignmentId)).size, 1);
  await deny(
    () => rpc(user, "confirm_campaign_accessory_installed", [assignment]),
    /custody changed/i,
  );
  await deny(
    () =>
      rpc(viewer, "ops_accessory_command", [
        assignment,
        "return",
        stamp,
        id(),
        "Unauthorized attempted return",
        null,
      ]),
    /Capability required/,
  );
  await deny(
    () =>
      rpc(operator, "ops_accessory_command", [
        replaced[0].replacementAssignmentId,
        "return",
        stamp,
        id(),
        "Stale replacement return",
        null,
      ]),
    /Assignment changed/,
  );
  const newAssignment = replaced[0].replacementAssignmentId;
  const replacementStamp = (
    await db`SELECT updated_at::text s FROM rider_campaign_accessory_assignment WHERE id=${newAssignment}`
  )[0].s;
  await rpc(operator, "ops_accessory_command", [
    newAssignment,
    "return",
    replacementStamp,
    id(),
    "Confirmed physical equipment return",
    null,
  ]);
  equal(
    (
      await db`SELECT status FROM campaign_accessory_inventory_item WHERE id=${replacement}`
    )[0].status,
    "available",
  );
  await db`INSERT INTO campaign_assignment(campaign_id,rider_id) VALUES(${campaign},${otherRider})`;
  const inventoryStamp = (
    await db`SELECT updated_at::text s FROM campaign_accessory_inventory_item WHERE id=${replacement}`
  )[0].s;
  const reassignment = await rpc(operator, "ops_assign_accessory", [
    replacement,
    otherRider,
    campaign,
    inventoryStamp,
    id(),
    "Reassign returned equipment safely",
  ]);
  await deny(
    () => rpc(user, "confirm_campaign_accessory_installed", [newAssignment]),
    /custody changed/i,
  );
  await rpc(other, "confirm_campaign_accessory_installed", [reassignment.assignmentId]);
  await rpc(other, "report_campaign_accessory_issue", [
    reassignment.assignmentId,
    "lost",
    "Reported lost test item",
  ]);
  await rpc(other, "report_campaign_accessory_issue", [
    reassignment.assignmentId,
    "lost",
    "Reported lost test item",
  ]);
  equal(
    (
      await db`SELECT count(*)::int n FROM rider_campaign_accessory_event WHERE assignment_id=${reassignment.assignmentId} AND event_type='lost'`
    )[0].n,
    1,
  );
  await deny(
    () =>
      rpc(other, "report_campaign_accessory_issue", [
        reassignment.assignmentId,
        null,
        "Invalid command",
      ]),
    /Invalid accessory issue/,
  );
  equal(
    (
      await db`SELECT current_rider_id FROM campaign_accessory_inventory_item WHERE id=${replacement}`
    )[0].current_rider_id,
    otherRider,
  );
  const maintenanceStamp = (
    await db`SELECT updated_at::text s FROM campaign_accessory_inventory_item WHERE id=${item}`
  )[0].s;
  await rpc(operator, "ops_inventory_disposition", [
    item,
    "available",
    maintenanceStamp,
    id(),
    "Inspection passed after maintenance",
  ]);
  equal(
    (await db`SELECT status FROM campaign_accessory_inventory_item WHERE id=${item}`)[0]
      .status,
    "available",
  );
  await deny(
    () =>
      rpc(operator, "ops_inventory_disposition", [
        replacement,
        "available",
        inventoryStamp,
        id(),
        "Cannot release assigned inventory",
      ]),
    /still in custody|changed/,
  );
  const incidentOp = id();
  const incident = await rpc(operator, "ops_incident_command", [
    null,
    null,
    null,
    {
      title: "Test incident",
      description: "Synthetic database fixture",
      severity: "medium",
    },
    incidentOp,
  ]);
  equal((await rpc(operator, "ops_list_incidents")).length, 1);
  const raced = await Promise.allSettled(
    ["investigating", "resolved"].map((status) =>
      rpc(operator, "ops_incident_command", [incident.id, status, 0, null, id()]),
    ),
  );
  equal(raced.filter((x) => x.status === "fulfilled").length, 1);
  const iop = id();
  const current = (await rpc(operator, "ops_list_incidents"))[0];
  const transition = [current.id, "closed", current.version, null, iop];
  equal(
    await rpc(operator, "ops_incident_command", transition),
    await rpc(operator, "ops_incident_command", transition),
  );
  await deny(
    () =>
      rpc(viewer, "ops_incident_command", [
        null,
        null,
        null,
        { title: "Denied", severity: "low" },
        id(),
      ]),
    /Capability required/,
  );
  await deny(
    () =>
      as(
        operator,
        "SELECT ops_incident_command(null,null,null,$1,$2) r",
        [{ title: "Denied", severity: "low" }, id()],
        "aal1",
      ),
    /MFA required/,
  );
  // Complete audience exceeds the usual PostgREST cap. All recipients are isolated fixtures.
  await db.unsafe(
    `INSERT INTO "user"(id,email,status,role,name) SELECT gen_random_uuid(),'fixture-'||g||'@isolated.test','active','rider','Fixture' FROM generate_series(1,1100) g`,
  );
  await db`INSERT INTO user_preferences(user_id,notifications) VALUES(${other},false)`;
  const send = id(),
    payload = {
      title: "Test batch",
      message: "Isolated notification",
      type: "system",
      target: "all",
      respectPreferences: true,
      metadata: { test: true },
    };
  const queued = await rpc(operator, "ops_queue_notifications", [send, payload]);
  equal(queued.recipientCount, 1103);
  await deny(
    () =>
      rpc(operator, "ops_queue_notifications", [
        send,
        { ...payload, title: "Different request" },
      ]),
    /Operation conflict/,
  );
  for (let i = 0; i < 4; i++)
    await rpc(operator, "ops_deliver_notification_batch", [send, 500]);
  const complete = await rpc(operator, "ops_deliver_notification_batch", [send, 500]);
  equal(complete.pendingCount, 0);
  equal(complete.createdCount, queued.recipientCount);
  equal(
    (
      await db`SELECT count(*)::int n FROM notifications WHERE metadata->>'send_operation'=${send}`
    )[0].n,
    queued.recipientCount,
  );
  await deny(
    () => rpc(viewer, "ops_deliver_notification_batch", [send, 500]),
    /Capability required/,
  );
  // Preference-read failure must not produce a fail-open audience or durable job.
  const failedPreferenceOperation=id();
  await db.unsafe('ALTER TABLE user_preferences RENAME COLUMN notifications TO unavailable_notifications');
  await deny(()=>rpc(operator,"ops_queue_notifications",[failedPreferenceOperation,payload]),/notifications.*does not exist/);
  await db.unsafe('ALTER TABLE user_preferences RENAME COLUMN unavailable_notifications TO notifications');
  equal((await db`SELECT count(*)::int n FROM ops_notification_send WHERE id=${failedPreferenceOperation}`)[0].n,0);
  // Another authorized employee can recover durable work without the original sender.
  await db`INSERT INTO admin_users VALUES(${other},'support_agent')`;
  // Interrupted notification batches roll back delivery and progress together.
  const interrupted = id();
  await rpc(operator, "ops_queue_notifications", [
    interrupted,
    { ...payload, title: "Interrupted test" },
  ]);
  await db.unsafe(
    `CREATE FUNCTION fail_test_delivery() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.metadata->>'send_operation'='${interrupted}' AND (SELECT count(*) FROM notifications WHERE metadata->>'send_operation'='${interrupted}')>=2 THEN RAISE EXCEPTION 'injected delivery failure';END IF;RETURN NEW;END $$;CREATE TRIGGER fail_test_delivery BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_test_delivery()`,
  );
  await deny(
    () => rpc(operator, "ops_deliver_notification_batch", [interrupted, 500]),
    /injected delivery failure/,
  );
  equal(
    (
      await db`SELECT count(*)::int n FROM notifications WHERE metadata->>'send_operation'=${interrupted}`
    )[0].n,
    0,
  );
  await db.unsafe("DROP TRIGGER fail_test_delivery ON notifications");
  equal((await rpc(other,"ops_deliver_notification_batch",[interrupted,200])).operationId,interrupted);
  await deny(()=>rpc(viewer,"ops_deliver_notification_batch",[interrupted,200]),/Capability required/);
  await Promise.all(
    Array.from({ length: 8 }, () =>
      rpc(operator, "ops_deliver_notification_batch", [interrupted, 200]),
    ),
  );
  equal(
    (await rpc(operator, "ops_deliver_notification_batch", [interrupted, 500]))
      .createdCount,
    queued.recipientCount,
  );
  // The production summary SQL is exercised for standard/boosted/rejected/pending and ownership.
  const standard = id(),
    boosted = id(),
    rejected = id(),
    pending = id();
  await db`INSERT INTO ride_session(id,rider_id,status,earning_mode,started_at,completed_at,total_distance_meters,verification_result,created_at) VALUES(${standard},${rider},'completed','standard_ride',now()-interval '2 hours',now()-interval '1 hour',1000,${{ status: "verified" }},now()-interval '1 hour'),(${boosted},${rider},'completed','ad_enhanced_ride',now()-interval '1 hour',now(),2000,${{ status: "verified" }},now()),(${rejected},${rider},'rejected','standard_ride',now()-interval '3 hours',now()-interval '2 hours',100,${{ status: "rejected" }},now()-interval '2 hours'),(${pending},${rider},'active','standard_ride',now(),null,500,null,now())`;
  await db`INSERT INTO reward_transactions(rider_id,points_earned,source,metadata) VALUES(${rider},20,'standard_ride',${{ rideSessionId: standard, totalDistanceKm: 1, verifiedMinutes: 10 }}),(${rider},30,'campaign_ride',${{ rideSessionId: boosted, totalDistanceKm: 2, verifiedMinutes: 20 }})`;
  await db`INSERT INTO ride_reward_execution_receipt(session_id) VALUES(${standard})`;
  const standardSummary = await rpc(user, "get_my_ride_summary", [standard, false]);
  equal(standardSummary.committedPoints, 20);
  equal(standardSummary.settlement.status, "settled");
  const boostedSummary = await rpc(user, "get_my_ride_summary", [boosted, false]);
  equal(boostedSummary.committedPoints, 30);
  equal(boostedSummary.totalPoints, null);
  equal(await rpc(other, "get_my_ride_summary", [standard, false]), null);
  equal(
    await as(other, "SELECT count(*)::int r FROM ride_session WHERE rider_id=$1", [
      rider,
    ]),
    0,
  );
  await db`UPDATE "user" SET status='suspended' WHERE id=${user}`;
  equal(await as(user, "SELECT count(*)::int r FROM ride_session"), 0);
  await db`UPDATE "user" SET status='active' WHERE id=${user}`;
  const first = await rpc(user, "get_my_ride_summary_page", [2, null, null]);
  equal(first.summaries.length, 2);
  const second = await rpc(user, "get_my_ride_summary_page", [2, first.nextCursor, null]);
  equal(second.summaries.length, 2);
  equal(
    new Set([...first.summaries, ...second.summaries].map((x) => x.rideSessionId)).size,
    4,
  );
  const impact = await as(
    user,
    "SELECT to_jsonb(x) r FROM get_lifetime_impact_summary() x",
  );
  equal(Number(impact.total_distance_km), 3);
  equal(Number(impact.co2_saved_kg), 0.54);
  await rpc(user, "update_my_rider_profile", [
    {
      phone: "123",
      city: "Amsterdam",
      country: "NL",
      emergency_contact: "Test",
      emergency_phone: "456",
      vehicle_type: "bike",
      language: "nl-NL",
    },
  ]);
  const daily = await db`SELECT * FROM get_impact_daily(30)`;
  equal(
    daily.reduce((n, r) => n + Number(r.distanceKm), 0),
    3,
  );
  equal(
    daily.reduce((n, r) => n + Number(r.co2SavedKg), 0),
    0.54,
  );
  equal(
    (await db`SELECT language FROM user_preferences WHERE user_id=${user}`)[0].language,
    "nl-NL",
  );
  await deny(
    () => rpc(user, "update_my_rider_profile", [{ language: "de", role: "admin" }]),
    /Invalid rider profile/,
  );
  equal((await db`SELECT role FROM "user" WHERE id=${user}`)[0].role, "rider");
  const rejectedSummary=await rpc(user,"get_my_ride_summary",[rejected,false]);
  equal(rejectedSummary.session.status,"rejected");equal(rejectedSummary.committedPoints,null);equal(rejectedSummary.totalPoints,0);
  const pendingSummary=await rpc(user,"get_my_ride_summary",[pending,false]);equal(pendingSummary.session.status,"active");equal(pendingSummary.totalPoints,null);
  await db`UPDATE campaign SET lifecycle_status='confirmed' WHERE id=${campaign}`;
  await db`UPDATE campaign_signup SET status='selected' WHERE campaign_id=${campaign} AND rider_id=${rider}`;
  equal((await rpc(user,"get_my_campaign_catalog"))[0].canConfirm,true);
  await rpc(user,"rider_campaign_confirm",[campaign]);
  equal((await db`SELECT count(*)::int n FROM campaign_assignment WHERE campaign_id=${campaign} AND rider_id=${rider}`)[0].n,1);
  equal((await rpc(user,"get_my_campaign_catalog"))[0].signupStatus,"confirmed");equal((await rpc(user,"get_my_campaign_catalog"))[0].canConfirm,false);
  equal((await rpc(user,"get_my_campaign_catalog"))[0].canWithdraw,false);
  // Existing earned-achievement authority; no unapproved badge is activated.
  const badge = id(),
    eco = id(),
    published = id(),
    draft = id();
  await db`INSERT INTO rider_badge_definition(id,code,rule_type,rule_threshold,is_active) VALUES(${badge},'first_ride','min_total_rides',1,true),(${eco},'eco_guardian','unapproved_impact',1,false)`;
  await as(user, "SELECT to_jsonb(x) r FROM sync_my_achievement_progress() x");
  await as(user, "SELECT to_jsonb(x) r FROM sync_my_achievement_progress() x");
  equal(
    (
      await db`SELECT count(*)::int n FROM rider_badge_award WHERE rider_id=${rider} AND badge_definition_id=${badge}`
    )[0].n,
    1,
  );
  equal(
    (
      await db`SELECT count(*)::int n FROM rider_badge_award WHERE badge_definition_id=${eco}`
    )[0].n,
    0,
  );
  await as(other, "SELECT to_jsonb(x) r FROM sync_my_achievement_progress() x");
  equal(
    (
      await db`SELECT count(*)::int n FROM rider_badge_award WHERE rider_id=${otherRider}`
    )[0].n,
    0,
  );
  await db`INSERT INTO brand(id,status) VALUES(${published},'published'),(${draft},'draft')`;
  await rpc(user, "set_rider_brand_preference", [
    published,
    "preferred",
    "account_brand_preferences",
  ]);
  equal(
    (await db`SELECT preference FROM rider_brand_preference WHERE rider_id=${rider}`)[0]
      .preference,
    "preferred",
  );
  equal(
    (
      await db`SELECT count(*)::int n FROM rider_brand_preference WHERE rider_id=${otherRider}`
    )[0].n,
    0,
  );
  await deny(
    () =>
      rpc(user, "set_rider_brand_preference", [
        draft,
        "preferred",
        "account_brand_preferences",
      ]),
    /not available/,
  );
  await db`UPDATE "user" SET status='suspended' WHERE id=${user}`;
  await deny(
    () =>
      rpc(user, "set_rider_brand_preference", [
        published,
        "avoided",
        "account_brand_preferences",
      ]),
    /Account access restricted/,
  );
  await deny(
    () => as(user, "SELECT to_jsonb(x) r FROM sync_my_achievement_progress() x"),
    /Account access restricted/,
  );
  await db`UPDATE "user" SET status='active' WHERE id=${user}`;
  // Real creator eligibility, durable create replay, organizer edits and stale cancellation.
  const communityOperation = id(),
    communityPayload = {
      title: "Isolated community ride",
      description: "Synthetic fixture",
      scheduledAt: "2099-07-01T07:00:00.000Z",
      meetingPoint: "Station",
      category: "social",
      maxParticipants: 20,
    };
  await deny(
    () => rpc(user, "create_my_community_ride", [communityOperation, communityPayload]),
    /eligibility required/,
  );
  await db`INSERT INTO community_ride_creator_grant(user_id) VALUES(${user})`;
  const created = await Promise.all(
    Array.from({ length: 8 }, () =>
      rpc(user, "create_my_community_ride", [communityOperation, communityPayload]),
    ),
  );
  equal(new Set(created.map((x) => x.id)).size, 1);
  equal((await db`SELECT count(*)::int n FROM community_ride`)[0].n, 1);
  const community = created[0];
  await deny(
    () => rpc(other, "cancel_my_community_ride", [community.id, community.updated_at]),
    /Organizer access required/,
  );
  await deny(
    () =>
      rpc(user, "cancel_my_community_ride", [community.id, "2000-01-01T00:00:00.000Z"]),
    /Ride changed/,
  );
  await rpc(user, "cancel_my_community_ride", [community.id, community.updated_at]);
  await rpc(user, "cancel_my_community_ride", [community.id, community.updated_at]);
  equal(
    (
      await db`SELECT count(*)::int n FROM community_ride_change_log WHERE community_ride_id=${community.id}`
    )[0].n,
    1,
  );
  const secondCommunity = await rpc(user, "create_my_community_ride", [
    id(),
    { ...communityPayload, title: "Edit test" },
  ]);
  const edited = await as(
    user,
    "SELECT to_jsonb(r) r FROM update_community_ride($1,$2::text::timestamptz,$3,$4,$5::text::timestamptz,$6,$7,$8) r",
    [
      secondCommunity.id,
      secondCommunity.updated_at,
      "Updated title",
      "Synthetic edit",
      communityPayload.scheduledAt,
      "New station",
      "social",
      15,
    ],
  );
  equal(edited.success, true);
  equal(
    (
      await db`SELECT meeting_point_name FROM community_ride WHERE id=${secondCommunity.id}`
    )[0].meeting_point_name,
    "New station",
  );
  const stale = await as(
    user,
    "SELECT to_jsonb(r) r FROM update_community_ride($1,$2::text::timestamptz,$3,$4,$5::text::timestamptz,$6,$7,$8) r",
    [
      secondCommunity.id,
      "2000-01-01T00:00:00.000Z",
      "Another title",
      "",
      communityPayload.scheduledAt,
      "Station",
      "social",
      15,
    ],
  );
  equal(stale.error_code, "conflict");
  // Inject audit failure: both the business state and its command receipt must roll back.
  await db.unsafe(
    `CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected audit failure';END $$;CREATE TRIGGER fail_test_audit BEFORE INSERT ON platform_audit_record FOR EACH ROW EXECUTE FUNCTION fail_test_audit()`,
  );
  await deny(
    () =>
      rpc(operator, "ops_incident_command", [
        null,
        null,
        null,
        { title: "Rollback", severity: "high" },
        id(),
      ]),
    /injected audit failure/,
  );
  equal(
    (await db`SELECT count(*)::int n FROM ops_incident WHERE title='Rollback'`)[0].n,
    0,
  );
  await db.unsafe("DROP TRIGGER fail_test_audit ON platform_audit_record");
  if (process.argv.includes("--http"))
    n += await require("./test-alignment-http.cjs")({
      db,
      user,
      rider,
      other,
      otherRider,
      operator,
      campaign,
    });
  console.log(
    JSON.stringify({
      assertions: n,
      database: "isolated PostgreSQL 17",
      productionMutations: false,
    }),
  );
}
module.exports = { fixture };
if (require.main === module) main()
  .catch((e) => {
    console.error(e.stack, e.where ?? "", e.position ?? "");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db) await db.end();
    await root
      .unsafe("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)")
      .catch(() => {});
    await root.end();
  });
