// Non-destructive production acceptance. No account/session impersonation, login,
// synthetic records or financial operations. Transaction-local JWT claims are
// used only to test SQL/RPC authorization in a READ ONLY transaction.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),phase=process.argv[2];
assert(['before','migration','corrected'].includes(phase));
const uid='007b5ab8-fea0-41f2-9068-055f154d7db0',rid='183c4512-228b-441a-9b4f-e1d97359773a';
const read=f=>fs.readFileSync(path.join(repo,f),'utf8'),lf=s=>s.replace(/\r\n/g,'\n');
const receipt=JSON.parse(read('docs/verification/rider-identity-activity/verification.json'));
const hash=s=>crypto.createHash('sha256').update(lf(s)).digest('hex');
for(const f of Object.values(receipt.approval)){
 assert.equal(hash(read(f.file)),f.sha256Utf8Lf);
 assert.equal(lf(read(f.file)),lf(cp.execFileSync('git',['show','eb32272:'+f.file],{cwd:repo,encoding:'utf8'})));
}
const env=Object.fromEntries(read('.env').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connection:{default_transaction_read_only:'on',statement_timeout:'30000'}});
const body=(sql,name)=>lf(sql).match(new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\([\\s\\S]*?AS (\\$\\w*\\$)([\\s\\S]*?)\\1;'))[2].trim();
(async()=>{try{const result=await db.begin('isolation level repeatable read read only',async tx=>{
 const journal=await tx`select version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum from supabase_migrations.schema_migrations where version='20261021160000' or name='080_authenticated_account_activity' or name='079_users_dashboard_sync_read' order by version`;
 const own=journal.filter(j=>j.version==='20261021160000'||j.name==='080_authenticated_account_activity');
 assert.equal(own.length,phase==='before'?0:1,'Unexpected migration baseline');
 if(phase!=='before')assert.equal(own[0].checksum,receipt.approval.activity.sha256Utf8Lf);
 assert.equal(journal.find(j=>j.name==='079_users_dashboard_sync_read')?.checksum,'6d29a01faa98716c0b6d073f8863bdd5154cfe6e89d65a24d47cfe09e9e1ee4b');
 const functions=await tx`select p.proname,p.oid::regprocedure::text signature,p.prosrc,p.prosecdef,p.provolatile,p.proconfig,pg_get_userbyid(p.proowner) owner,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') checksum from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('read_account_activity','retain_deleted_session_activity','account_identity_active','ops_employee_capabilities','handle_new_user')`;
 for(const [name,file] of [['account_identity_active','scripts/071_external_account_domains.sql'],['ops_employee_capabilities','scripts/070_employee_rbac_authority.sql']]){
  assert.equal(lf(functions.find(f=>f.proname===name).prosrc).trim(),body(read(file),name),'Dependency definition drift: '+name);
 }
 assert.equal(functions.find(f=>f.proname==='handle_new_user').checksum,receipt.cause.liveTriggerSha256,'Signup trigger drift');
 const triggers=await tx`select t.tgrelid::regclass::text relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition from pg_trigger t where not t.tgisinternal and (t.tgname in ('retain_auth_session_activity','retain_admin_session_activity','enforce_user_role_immutable_for_clients') or t.tgname like '%account_deletion%') order by 1,2`;
 if(phase!=='before'){
  for(const name of ['read_account_activity','retain_deleted_session_activity']){
   const fn=functions.find(f=>f.proname===name);assert(fn);assert.equal(lf(fn.prosrc).trim(),body(read(receipt.approval.activity.file),name));assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=""']);
  }
  for(const name of ['retain_auth_session_activity','retain_admin_session_activity'])assert.equal(triggers.filter(t=>t.tgname===name&&t.tgenabled==='O').length,1);
 }
 const account=(await tx`select a.id,a.email,a.last_sign_in_at,a.deleted_at,a.banned_until,u.role,u.status,(select count(*)::int from public.rider where user_id=a.id) riders,(select count(*)::int from public.rider_reward_balance where rider_id=${rid}) balances,a.raw_user_meta_data->>'server_assigned_role' metadata_role,md5((to_jsonb(a)-'raw_user_meta_data')::text) auth_other_fields,md5((a.raw_user_meta_data-'server_assigned_role')::text) other_metadata,md5((to_jsonb(u)-'role')::text) user_other_fields from auth.users a join public."user" u on u.id=a.id where a.id=${uid}`)[0];
 assert.equal(account.email,'powerdonnl@gmail.com');assert.equal(account.status,'active');assert.equal(account.deleted_at,null);assert.equal(account.last_sign_in_at,null);assert(!account.banned_until||account.banned_until<=new Date());
 const memberships=await tx`select m.*,o.name,o.type from public.organisation_membership m join public.organisation o on o.id=m.organisation_id where m.user_id=${uid}`;
 assert.deepEqual(JSON.parse(JSON.stringify(memberships)),receipt.productionInspection.memberships);
 const staff=await tx`select user_id,role from public.admin_users where user_id=${uid}`;assert.deepEqual(JSON.parse(JSON.stringify(staff)),receipt.productionInspection.staff);
 const gates={deletion:(await tx`select requests_enabled,managed_resources_execution_enabled from public.account_deletion_contract_gate where singleton`)[0],shop:(await tx`select redemption_enabled from public.shop_release_control where singleton`)[0]};
 assert.deepEqual(gates,receipt.productionInspection.gates);
 const identity=(await tx`select public.account_identity_active(${uid}) active,public.ops_organisation_capabilities('reward_partner','owner') permissions,(select md5(coalesce(string_agg(md5(to_jsonb(i)::text),'' order by i.id),'')) from auth.identities i where user_id=${uid}) auth_provider_identity_digest`)[0];
 assert(identity.active);assert(identity.permissions.includes('staff.manage'));assert(identity.permissions.includes('fulfilment.read'));
 const counts=(await tx`select (select count(*)::int from public."user") users,(select count(*)::int from public.rider) rider_profiles,(select count(distinct user_id)::int from public.rider where user_id is not null) rider_users,(select count(*)::int from public.organisation_membership) memberships`)[0];
 const authorization=[];let activity=null,activityAcl=null;
 if(phase==='corrected'){
  const baselineTriggers=JSON.parse(read('docs/verification/rider-identity-activity/before-production.json')).triggers;
  assert.deepEqual(JSON.parse(JSON.stringify(triggers.filter(t=>!['retain_auth_session_activity','retain_admin_session_activity'].includes(t.tgname)))),baselineTriggers,'Existing security/deletion triggers changed');
  assert.equal(account.role,null);assert.equal(account.metadata_role,null);assert.equal(account.riders,0);assert.equal(account.balances,0);
  const before=JSON.parse(read('docs/verification/rider-identity-activity/before-production.json'));
  for(const key of ['auth_other_fields','other_metadata','user_other_fields'])assert.equal(account[key],before.account[key],key);
  assert.equal(identity.auth_provider_identity_digest,before.identity.auth_provider_identity_digest);
  await tx.unsafe('SET LOCAL ROLE authenticated');
  await tx`select set_config('request.jwt.claim.sub',${uid},true),set_config('request.jwt.claims',${JSON.stringify({sub:uid,role:'authenticated',aal:'aal1'})},true)`;
  const partner=(await tx`select public.identity_organisation_capability('17be1d12-9e61-4654-afd0-fad0bf2d0278','staff.manage') owner_grant,public.identity_organisation_capability('00000000-0000-0000-0000-000000000001','staff.manage') other_tenant,(select count(*)::int from public.rider where user_id=${uid}) own_riders`)[0];
  assert.equal(partner.owner_grant,true);assert.equal(partner.other_tenant,false);assert.equal(partner.own_riders,0);authorization.push(partner);
  await tx.unsafe('RESET ROLE');
 }else{assert.equal(account.role,'rider');assert.equal(account.metadata_role,'partner_operations_manager');assert.equal(account.riders,1);assert.equal(account.balances,1);}
 if(phase!=='before'){
  const actor=(await tx`select a.user_id from public.admin_users a where a.role='super_admin' and public.account_identity_active(a.user_id) limit 1`)[0].user_id;
  await tx`select set_config('request.jwt.claim.role','service_role',true)`;
  const ids=(await tx`select id from public."user" order by id`).map(r=>r.id);
  activity=(await tx`select public.read_account_activity(${actor},${ids}::uuid[]) data`)[0].data;
  assert.equal(activity.length,ids.length);assert.equal(activity.find(r=>r.user_id===uid).last_active_at,null);
  const expected=await tx`with signals as(select id user_id,last_sign_in_at at from auth.users union all select user_id,refreshed_at at time zone 'UTC' from auth.sessions union all select auth_user_id,last_seen_at from public.admin_dashboard_sessions union all select actor_user_id,occurred_at from public.user_activity where source<>'system') select u.id user_id,max(s.at) last_active_at from public."user" u left join signals s on s.user_id=u.id and s.at<=statement_timestamp() group by u.id order by u.id`;
  assert.deepEqual(activity.map(r=>({...r,last_active_at:r.last_active_at?new Date(r.last_active_at).toISOString():null})),JSON.parse(JSON.stringify(expected.map(r=>({...r,last_active_at:r.last_active_at?r.last_active_at.toISOString():null})))));
  activityAcl=await tx`select r.role,has_function_privilege(r.role,'public.read_account_activity(uuid,uuid[])','EXECUTE') read,has_function_privilege(r.role,'public.retain_deleted_session_activity()','EXECUTE') retain from (values('anon'),('authenticated'),('service_role')) r(role)`;
  for(const r of activityAcl){assert.equal(r.read,r.role==='service_role');assert.equal(r.retain,false);}
 }
 let integrity=null;
 if(phase==='corrected'){
  const expected=JSON.parse(read('docs/verification/rider-identity-activity/correction-applied.json')).after;
  const fingerprints={};const q=s=>'"'+s.replaceAll('"','""')+'"';
  for(const table of await tx`select schemaname,tablename from pg_tables where schemaname in ('auth','public') order by 1,2`){
   fingerprints[table.schemaname+'.'+table.tablename]=(await tx.unsafe(`select count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from ${q(table.schemaname)}.${q(table.tablename)} t`))[0];
  }
  const changed=Object.keys(expected).filter(t=>JSON.stringify(expected[t])!==JSON.stringify(fingerprints[t]));
  const routine=new Set(['public.shop_scheduler_state','public.shop_worker_health']);
  assert.deepEqual(changed.filter(t=>!routine.has(t)),[],'Unexpected post-correction public/Auth record drift');
  integrity={fingerprints,changesSinceCorrection:changed,nonRoutineRowsUnchanged:true,explanation:'Only existing Shop scheduler/worker health may advance from unrelated routine workers. Identity, membership, activity, reward and financial records must remain identical to the committed correction snapshot.'};
 }
 return{recordedAt:new Date().toISOString(),phase,readOnly:true,journal,functions:functions.map(({prosrc,...f})=>f),triggers,account,memberships,staff,gates,identity,counts,activity,activityAcl,authorization,integrity,claimsAreOnlyReadOnlySqlContexts:true,authSessionAndBrowserLoginNotFabricated:true};
 });const out=path.join(repo,'docs/verification/rider-identity-activity');fs.writeFileSync(path.join(out,phase+'-production.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({phase,journal:result.journal,account:result.account,counts:result.counts,gates:result.gates,activity:result.activity,identity:result.identity},null,2));
}finally{await db.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
