// Owner-approved production installation of scripts/081_rider_status_command.sql.
// --check: read-only preflight. --apply: requires MOVRR_OWNER_APPROVED_SQL_SHA256. --verify: read-only readback.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict"), postgres = require("postgres");
const repo = path.resolve(__dirname, "../../.."), mode = process.argv[2];
assert(["--check", "--apply", "--verify"].includes(mode), "Choose --check, --apply or --verify");
const file = "scripts/081_rider_status_command.sql", version = "20261022150000", name = "081_rider_status_command";
const signature = "public.admin_set_rider_status(uuid,uuid,boolean,boolean,text,boolean)";
const sql = fs.readFileSync(path.join(repo, file), "utf8").replace(/\r\n/g, "\n");
const sha256 = crypto.createHash("sha256").update(sql).digest("hex");
if (mode === "--apply") assert.equal(process.env.MOVRR_OWNER_APPROVED_SQL_SHA256, sha256, `Owner approval required for ${file}, SHA-256 ${sha256}`);
const env = Object.fromEntries(fs.readFileSync(path.join(repo, ".env"), "utf8").split(/\r?\n/).filter(l => /^[A-Z_][A-Z_0-9]*=/.test(l))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")]; }));
assert(new URL(env.DATABASE_URL).username.endsWith(".kzdvunpuxaxlphqvmzxw"), "Unexpected production project");
const db = postgres(env.DATABASE_URL, { ssl: "require", max: 1, connect_timeout: 20, onnotice: () => {},
  connection: { application_name: "movrr-owner-approved-rider-status-081", statement_timeout: "30000", ...(mode === "--apply" ? {} : { default_transaction_read_only: "on" }) } });
const q = s => '"' + s.replaceAll('"', '""') + '"';

const fingerprint = async tx => {
  const r = {};
  for (const t of await tx`select schemaname,tablename from pg_tables where schemaname in ('auth','public') order by 1,2`)
    r[t.schemaname + "." + t.tablename] = (await tx.unsafe(`select count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from ${q(t.schemaname)}.${q(t.tablename)} t`))[0];
  return r;
};
const gates = async tx => ({
  deletion: (await tx`select requests_enabled,managed_resources_execution_enabled from public.account_deletion_contract_gate where singleton`)[0],
  shop: (await tx`select state,redemption_enabled from public.shop_release_control where singleton`)[0],
});
const installed = async tx => tx`select p.oid::regprocedure::text sig,p.prosecdef,p.proconfig,p.proacl::text acl,
  has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_role,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_set_rider_status'`;
const columns = async (tx, t) => (await tx`select column_name from information_schema.columns where table_schema='public' and table_name=${t}`).map(c => c.column_name);
const prerequisites = async tx => {
  const rider = await columns(tx, "rider"), audit = await columns(tx, "platform_audit_record"), activity = await columns(tx, "user_activity"), admin = await columns(tx, "admin_users");
  return {
    opsCapabilities: (await tx`select to_regprocedure('public.ops_employee_capabilities(text)') is not null ok`)[0].ok,
    managerHasRidersManage: (await tx`select public.ops_employee_capabilities('operations_manager') ? 'riders.manage' ok`)[0].ok,
    authRole: (await tx`select to_regprocedure('auth.role()') is not null ok`)[0].ok,
    riderStatus: (await tx`select enum_range(null::public.rider_status)::text v`)[0].v,
    riderColumns: ["id", "user_id", "status"].every(c => rider.includes(c)),
    riderHasNoUpdatedAt: !rider.includes("updated_at"),
    auditColumns: ["actor_user_id", "principal_type", "capability", "target_entity_type", "target_entity_id", "previous_state", "resulting_state", "correlation_id", "reason"].every(c => audit.includes(c)),
    activityColumns: ["user_id", "actor_user_id", "source", "action", "description", "related_entity_type", "related_entity_id", "metadata"].every(c => activity.includes(c)),
    adminColumns: ["user_id", "role"].every(c => admin.includes(c)),
    journalEntry: (await tx`select count(*)::int n from supabase_migrations.schema_migrations where version=${version} or name=${name}`)[0].n,
    latestJournal: (await tx`select version,name from supabase_migrations.schema_migrations order by version desc limit 1`)[0],
  };
};

(async () => {
  try {
    const result = await db.begin("isolation level repeatable read", async tx => {
      if (mode === "--apply") {
        await tx.unsafe("SET LOCAL lock_timeout='5s'");
        await tx.unsafe("LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE");
      }
      const protectedGates = await gates(tx), before = await installed(tx);
      if (mode === "--verify") {
        const journal = (await tx`select version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum,created_by,rollback from supabase_migrations.schema_migrations where version=${version}`)[0];
        assert(journal && journal.checksum === sha256, "Journal missing or source checksum differs");
        return { mode, sha256, verifiedAt: new Date().toISOString(), journal, function: before, gates: protectedGates };
      }
      const pre = await prerequisites(tx);
      assert(pre.opsCapabilities && pre.managerHasRidersManage && pre.authRole && pre.riderColumns && pre.auditColumns && pre.activityColumns && pre.adminColumns, "Prerequisite missing: " + JSON.stringify(pre));
      assert.equal(pre.riderStatus, "{active,inactive,suspended}", "Rider status enum drift");
      assert.equal(pre.journalEntry, 0, "Migration 081 already journaled");
      assert.equal(before.length, 0, "admin_set_rider_status already exists (drift)");
      assert(pre.latestJournal.version < version, "Journal has a later version: " + JSON.stringify(pre.latestJournal));
      assert.equal(protectedGates.deletion.requests_enabled, true);
      assert.equal(protectedGates.deletion.managed_resources_execution_enabled, false);
      assert.equal(protectedGates.shop.redemption_enabled, false);
      assert.equal(protectedGates.shop.state, "disabled");
      if (mode === "--check") return { mode, file, sha256, version, prerequisites: pre, gates: protectedGates };

      const fpBefore = await fingerprint(tx);
      await tx.unsafe(sql.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, ""));
      await tx`insert into supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback)
        values(${version},${name},${[sql]},'owner-approved',${"rider-status-081:" + sha256},${["DROP FUNCTION " + signature + ";"]})`;
      const after = await installed(tx), fpAfter = await fingerprint(tx);
      assert.equal(after.length, 1);
      const f = after[0];
      assert.equal(f.sig, "admin_set_rider_status(uuid,uuid,boolean,boolean,text,boolean)");
      assert.equal(f.prosecdef, true);
      assert.deepEqual(f.proconfig, ['search_path=""']);
      assert.equal(f.anon, false);
      assert.equal(f.authenticated, false);
      assert.equal(f.service_role, true);
      assert(!/(^|[{,])=X/.test(f.acl), "PUBLIC execute present");
      assert.deepEqual(await gates(tx), protectedGates);
      const changed = Object.keys(fpBefore).filter(t => JSON.stringify(fpBefore[t]) !== JSON.stringify(fpAfter[t]));
      assert.deepEqual(changed, [], "Unexpected record changes; migration rolled back");
      return { mode, file, sha256, version, name, appliedAt: new Date().toISOString(), prerequisites: pre, function: f, gates: protectedGates, tablesCompared: Object.keys(fpBefore).length, changedRecords: changed };
    });
    if (mode !== "--check") {
      const out = path.join(repo, "docs/verification/rider-status-081");
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, mode === "--apply" ? "applied.json" : "verified.json"), JSON.stringify(result, null, 2) + "\n");
    }
    console.log(JSON.stringify(result, null, 1));
  } finally { await db.end({ timeout: 5 }); }
})().catch(e => { console.error("STOPPED:", e.message); process.exitCode = 1; });
