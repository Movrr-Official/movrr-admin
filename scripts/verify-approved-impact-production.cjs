// Read-only SQL and API reconciliation. Never invokes awards or writes business records.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), postgres = require('postgres');
const root = path.resolve(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_][A-Z_0-9]*=/.test(line)).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, '')];
  }));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, 'kzdvunpuxaxlphqvmzxw.supabase.co');
const db = postgres(env.DATABASE_URL, { ssl: 'require', max: 1, connect_timeout: 15,
  connection: { default_transaction_read_only: 'on', statement_timeout: '20000', application_name: 'movrr-impact-readonly-reconciliation' } });
const hash = text => crypto.createHash('sha256').update(text.replace(/\r/g, '')).digest('hex');
let assertions = 0;
const equal = (a, b) => { assert.deepEqual(a, b); assertions++; };
(async () => {
 try {
  const result = await db.begin('read only', async tx => ({
   checkedAt: new Date().toISOString(), project: 'kzdvunpuxaxlphqvmzxw',
   readOnly: (await tx`SHOW transaction_read_only`)[0].transaction_read_only,
   method: (await tx`SELECT public.get_impact_methodology() m`)[0].m,
   reported: (await tx`SELECT * FROM public.get_impact_summary(null)`)[0],
   expected: (await tx`SELECT count(*) total_rides,coalesce(sum(total_distance_meters)/1000,0) total_distance_km,
    coalesce(round(sum(total_distance_meters)/1000*0.190,2),0) co2_saved_kg FROM public.ride_session
    WHERE status='completed' AND verification_result->>'status'='verified'
    AND completed_at IS NOT NULL AND completed_at<=statement_timestamp() AND total_distance_meters>0
    AND total_distance_meters::text NOT IN ('NaN','Infinity','-Infinity')`)[0],
   period: (await tx`SELECT coalesce(sum("distanceKm"),0) distance_km,round(coalesce(sum("co2SavedKg"),0),2) comparison_kg_co2e
    FROM public.get_impact_daily(30)`)[0],
   expectedPeriod: (await tx`SELECT coalesce(sum(total_distance_meters)/1000,0) distance_km,
    coalesce(round(sum(total_distance_meters)/1000*0.190,2),0) comparison_kg_co2e FROM public.ride_session
    WHERE status='completed' AND verification_result->>'status'='verified'
    AND completed_at IS NOT NULL AND completed_at<=statement_timestamp() AND total_distance_meters>0
    AND total_distance_meters::text NOT IN ('NaN','Infinity','-Infinity')
    AND (completed_at AT TIME ZONE 'Europe/Amsterdam')::date >= (now() AT TIME ZONE 'Europe/Amsterdam')::date-29`)[0],
   migrations: await tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') digest
    FROM supabase_migrations.schema_migrations WHERE name IN ('059_alignment_impact','061_approved_impact_methodology',
    '062_impact_verified_history_coverage','063_impact_daily_precision') ORDER BY version`,
   functions: await tx`SELECT proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND proname IN ('get_impact_methodology','get_impact_ride_evidence','get_impact_summary',
    'get_impact_daily','get_lifetime_impact_summary') ORDER BY proname`,
   badge: (await tx`SELECT code,is_active,rule_type,unlock_rule FROM public.rider_badge_definition WHERE code='co2_50'`)[0],
   awardRuleExcluded: (await tx`SELECT position('co2_50' in pg_get_functiondef('public.sync_my_achievement_progress()'::regprocedure))=0 excluded`)[0].excluded,
   states: (await tx`SELECT public.account_deletion_contract_status() deletion,
    (SELECT jsonb_agg(redemption_enabled) FROM public.shop_release_control) shop`)[0]
  }));
  equal(result.readOnly, 'on');
  equal(result.method.methodologyId, 'MOVRR-NL-CAR-COMPARISON-2026-v2');
  equal(result.method.factorKgCo2ePerVehicleKm, 0.190); equal(result.method.scope, 'WTW');
  equal(result.method.factorEdition, 2026); equal(result.method.emissionsReferenceYear, 2025);
  equal(result.method.actualAvoidedEmissions, false);
  for (const key of Object.keys(result.expected)) equal(Number(result.reported[key]), Number(result.expected[key]));
  for (const key of Object.keys(result.expectedPeriod)) equal(Number(result.period[key]), Number(result.expectedPeriod[key]));
  equal(result.awardRuleExcluded, true); equal(result.badge.rule_type, null);
  equal(result.migrations.length, 4);
  for (const migration of result.migrations) {
   const source = fs.readFileSync(path.join(__dirname, migration.name + '.sql'), 'utf8');
   equal(hash(source), migration.digest);
   migration.sourceSha256 = hash(source);
  }
  equal(result.functions.length, 5);
  for (const fn of result.functions) {
   // Compare each installed body to its latest additive source, preserving immutable history.
   const file = fn.proname === 'get_impact_daily' ? '063_impact_daily_precision.sql'
    : ['get_impact_methodology','get_impact_ride_evidence'].includes(fn.proname) ? '062_impact_verified_history_coverage.sql' : '059_alignment_impact.sql';
   const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
   const body = source.slice(source.indexOf('FUNCTION public.' + fn.proname + '(')).match(/AS \$\$([\s\S]*?)\$\$;/)[1].trim();
   equal(fn.definition.split('$function$')[1].replace(/\r/g, '').trim(), body.replace(/\r/g, ''));
   equal(fn.definition.includes('0.180'), false);
   fn.sha256 = hash(fn.definition); delete fn.definition;
  }
  const api = async (name, body) => {
   const response = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST', signal: AbortSignal.timeout(15000), headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
     Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
   equal(response.status, 200); return response.json();
  };
  result.api = { method: await api('get_impact_methodology', {}), summary: await api('get_impact_summary', { p_rider: null }) };
  equal(result.api.method, result.method);
  for (const key of Object.keys(result.reported)) equal(Number(result.api.summary[0][key]), Number(result.reported[key]));
  result.assertions = assertions;
  result.productionMutations = false;
  const out = path.join(root, '.tmp/impact-activation-verification'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'production.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
 } finally { await db.end({ timeout: 5 }); }
})().catch(error => { console.error(JSON.stringify({ error: error.code || error.name, message: error.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') })); process.exitCode = 1; });
