// Explicit owner-authorized pre-launch 082 rollout. No automatic rollback,
// synthetic activity, role grants, Shop activation or irreversible deletion.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/community-safety-production-20261023');fs.mkdirSync(out,{recursive:true});
const expected='ddd69eb840097500310e0aa61da6b662f343eabb6db62d607ac8a4c5e7eaaf1d',version='20261023170000',name='082_community_safety';
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
const target=new URL(env.DATABASE_URL);assert(target.username.endsWith('.kzdvunpuxaxlphqvmzxw'));assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,'kzdvunpuxaxlphqvmzxw.supabase.co');
const sql=fs.readFileSync(path.join(repo,'scripts/082_community_safety.sql'),'utf8').replace(/\r\n/g,'\n'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(hash(sql),expected);
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:20,onnotice(){},connection:{application_name:'movrr-owner-authorized-safety-082',statement_timeout:'60000'}});
const sdk=require('@supabase/supabase-js').createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const save=(f,v)=>fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{mode:0o600}),load=f=>JSON.parse(fs.readFileSync(path.join(out,f),'utf8'));
const plain=v=>JSON.parse(JSON.stringify(v)),id=()=>crypto.randomUUID();
const tables=['community_ride','community_ride_participant','community_ride_invites','community_ride_creator_grant'];
async function snapshot(tx){const data={};for(const t of tables)data[t]=await tx.unsafe('SELECT * FROM public.'+t+' ORDER BY 1');
 const protectedRows={};const protectedTables=await tx`SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename ~ '^(reward_|rider_reward_|wallet|fulfilment|redemption|financial|ledger)' OR tablename IN ('admin_users','shop_release_control','account_deletion_contract_gate')) ORDER BY tablename`;
 for(const {tablename:t} of protectedTables)protectedRows[t]=(await tx.unsafe(`SELECT count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM public."${t}" t`))[0];
 return plain({data,protectedRows});}
function preserved(before,after){for(const t of tables.slice(1))assert.deepEqual(after.data[t],before.data[t],t+' changed');assert.deepEqual(after.protectedRows,before.protectedRows,'Financial/account/operating gates changed');
 const clean=r=>{const x={...r};for(const k of ['cover_image_url','cover_image_path','updated_at','moderation_state','moderation_version'])delete x[k];return x;};assert.deepEqual(after.data.community_ride.map(clean),before.data.community_ride.map(clean),'Ride/publication/participation semantics changed');}
