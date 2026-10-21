// Explicit production execution entry point. Both operations require separate
// owner approval of the printed SHA-256 and scope in README.md.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),mode=process.argv[2];
assert(['--activity','--correction'].includes(mode),'Choose --activity or --correction');
const file=mode==='--activity'?'scripts/080_authenticated_account_activity.sql':'scripts/manual/rider-identity/correct-powerdon.sql';
const sql=fs.readFileSync(path.join(repo,file),'utf8').replace(/\r\n/g,'\n');
const sha256=crypto.createHash('sha256').update(sql).digest('hex');
assert.equal(process.env.MOVRR_OWNER_APPROVED_SQL_SHA256,sha256,`Owner approval required for ${file}, SHA-256 ${sha256}`);
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'),'Unexpected production project');
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connection:{application_name:'movrr-owner-approved-rider-activity',statement_timeout:'30000'}});
const q=s=>'"'+s.replaceAll('"','""')+'"';
const fingerprint=async tx=>{
 const result={};for(const t of await tx`select schemaname,tablename from pg_tables where schemaname in ('auth','public') order by 1,2`){
  const key=t.schemaname+'.'+t.tablename;
  result[key]=(await tx.unsafe(`select count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from ${q(t.schemaname)}.${q(t.tablename)} t`))[0];
 }return result;
};
const gates=async tx=>({deletion:(await tx`select requests_enabled,managed_resources_execution_enabled from public.account_deletion_contract_gate where singleton`)[0],shop:(await tx`select redemption_enabled from public.shop_release_control where singleton`)[0]});
const protectedAccounts=async tx=>{
 const rows={};for(const [schema,table,column,id] of [
  ['auth','users','id','007b5ab8-fea0-41f2-9068-055f154d7db0'],
  ['public','user','id','007b5ab8-fea0-41f2-9068-055f154d7db0'],
  ['public','rider','id','183c4512-228b-441a-9b4f-e1d97359773a'],
  ['public','rider_reward_balance','rider_id','183c4512-228b-441a-9b4f-e1d97359773a'],
 ])rows[schema+'.'+table]=(await tx.unsafe(`select count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from ${q(schema)}.${q(table)} t where ${q(column)} is distinct from $1::uuid`,[id]))[0];
 return rows;
};
(async()=>{try{const result=await db.begin('isolation level repeatable read',async tx=>{
 const before=await fingerprint(tx),protectedGates=await gates(tx),otherAccounts=await protectedAccounts(tx);
 assert.equal(protectedGates.deletion.requests_enabled,true);assert.equal(protectedGates.deletion.managed_resources_execution_enabled,false);assert.equal(protectedGates.shop.redemption_enabled,false);
 await tx.unsafe(sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
 const after=await fingerprint(tx);assert.deepEqual(await gates(tx),protectedGates);
 assert.deepEqual(await protectedAccounts(tx),otherAccounts,'Unrelated account changed; operation rolled back');
 const changed=Object.keys(before).filter(t=>JSON.stringify(before[t])!==JSON.stringify(after[t]));
 assert.deepEqual(changed.sort(),mode==='--correction'?['auth.users','public.rider','public.rider_reward_balance','public.user'].sort():[],'Unexpected changed records; entire operation rolled back');
 if(mode==='--correction'){
  assert.equal(after['public.rider'].records,before['public.rider'].records-1);
  assert.equal(after['public.rider_reward_balance'].records,before['public.rider_reward_balance'].records-1);
  for(const table of ['auth.users','public.user'])assert.equal(after[table].records,before[table].records);
  assert.equal((await tx`select tgenabled from pg_trigger where tgrelid='public.user'::regclass and tgname='enforce_user_role_immutable_for_clients'`)[0].tgenabled,'O');
 }else{
  // Keep the installed SQL and its exact source in the standard migration journal.
  await tx`insert into supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback)
   values('20261021160000','080_authenticated_account_activity',${[sql]},'owner-approved',${'account-activity:'+sha256},${['DROP TRIGGER retain_auth_session_activity ON auth.sessions; DROP TRIGGER retain_admin_session_activity ON public.admin_dashboard_sessions; DROP FUNCTION public.retain_deleted_session_activity(); DROP FUNCTION public.read_account_activity(uuid,uuid[]);']})`;
 }
 return{mode,file,sha256,recordedAt:new Date().toISOString(),before,after,changed,gates:protectedGates};
 });const out=path.join(repo,'docs/verification/rider-identity-activity');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,mode==='--activity'?'activity-applied.json':'correction-applied.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mode,sha256,changed:result.changed,gates:result.gates}));
}finally{await db.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
