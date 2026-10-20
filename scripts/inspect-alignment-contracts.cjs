// Read-only metadata, release gates and identifier-free aggregates. No customer-record exports.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const postgres = require("postgres");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "../.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z_0-9]*=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
assert(new URL(env.DATABASE_URL).username.endsWith(".kzdvunpuxaxlphqvmzxw"));
const db = postgres(env.DATABASE_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 15,
  connection: {
    application_name: "movrr-alignment-readonly",
    default_transaction_read_only: "on",
    statement_timeout: "30000",
  },
});
(async () => {
  const result = await db.begin("read only", async (tx) => ({
    inspectedAt: new Date().toISOString(),
    functions:
      await tx`SELECT p.oid::regprocedure::text signature, pg_get_functiondef(p.oid) definition, p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname IN ('current_rider_id','get_ride_award_components','get_ride_awards_for_rider','get_lifetime_impact_summary','get_my_ride_history_summaries','get_my_ride_summary','get_ride_reward_read_state','rider_campaign_opt_in','rider_campaign_confirm','rider_campaign_withdraw','get_authenticated_rider_id','can_create_community_ride','update_community_ride','join_community_ride','leave_community_ride','confirm_campaign_accessory_installed','report_campaign_accessory_issue','get_account_deletion_lifecycle','sync_my_achievement_progress','set_rider_brand_preference') OR p.proname LIKE 'account_deletion%status%') ORDER BY 1`,
    columns:
      await tx`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('user','rider','rider_reward_balance','reward_transactions','ride_session','ride_reward_settlement','rider_campaign_accessory_assignment','campaign_accessory_inventory_item','rider_campaign_accessory_event','campaign','user_preferences','community_ride','account_deletion_jobs','platform_audit_record','rider_campaign_accessory_overview','rider_brand_catalog','rider_badge_award','rider_badge_definition','brand','rider_brand_preference','rider_brand_preference_event','ride_reward_configuration_snapshot') ORDER BY table_name,ordinal_position`,
    enums:
      await tx`SELECT t.typname,array_agg(e.enumlabel ORDER BY e.enumsortorder) labels FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname`,
    policies:
      await tx`SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('user','rider','community_ride','ride_session','reward_transactions','user_preferences') ORDER BY tablename,policyname`,
    localeCoverage: await tx`SELECT count(*) FILTER(WHERE language IS NULL)::int missing,count(*) FILTER(WHERE language IN ('en-US','nl-NL'))::int supported,count(*) FILTER(WHERE language IN ('en','nl'))::int legacy,count(*) FILTER(WHERE language IS NOT NULL AND language NOT IN ('en-US','nl-NL','en','nl'))::int unsupported FROM public.user_preferences`,
    deletionContract: await tx`SELECT public.account_deletion_contract_status() status`,
    shop: await tx`SELECT redemption_enabled FROM public.shop_release_control`,
  }));
  if(process.argv.includes("--check-baseline")) {
    const expectedFunctions=fs.readFileSync(path.join(__dirname,"fixtures/alignment/production-functions.sql"),"utf8").replace(/\r/g,"");
    const captured="-- Read-only production contract capture. No customer records.\n"+result.functions.map(f=>f.definition.replace(/\r/g,"").trimEnd()+";").join("\n\n")+"\n";
    assert.equal(captured,expectedFunctions,"Function contract drift requires review before rollout");
    const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures/alignment/schema.json"),"utf8"));
    assert.deepEqual(result.columns.filter(c=>!["rider_brand_catalog","rider_campaign_accessory_overview"].includes(c.table_name)),baseline.columns,"Column contract drift requires review");
    const sorted=values=>[...values].sort((a,b)=>a.typname.localeCompare(b.typname));
    assert.deepEqual(sorted(result.enums),sorted(baseline.enums),"Enum contract drift requires review");
    assert(result.shop.every(x=>x.redemption_enabled===false),"Public Shop redemption must remain disabled");
  }
  const out = path.join(__dirname, "../.tmp/enterprise-alignment");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, "production-contracts.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      readOnly: true,
      functions: result.functions.map((x) => x.signature),
      columnCount: result.columns.length,
    deletionContract: result.deletionContract,localeCoverage: result.localeCoverage,
      shopDisabled: result.shop.every((x) => x.redemption_enabled === false),
    }),
  );
})()
  .catch((e) => {
    console.error(e.code || e.name, "Read-only contract inspection failed");
    process.exitCode = 1;
  })
  .finally(() => db.end());