async function journal(tx){return tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations WHERE version=${version} OR name=${name}`;}
const phase=process.argv[2]||'preflight';
(async()=>{
 if(phase==='preflight'){
  assert(!fs.existsSync(path.join(out,'backup.json')),'Recovery baseline already exists; inspect instead of overwriting');
  const baseline=await db.begin('isolation level repeatable read read only',async tx=>{assert.equal((await journal(tx)).length,0);assert.equal((await tx`SELECT to_regclass('public.community_report') x`)[0].x,null);return snapshot(tx);});
  const actor=(await db`SELECT a.user_id FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id WHERE a.role='super_admin' AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now())`);assert.equal(actor.length,1,'Unambiguous existing authorized release actor required');
  const mappings=[];for(const ride of baseline.data.community_ride){if(!ride.cover_image_path)continue;assert(ride.is_public&&ride.cover_image_url,'Unexpected nonpublic cover requires separate disposition');const u=new URL(ride.cover_image_url);assert.equal(u.origin,env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,''));
   const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert(bytes.length<=5*1024*1024);const file=id()+'.bin';fs.writeFileSync(path.join(out,file),bytes,{mode:0o600});const mime=(r.headers.get('content-type')||'').split(';')[0];assert(['image/jpeg','image/png','image/webp'].includes(mime));
   mappings.push({rideId:ride.id,oldPath:ride.cover_image_path,oldUrl:ride.cover_image_url,newPath:ride.organizer_user_id+'/'+ride.id+'/'+id()+'.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg'),file,mime,sha256:hash(bytes),operation:id()});
  }
  save('backup.json',{recordedAt:new Date().toISOString(),migrationChecksum:expected,version,name,actor:actor[0].user_id,baseline,mappings,authorization:'Owner instruction: MOVRR — Final Community Safety Production Rollout & Closure, 2026-10-23; pre-launch testing artifacts unsupported; no external legal opinion'});console.log(JSON.stringify({phase,coversBackedUp:mappings.length,rides:baseline.data.community_ride.length,protectedTables:Object.keys(baseline.protectedRows).length,productionMutations:false}));return;
 }
 const backup=load('backup.json');assert.equal(backup.migrationChecksum,expected);
 if(phase==='apply'){
  assert.equal(load('recovery-verified.json').verified,true,'Tested recovery required');
  const result=await db.begin('isolation level repeatable read',async tx=>{await tx.unsafe("SET LOCAL lock_timeout='5s'; LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE");await tx`SELECT pg_advisory_xact_lock(70001,1)`;assert.equal((await journal(tx)).length,0);assert.deepEqual(await snapshot(tx),backup.baseline,'Baseline drift; stop before apply');
   const latest=(await tx`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1`)[0];assert(latest.version<version,'New conflicting migration');
   await tx`SELECT set_config('movrr.migration_actor',${backup.actor},true)`;
   await tx.unsafe(sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
   await tx`INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback) VALUES(${version},${name},${[sql]},'owner-authorized Community Safety pre-launch rollout',${'community-safety:'+expected},${['-- Pre-commit transaction rollback; post-commit private containment/forward recovery. Never restore public access or discard evidence.']})`;
   const after=await snapshot(tx);preserved(backup.baseline,after);assert(after.data.community_ride.every(r=>r.moderation_state==='approved'&&r.cover_image_url===null));assert.equal((await tx`SELECT public FROM storage.buckets WHERE id='community-rides'`)[0].public,false);
   return {applied:true,journal:await journal(tx),preservationVerified:true,rides:after.data.community_ride.length,recordedAt:new Date().toISOString()};});save('applied.json',result);console.log(JSON.stringify(result));return;
 }
 if(phase==='privacy'){
  const result=await db.begin(async tx=>{
   const policy=(await tx`SELECT active_policy_version FROM public.account_deletion_contract_gate WHERE singleton`)[0].active_policy_version;
   const reference='Owner instruction: MOVRR — Final Community Safety Production Rollout & Closure (2026-10-23); finalized internal governance; no independent legal opinion';
   const definitions=[['community_reports','12 months','report_resolution',['case_id','category','timestamps','outcome','reporter_reference','subject_reference','evidence.cover_image_path','evidence.moderation_version']],['community_moderation','24 months','case_closure',['case_id','decision','reviewer','timestamps','evidence.cover_image_path','evidence.moderation_version','disposal.operation_id','disposal.case_digest','disposal.counts','disposal.timestamps']]];
   for(const [category,period,event,fields] of definitions){
    await tx`INSERT INTO public.account_deletion_retention_rule(policy_version,category,purpose,owner,minimum_fields,lawful_basis,period,start_event,access_capability,expiry_mechanism,hold_review_policy,approval_status,approval_reference)
     VALUES(${policy},${category},'Community Safety ordinary-data reporting, moderation accountability and minimized disposal','Authorized internal MOVRR administrators / Privacy compliance',${fields},'GDPR Article 6(1)(f); internal documented necessity and balancing; Article 9/10-dependent material withheld',${period}::interval,${event},'privacy.deletion.compliance.review','Canonical dispose/claim/Storage-remove/confirm controls; original case deadline for minimal receipts','Explicit authorized scoped hold, documented review and controlled audited release','approved',${reference}) ON CONFLICT DO NOTHING`;
    await tx`SELECT public.community_safety_policy(${policy},${category},${period}::interval,${fields})`;
   }
   return {policy,ordinaryDataRulesRegistered:2,additionalSensitiveDataAuthorityEstablished:false,irreversibleDeletionEnabled:false,scheduledJobsActivated:false,approvalReference:reference};
  });save('privacy.json',result);console.log(JSON.stringify(result));return;
 }
 if(phase==='relocate'){
  assert.equal(load('applied.json').applied,true);for(const m of backup.mappings){const bytes=fs.readFileSync(path.join(out,m.file));assert.equal(hash(bytes),m.sha256);
   const exists=await sdk.storage.from('community-rides').download(m.newPath);if(exists.data)assert.equal(hash(Buffer.from(await exists.data.arrayBuffer())),m.sha256);else{const uploaded=await sdk.storage.from('community-rides').upload(m.newPath,bytes,{contentType:m.mime,cacheControl:'0',upsert:false});if(uploaded.error)throw uploaded.error;}
   const verified=await sdk.storage.from('community-rides').download(m.newPath);if(verified.error)throw verified.error;assert.equal(hash(Buffer.from(await verified.data.arrayBuffer())),m.sha256);
  }
  const result=await db.begin('isolation level repeatable read',async tx=>{await tx`SELECT set_config('request.jwt.claim.role','service_role',true),set_config('movrr.migration_actor',${backup.actor},true)`;
   for(const m of backup.mappings){const c=(await tx`SELECT * FROM public.community_ride WHERE id=${m.rideId} FOR UPDATE`)[0];assert(c.is_public&&c.moderation_state==='approved');if(c.cover_image_path===m.newPath){assert.equal((await tx`SELECT count(*)::int n FROM public.community_moderation_audit WHERE operation_id=${m.operation}`)[0].n,1);continue;}assert.equal(c.cover_image_path,m.oldPath);
    assert.equal((await tx`SELECT count(*)::int n FROM public.community_report WHERE evidence->>'cover_image_path'=${m.oldPath}`)[0].n,0,'Concurrent evidence reference; do not erase');
    await tx`UPDATE public.community_ride SET cover_image_path=${m.newPath} WHERE id=${m.rideId}`;
    const v=(await tx`SELECT moderation_version FROM public.community_ride WHERE id=${m.rideId}`)[0].moderation_version;
    await tx`SELECT public.moderate_community_content(${m.operation},${backup.actor},${m.rideId},${v},'approve',${'Owner-authorized private cover relocation; original SHA-256 '+m.sha256+' verified unchanged'},NULL,NULL)`;
    const sc=(await tx`SELECT version FROM public.community_safety_case WHERE id=${m.operation}`)[0];
    await tx`SELECT public.command_community_safety_case(${crypto.createHash('md5').update('close:'+m.operation).digest('hex')},${backup.actor},${m.operation},${sc.version},'close','Verified unchanged cover relocation complete; no content evidence archive necessary',NULL,NULL,NULL,NULL,false)`;
   }preserved(backup.baseline,await snapshot(tx));return {referencesRelocated:backup.mappings.length,canonicalPublicationAudit:true,publicationAndParticipationPreserved:true};});save('relocated.json',result);
  for(const m of backup.mappings){const removed=await sdk.storage.from('community-rides').remove([m.oldPath]);if(removed.error)throw removed.error;}
  save('origins-retired.json',{count:backup.mappings.length,recordedAt:new Date().toISOString(),privateRecoveryBytesRetained:true});console.log(JSON.stringify(result));return;
 }
 if(phase==='verify'){
  const result=await db.begin('read only',async tx=>{const j=await journal(tx);assert.equal(j.length,1);assert.equal(j[0].checksum,expected);const after=await snapshot(tx);preserved(backup.baseline,after);
   return {journal:j,publicationAndParticipationPreserved:true,financialAndOperatingGatesUnchanged:true,rides:after.data.community_ride.length,participants:after.data.community_ride_participant.length,bucket:(await tx`SELECT public FROM storage.buckets WHERE id='community-rides'`)[0],safetyCounts:(await tx`SELECT (SELECT count(*) FROM community_report)::int reports,(SELECT count(*) FROM community_block)::int blocks,(SELECT count(*) FROM community_moderation_audit)::int decisions`)[0]};});save('verified.json',result);console.log(JSON.stringify(result));return;
 }
 throw Error('Unknown phase');
})().catch(e=>{console.error(JSON.stringify({phase,error:e.code||e.name,message:e.message,containment:'Stop. Inspect journal and receipts before retry; preserve private copies, never restore public access.'}));process.exitCode=1}).finally(()=>db.end());
