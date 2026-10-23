const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
// Representative pre-082 schema rehearsal, not a live production clone.
// Uses captured foundation + canonical lifecycle migrations + current Community
// contracts. No .env, remote host, production data or external notifications.
const postgres=require('postgres');
const mobile=path.resolve(__dirname,'../../movrr-mobile'),admin=path.resolve(__dirname,'..');
const port=Number(process.env.MOVRR_COMMUNITY_TEST_PORT||55439);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid isolated test port');
const opts={host:'127.0.0.1',port,username:'postgres',password:'isolated-local-test-only',max:1,connection:{'request.headers':'{"x-movrr-community-contract":"private-media-v1"}'},onnotice(){}};
const name='movrr_safety_full_'+process.pid,root=postgres({...opts,database:'postgres'}),db=postgres({...opts,database:name});
const read=file=>fs.readFileSync(file,'utf8');
let assertions=0;
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++;};
const migration=read(path.join(admin,'scripts/082_community_safety.sql'));
// Execute the exact statements inside a managed transaction/savepoint for failure
// injection. The successful path below also executes the original BEGIN/COMMIT.
const statements=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const rollback=Symbol('synthetic fixture rollback');
async function reverted(fn){try{await db.begin(async tx=>{await fn(tx);throw rollback;});}catch(e){if(e!==rollback)throw e;}}
const as=(user,fn)=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claim.role','authenticated',true)`;return fn(tx);});
async function main(){
 await root.unsafe('CREATE DATABASE '+name);
 const coverage=await require(path.join(mobile,'scripts/account-deletion-production-fixture.cjs')).install(db);console.log({coverage});
 const files=fs.readdirSync(path.join(mobile,'scripts')).filter(f=>f==='033_auth_provider_lifecycle.sql'||f==='040_community_deletion_notification_compatibility.sql'||f==='048_ride_time_settlement_executor.sql'||(/^\d+_account_deletion_.*\.sql$/.test(f)&&Number(f.slice(0,3))>=34&&Number(f.slice(0,3))<=88)).sort();
 for(const file of files){try{await db.unsafe(read(path.join(mobile,'scripts',file)));}catch(e){console.error('PREREQUISITE',file,e.code,e.message);throw e;}}
 console.log({lifecycleMigrations:files.length});
 const operations=read(path.join(admin,'scripts/057_alignment_operations.sql'));
 await db.unsafe(operations.split('\n').find(line=>line.startsWith('CREATE TABLE public.ops_command_receipt')));
 const capture=JSON.parse(read(path.join(admin,'scripts/fixtures/community/production-contracts.json'))),deployed=JSON.parse(read(path.join(admin,'scripts/fixtures/community/safety-deployed-contracts.json')));
 for(const fn of capture.functions)await db.unsafe(fn.definition);
 const rbac=read(path.join(admin,'scripts/070_employee_rbac_authority.sql'));
 await db.unsafe(rbac.slice(rbac.indexOf('CREATE OR REPLACE FUNCTION public.ops_employee_capabilities'),rbac.indexOf('-- END GENERATED EMPLOYEE CAPABILITIES')));
 const roles=['PUBLIC','postgres','anon','authenticated','service_role','supabase_storage_admin'];
 for(const helper of deployed.helpers){await db.unsafe(helper.definition);await db.unsafe(`ALTER FUNCTION ${helper.signature} OWNER TO ${helper.owner};REVOKE ALL ON FUNCTION ${helper.signature} FROM ${roles.join(',')};GRANT EXECUTE ON FUNCTION ${helper.signature} TO ${helper.execute_roles.join(',')}`);}
 for(const table of ['community_ride','community_ride_participant','community_ride_creator_grant']){const policies=await db`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=${table}`;for(const p of policies)await db.unsafe(`DROP POLICY "${p.policyname}" ON public.${table}`);}
 for(const policy of deployed.policies){await db.unsafe(`DROP POLICY IF EXISTS "${policy.policyname}" ON ${policy.schemaname}.${policy.tablename}`);await db.unsafe(`CREATE POLICY "${policy.policyname}" ON ${policy.schemaname}.${policy.tablename} AS ${policy.permissive} FOR ${policy.cmd} TO ${policy.roles.join(',')} ${policy.qual?'USING ('+policy.qual+')':''} ${policy.with_check?'WITH CHECK ('+policy.with_check+')':''}`);}
 await db.unsafe(read(path.join(admin,'scripts/065_community_approved_rider_authorization.sql')));
 await db`INSERT INTO storage.buckets(id,name,public) VALUES('community-rides','community-rides',true)`;
 const user=crypto.randomUUID(),viewer=crypto.randomUUID();
 for(const [uid,email] of [[user,'safety-full@example.invalid'],[viewer,'safety-viewer@example.invalid']])await db`INSERT INTO auth.users(id,email) VALUES(${uid},${email})`;
 const rider=(await db`SELECT id FROM rider WHERE user_id=${user}`)[0].id;
 await db`INSERT INTO community_ride_creator_grant(user_id) VALUES(${user})`;
 const ride=crypto.randomUUID();await db.begin(async tx=>{await tx`SELECT set_config('request.jwt.claim.role','service_role',true)`;await tx`INSERT INTO community_ride(id,title,organizer_type,organizer_user_id,organizer_rider_id,created_by_user_id,organizer_name,scheduled_at,is_public,status,cover_image_url) VALUES(${ride},'Existing public full rehearsal','rider',${user},${rider},${user},'Synthetic',now()+interval '1 day',true,'upcoming','https://isolated.invalid/existing.png')`;});
 const viewerRider=(await db`SELECT id FROM rider WHERE user_id=${viewer}`)[0].id;
 await as(viewer,tx=>tx`SELECT join_community_ride(${ride},${viewerRider})`);
 const before=JSON.parse(JSON.stringify(await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${ride} ORDER BY rider_id`));
 equal((await as(viewer,tx=>tx`SELECT id FROM community_ride WHERE id=${ride}`)).length,1);
 // An active account-deletion barrier must stop the bulk URL transition, even
 // with 082's service claim. It must leave no partial DDL or private bucket.
 await reverted(async tx=>{
   await tx`INSERT INTO account_deletion_jobs(id,user_id,policy_version) VALUES(${crypto.randomUUID()},${user},1)`;
   equal((await tx`SELECT restricted FROM account_deletion_write_guard WHERE user_id=${user}`)[0].restricted,true);
   await assert.rejects(()=>tx.savepoint(s=>s.unsafe(statements)),e=>e.code==='42501');assertions++;
   equal((await tx`SELECT to_regclass('public.community_report') object`)[0].object,null);
   equal((await tx`SELECT public FROM storage.buckets WHERE id='community-rides'`)[0].public,true);
   equal((await tx`SELECT cover_image_url FROM community_ride WHERE id=${ride}`)[0].cover_image_url,'https://isolated.invalid/existing.png');
 });
 // The canonical migration checks prerequisite function bodies. Drift must roll
 // back the earlier URL update, table creation and all other preceding changes.
 await reverted(async tx=>{
   const fn=(await tx`SELECT pg_get_functiondef('public.join_community_ride(uuid,uuid)'::regprocedure) body`)[0].body;
   await tx.unsafe(fn.replace('PERFORM public.assert_active_account();','NULL;'));
   await assert.rejects(()=>tx.savepoint(s=>s.unsafe(statements)),e=>e.message==='Join contract drift');assertions++;
   equal((await tx`SELECT to_regclass('public.community_report') object`)[0].object,null);
   equal((await tx`SELECT cover_image_url FROM community_ride WHERE id=${ride}`)[0].cover_image_url,'https://isolated.invalid/existing.png');
 });
 await db.unsafe(read(path.join(admin,'scripts/082_community_safety.sql')));
 const retained=(await db`SELECT status,is_public,moderation_state,cover_image_url FROM community_ride WHERE id=${ride}`)[0];
 equal(retained,{status:'upcoming',is_public:true,moderation_state:'approved',cover_image_url:null});
 equal(JSON.parse(JSON.stringify(await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${ride} ORDER BY rider_id`)),before);
 equal((await as(viewer,tx=>tx`SELECT id FROM community_ride WHERE id=${ride}`)).length,1);
 equal((await db`SELECT public FROM storage.buckets WHERE id='community-rides'`)[0].public,false);
 equal((await as(viewer,tx=>tx`SELECT * FROM my_community_blocks()`)).length,0);
 const report=(await as(viewer,tx=>tx`SELECT report_community_content(${ride},'ride','other','') id`))[0].id;
 equal((await as(user,tx=>tx`SELECT * FROM community_report WHERE id=${report}`).catch(e=>[{code:e.code}]))[0].code,'42501');
 // 082 explicitly registers its later-created tables with the canonical fence.
 const bindings=await db`SELECT table_name,column_name FROM account_deletion_barrier_binding WHERE table_name IN ('community_block','community_report','community_moderation_audit')`;
 equal(bindings.length,5);
 const restrictedAccountWrites={};
 for(const held of [false,true])await reverted(async tx=>{
  assertions+=await require('./test-community-safety-deletion.cjs')({tx,user,viewer,ride,report,held});
 });
 await reverted(async tx=>{
   await tx`INSERT INTO account_deletion_jobs(id,user_id,policy_version) VALUES(${crypto.randomUUID()},${viewer},1)`;
   const token=crypto.randomUUID();
   await tx`UPDATE account_deletion_jobs SET status='processing',lease_token=${token},lease_until=clock_timestamp()+interval '5 minutes' WHERE user_id=${viewer}`;
   await tx`SELECT set_config('request.jwt.claim.role','service_role',true)`;
   const gate=(await tx`SELECT prepare_account_deletion_community_safety(id,${token}) result FROM account_deletion_jobs WHERE user_id=${viewer}`)[0].result;
   equal(gate.state,'review');equal(gate.completionAuthorized,false);
   equal((await tx`SELECT count(*)::int n FROM account_deletion_review WHERE category='community_safety'`)[0].n,1);
   // Execute the actual Edge orchestration against the real Safety SQL gate.
   // Earlier independently approved steps are inert here; no external effects.
   const ts=require('typescript'),vm=require('node:vm'),exports={};
   vm.runInNewContext(ts.transpileModule(read(path.join(mobile,'supabase/functions/_shared/deletionExecution.ts')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({}),Date,JSON});
   const calls=[];
   const job=(await tx`SELECT id,user_id,lease_token FROM account_deletion_jobs WHERE user_id=${viewer}`)[0];
   const api={rpc:async(name,args)=>{
    calls.push(name);
    if(name==='renew_account_deletion') return {data:true,error:null};
    if(['apply_account_deletion_privacy_manifest','detach_account_deletion_reviewed_authorship'].includes(name))return {data:{state:'confirmed'},error:null};
    assert.equal(name,'prepare_account_deletion_community_safety');
    return {data:(await tx`SELECT prepare_account_deletion_community_safety(${args.p_job},${args.p_token}) r`)[0].r,error:null};
   }};
   equal(await exports.executeDeletionClosure(api,job),false);
   equal(calls.at(-1),'prepare_account_deletion_community_safety');
   await tx.unsafe('SET LOCAL ROLE authenticated');
   await tx`SELECT set_config('request.jwt.claim.sub',${viewer},true),set_config('request.jwt.claim.role','authenticated',true)`;
   await assert.rejects(()=>tx.savepoint(s=>s`UPDATE community_ride_participant SET status='joined' WHERE community_ride_id=${ride} AND rider_id=${viewerRider}`),e=>e.code==='42501');assertions++;
   for(const [key,operation] of [
     ['report',s=>s`SELECT report_community_content(${ride},'organiser','other','')`],
     ['block',s=>s`SELECT set_community_block(${rider},true)`]
   ]){try{await tx.savepoint(operation);restrictedAccountWrites[key]='succeeded';}catch(e){restrictedAccountWrites[key]=e.code;}}
 });
 equal(restrictedAccountWrites,{report:'42501',block:'42501'});
 console.log(JSON.stringify({assertions,migrationSha256:crypto.createHash('sha256').update(migration).digest('hex'),existingPublicRidePreserved:true,participantsPreserved:true,deletionBarrierRollback:true,prerequisiteDriftRollback:true,safetyDeletionBindings:bindings,restrictedAccountWrites,governanceGate:'Review ownership bindings and approved retention/disposition before release; migration success alone is not readiness',productionMutations:false}));
}
main().catch(e=>{console.error(e.stack,e.where??'');process.exitCode=1}).finally(async()=>{await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH(FORCE)');await root.end()});
