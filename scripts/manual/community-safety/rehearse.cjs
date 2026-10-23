// Current schema-only production export, disposable LOCAL database, synthetic data.
// Run preflight.cjs --schema-only first. Never connects to production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),capture=path.join(repo,'.tmp/community-safety-rollout-20261023');
const out=path.join(repo,'.tmp/community-safety-p1-20261023');
fs.mkdirSync(out,{recursive:true});
const pre=JSON.parse(fs.readFileSync(path.join(capture,'preflight.json')));
const schema=fs.readFileSync(path.join(capture,'production-schema-only.sql'),'utf8');
const migration=fs.readFileSync(path.join(repo,'scripts/082_community_safety.sql'),'utf8').replace(/\r\n/g,'\n');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
// The captured schema remains authoritative; rehearse the current candidate,
// rather than requiring its hash to equal the known failing old migration.
assert.equal(hash(schema),'3930a9082a74505ca611a5bbffa6bbf9f907c56aec65017b1ff325f57419c3aa');
const options={host:'127.0.0.1',port:55469,username:'postgres',password:'isolated-local-test-only',max:1,onnotice(){}};
const name='safety_rollout_'+process.pid,root=postgres({...options,database:'postgres'}),db=postgres({...options,database:name});
const quote=s=>'"'+s.replaceAll('"','""')+'"';
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++};
let stage='restore';
const withoutTransaction=s=>s.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const as=(user,fn)=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claim.role','authenticated',true)`;return fn(tx)});
(async()=>{
 await root.unsafe('CREATE DATABASE '+name);
 for(const role of pre.roles)if(role.rolname!=='postgres')await db.unsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role.rolname.replaceAll("'","''")}') THEN CREATE ROLE ${quote(role.rolname)} NOLOGIN ${role.rolbypassrls?'BYPASSRLS':''}; END IF; END $$;`);
 await db.unsafe('CREATE SCHEMA extensions; CREATE SCHEMA shop_transport; CREATE EXTENSION postgis; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION http WITH SCHEMA shop_transport;');
 // pg_dump excludes extension definitions with an explicit schema selection.
 // No external HTTP/push worker is installed or run. SQL function body checks are
 // disabled by pg_dump itself; the single notification trigger is adapted below.
 const restored=schema.replace(/^\\.*$/gm,'').replace('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;');
 await db.unsafe(restored);
 // pg_dump disables RLS for its restore session; authenticated acceptance must
 // use normal runtime RLS, rather than the dump's fail-on-filter setting.
 await db.unsafe('SET row_security=on; SET check_function_bodies=true;');
 await db.unsafe(`CREATE OR REPLACE FUNCTION public.webhook_send_push_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`);
 const beforeTables=(await db`SELECT count(*)::int n FROM pg_tables WHERE schemaname IN ('public','auth','storage')`)[0].n;
 stage='seed synthetic accounts';
 const owner=crypto.randomUUID(),viewer=crypto.randomUUID();
 for(const user of [owner,viewer])await db`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${user},${user+'@example.invalid'},'{"account_type":"rider","full_name":"Isolated Safety rehearsal"}')`;
 const riders=await db`SELECT id,user_id FROM public.rider WHERE user_id IN (${owner},${viewer})`;
 equal(riders.length,2);
 const organiser=riders.find(r=>r.user_id===owner).id,participant=riders.find(r=>r.user_id===viewer).id;
 await db`INSERT INTO public.community_ride_creator_grant(user_id) VALUES(${owner})`;
 stage='seed existing ride';
 const ride=crypto.randomUUID();
 const coverPath=owner+'/'+ride+'/cover.png';
 await db`INSERT INTO storage.buckets(id,name,public) VALUES('community-rides','community-rides',true)`;
 await db`INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('community-rides',${coverPath},${owner})`;
 await db.begin(async tx=>{await tx`SELECT set_config('request.jwt.claim.role','service_role',true)`;
 await tx`INSERT INTO public.community_ride(id,title,organizer_type,organizer_user_id,organizer_rider_id,created_by_user_id,organizer_name,scheduled_at,is_public,status,cover_image_url,cover_image_path) VALUES(${ride},'Existing full-schema ride','rider',${owner},${organiser},${owner},'Synthetic organiser',now()+interval '1 day',true,'upcoming','https://isolated.invalid/storage/v1/object/public/community-rides/cover.png',${coverPath})`;});
 stage='baseline join';
 equal((await as(viewer,tx=>tx`SELECT public.join_community_ride(${ride},${participant}) result`))[0].result.success,true);
 const snapshot=()=>db`SELECT * FROM public.community_ride_participant WHERE community_ride_id=${ride} ORDER BY rider_id`;
 const before=JSON.parse(JSON.stringify(await snapshot()));
 const aborted=Error('deliberate local rollback rehearsal');
 stage='rollback';
 await assert.rejects(db.begin(async tx=>{await tx.unsafe(withoutTransaction(migration));throw aborted}),error=>error===aborted);checks++;
 equal((await db`SELECT to_regclass('public.community_report')::text value`)[0].value,null);
 equal(JSON.parse(JSON.stringify(await snapshot())),before);
 await db.unsafe(migration);
 stage='post migration reads and block';
 const legacyRow=(await as(viewer,tx=>tx`SELECT cover_image_url,cover_image_path FROM public.community_ride WHERE id=${ride}`))[0];
 equal(legacyRow.cover_image_url,null);equal(legacyRow.cover_image_path,coverPath);
 equal((await db`SELECT public FROM storage.buckets WHERE id='community-rides'`)[0].public,false);
 const mobile=path.resolve(repo,'../movrr-mobile');
 const legacySource=cp.execFileSync('git',['-c','safe.directory='+mobile.replaceAll('\\','/'),'show','2c110d3:features/community/services/communityRides.ts'],{cwd:mobile,encoding:'utf8'});
 assert(legacySource.includes('coverImageUrl: row.cover_image_url'));assert(!legacySource.includes('createSignedUrl'));checks++;
 equal((await as(viewer,tx=>tx`SELECT count(*)::int n FROM public.community_ride WHERE id=${ride} AND is_public AND moderation_state='approved'`))[0].n,1);
 await as(viewer,tx=>tx`SELECT public.set_community_block(${organiser},true)`);
 equal(JSON.parse(JSON.stringify(await snapshot())),before);
 equal((await as(viewer,tx=>tx`SELECT count(*)::int n FROM public.community_ride_participant WHERE community_ride_id=${ride}`))[0].n,2);
 await as(viewer,tx=>tx`SELECT public.set_community_block(${organiser},false)`);
 equal(JSON.parse(JSON.stringify(await snapshot())),before);
 stage='account status authorization';
 for(const status of ['inactive','suspended','deleted']) {
  if(status==='inactive') await db`UPDATE public.rider SET status='inactive' WHERE id=${participant}`;
  else await db`UPDATE public."user" SET status=${status} WHERE id=${viewer}`;
  for(const command of [
   tx=>tx`SELECT public.report_community_content(${ride},'ride','other','Denied status')`,
   tx=>tx`SELECT public.set_community_block(${organiser},true)`,
   tx=>tx`SELECT public.set_community_block(${organiser},false)`
  ]) {await assert.rejects(as(viewer,command),e=>e.code==='42501');checks++;}
  await db`UPDATE public."user" SET status='active' WHERE id=${viewer}`;
  await db`UPDATE public.rider SET status='active' WHERE id=${participant}`;
 }
 const report=(await as(viewer,tx=>tx`SELECT public.report_community_content(${ride},'ride','other','Active report') id`))[0].id;
 equal(typeof report,'string');
 stage='restricted account lifecycle probe';
 // Model the existing established write fence without creating a deletion
 // request, activating a gate or invoking irreversible deletion.
 // The deployed AFTER INSERT trigger establishes the fence for this local job.
 const competing=postgres({...options,database:name,connection:{application_name:'safety_fence_contender'}});
 let pendingWrite;
 try {
  await db.begin(async tx=>{
   await tx`INSERT INTO public.account_deletion_jobs(user_id) VALUES(${viewer})`;
   // The uncommitted canonical restriction owns the guard lock. A concurrent
   // Safety request must wait and then deny, rather than read stale state.
   pendingWrite=competing.begin(async writer=>{
    await writer.unsafe('SET LOCAL ROLE authenticated');
    await writer`SELECT set_config('request.jwt.claim.sub',${viewer},true),set_config('request.jwt.claim.role','authenticated',true)`;
    return writer`SELECT public.set_community_block(${organiser},true)`;
   }).then(()=>({code:'unexpected_success'}),e=>({code:e.code}));
   let waiting=false;
   for(let i=0;i<40;i++){
    waiting=(await root`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=${name} AND application_name='safety_fence_contender' AND wait_event_type='Lock') waiting`)[0].waiting;
    if(waiting)break;
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   equal(waiting,true);
  });
  equal((await pendingWrite).code,'42501');
 } finally {await competing.end();}
 await assert.rejects(as(viewer,tx=>tx`UPDATE public.community_ride_participant SET status='joined' WHERE community_ride_id=${ride} AND rider_id=${participant}`),error=>error.code==='42501');checks++;
 const restrictedAccountWrites={};
 for(const [key,operation] of [
  ['block',()=>as(viewer,tx=>tx`SELECT public.set_community_block(${organiser},true)`)],
  ['report',()=>as(viewer,tx=>tx`SELECT public.report_community_content(${ride},'ride','other','Isolated lifecycle probe')`)]
 ]) {try{await operation();restrictedAccountWrites[key]='succeeded';}catch(error){restrictedAccountWrites[key]=error.code;}}
 equal(restrictedAccountWrites,{block:'42501',report:'42501'});
 await assert.rejects(as(viewer,tx=>tx`SELECT public.set_community_block(${organiser},false)`),e=>e.code==='42501');checks++;
 const missingLifecycleTables=await db`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('community_report','community_block','community_moderation_audit') AND NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=('public.'||tablename)::regclass AND NOT t.tgisinternal AND pg_get_triggerdef(t.oid) ILIKE '%account_deletion%') ORDER BY tablename`;
 equal(missingLifecycleTables.length,0);
 const retentionColumns=await db`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('community_report','community_moderation_audit') AND column_name IN ('resolved_at','closed_at','expires_at','hold_id') ORDER BY 1,2`;
 const result={capturedAt:new Date().toISOString(),productionMutations:false,migrationSha256:hash(migration),schemaSha256:hash(schema),sourceTables:beforeTables,assertions:checks,rollbackBeforeCommitVerified:true,existingParticipationAndRosterPreserved:true,fullCurrentSchemaInstalled:true,externalAdapter:'webhook_send_push_notification replaced with inert local trigger; no outbound push',oldClient:{baseline:'2c110d3',sourceSha256:hash(legacySource),usesPublicCoverField:true,signsPrivateCoverPaths:false,postMigrationCoverUrl:legacyRow.cover_image_url,bucketPublic:false,supportedClientTransitionVerified:false},missingLifecycleTableBarriers:missingLifecycleTables.map(r=>r.tablename),restrictedAccountWrites,retentionLifecycleColumns:retentionColumns,fullErasureAcceptance:false};
 fs.writeFileSync(path.join(out,'rehearsal.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(error=>{console.error(JSON.stringify({stage,message:error.message,code:error.code,where:error.where}));process.exitCode=1}).finally(async()=>{await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await root.end()});
