// Read-only production preflight. No migration, test identities or writes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process'), assert = require('node:assert/strict');
const postgres = require('postgres');
const repo = path.resolve(__dirname, '../../..');
const project = 'kzdvunpuxaxlphqvmzxw';
const out = path.resolve(repo, process.env.MOVRR_COMMUNITY_PREFLIGHT_DIR || '.tmp/community-safety-rollout-20261023');
assert(out.startsWith(path.join(repo, '.tmp') + path.sep), 'Preflight output must stay in ignored task storage');
fs.mkdirSync(out, { recursive: true });
const env = Object.fromEntries(fs.readFileSync(path.join(repo, '.env'), 'utf8').split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z_0-9]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : [];
}));
const target = new URL(env.DATABASE_URL);
assert(target.username.endsWith('.' + project), 'Unexpected database target');
if (env.NEXT_PUBLIC_SUPABASE_URL) assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, project + '.supabase.co');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const migration = fs.readFileSync(path.join(repo, 'scripts/082_community_safety.sql'));
const db = postgres(env.DATABASE_URL, { ssl: 'require', max: 1, connect_timeout: 20, onnotice() {},
  connection: { application_name: 'movrr-community-safety-read-only-preflight', default_transaction_read_only: 'on', statement_timeout: '30000' } });
const quote = name => '"' + name.replaceAll('"', '""') + '"';
(async () => {
  const result = await db.begin('isolation level repeatable read read only', async tx => {
    const baseline = {};
    for (const table of ['community_ride', 'community_ride_participant', 'community_ride_invites', 'community_ride_creator_grant']) {
      baseline[table] = (await tx.unsafe(`SELECT count(*)::int records, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM public.${quote(table)} t`))[0];
    }
    const policies = await tx`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE (schemaname='public' AND tablename IN ('community_ride','community_ride_participant','community_ride_creator_grant')) OR (schemaname='storage' AND tablename='objects' AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%community-rides%') ORDER BY schemaname,tablename,policyname`;
    const captured = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/community/safety-deployed-contracts.json')));
    const helperDrift = [];
    for (const helper of captured.helpers) {
      const current = (await tx`SELECT pg_get_functiondef(to_regprocedure(${helper.signature})) definition`)[0];
      if (!current || current.definition.replace(/\r\n/g, '\n') !== helper.definition.replace(/\r\n/g, '\n')) helperDrift.push(helper.signature);
    }
    return {
      capturedAt: new Date().toISOString(), project, productionMutations: false,
      isolation: 'repeatable read read only; default_transaction_read_only=on',
      sourceRevision: cp.execFileSync('git', ['-c', 'safe.directory=' + repo.replaceAll('\\', '/'), 'rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
      migration: { file: 'scripts/082_community_safety.sql', sha256Bytes: hash(migration), sha256Utf8Lf: hash(migration.toString('utf8').replace(/\r\n/g, '\n')) },
      latestMigrations: await tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 8`,
      safetyInstalled: await tx`SELECT to_regclass('public.community_report')::text reports,to_regclass('public.community_block')::text blocks,to_regprocedure('public.report_community_content(uuid,text,text,text)')::text reporting,to_regprocedure('public.moderate_community_content(uuid,uuid,uuid,bigint,text,text,uuid,bigint)')::text moderation`,
      prerequisites: await tx`SELECT signature,to_regprocedure(signature) IS NOT NULL installed FROM unnest(ARRAY['public.community_rider_account_active(uuid)','public.join_community_ride(uuid,uuid)','public.update_community_ride(uuid,timestamptz,text,text,timestamptz,text,text,integer,numeric,text,text,double precision,double precision,text)','public.create_or_get_community_ride_invite(uuid,uuid,text)','public.resolve_invite_code(text)','public.assert_active_account()']) signature`,
      capturedPolicyCount: captured.policies.length, currentPolicyCount: policies.length,
      policiesMatchCaptured: JSON.stringify(policies) === JSON.stringify(captured.policies), helperDrift,
      communityRecords: baseline,
      publicRides: (await tx`SELECT count(*)::int total,count(*) FILTER(WHERE cover_image_path IS NOT NULL)::int with_paths,count(*) FILTER(WHERE cover_image_url IS NOT NULL)::int with_urls,count(*) FILTER(WHERE cover_image_path IS NULL AND cover_image_url IS NOT NULL)::int url_only FROM public.community_ride WHERE is_public`)[0],
      coverBucket: (await tx`SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='community-rides'`)[0],
      gates: {
        deletion: (await tx`SELECT requests_enabled,managed_resources_execution_enabled FROM public.account_deletion_contract_gate WHERE singleton`)[0],
        shop: (await tx`SELECT state,redemption_enabled FROM public.shop_release_control WHERE singleton`)[0]
      },
      retentionRegistry: await tx`SELECT policy_version,category,period::text,start_event,approval_status FROM public.account_deletion_retention_rule ORDER BY policy_version,category`,
      extensions: await tx`SELECT e.extname,n.nspname schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1`,
      roles: await tx`SELECT rolname,rolbypassrls FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY 1`
    };
  });
  fs.writeFileSync(path.join(out, 'preflight.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ project, migration: result.migration, safetyInstalled: result.safetyInstalled,
    prerequisites: result.prerequisites, policiesMatchCaptured: result.policiesMatchCaptured,
    helperDrift: result.helperDrift, publicRides: result.publicRides, gates: result.gates }));
  if (process.argv.includes('--schema-only')) {
    const schema = cp.execFileSync('docker', ['--context', 'desktop-linux', 'run', '--rm', '--pull=never',
      '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGDATABASE', '--env', 'PGSSLMODE', '--env', 'PGOPTIONS',
      '--entrypoint', 'pg_dump', 'public.ecr.aws/supabase/postgres:17.11.0.004',
      '--schema-only', '--schema=public', '--schema=auth', '--schema=storage', '--no-owner', '--lock-wait-timeout=5s'],
    { env: { ...process.env, PGHOST: target.hostname, PGPORT: target.port || '5432', PGUSER: decodeURIComponent(target.username),
      PGPASSWORD: decodeURIComponent(target.password), PGDATABASE: target.pathname.slice(1), PGSSLMODE: 'require', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=60000' },
      maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    fs.writeFileSync(path.join(out, 'production-schema-only.sql'), schema);
    console.log(JSON.stringify({ schemaOnlySha256: hash(schema), bytes: schema.length, containsTableData: false }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
