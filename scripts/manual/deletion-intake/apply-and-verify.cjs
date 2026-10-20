// Controlled two-migration rollout. Default is READ ONLY. --apply requires the
// owner's explicit approval of the manifest before invoking this script.
// This never calls the MFA operating command or creates deletion requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/intake-execution-separation');fs.mkdirSync(out,{recursive:true});
const hash=value=>crypto.createHash('sha256').update(value.replace(/\r/g,'')).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
assert.equal(manifest.migrations.length,2);
const migrations=manifest.migrations.map(m=>{
 const source=fs.readFileSync(path.join(repo,'scripts',m.file),'utf8').replace(/\r/g,'');
 const committed=execFileSync('git',['show',revision+':scripts/'+m.file],{cwd:repo,encoding:'utf8'}).replace(/\r/g,'');
 assert.equal(source,committed,'Source not committed');assert.equal(hash(source),m.sha256,'Source checksum mismatch');return{...m,source};
});
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const applying=process.argv.includes('--apply'),verifying=process.argv.includes('--verify');assert(!(applying&&verifying));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,connection:{application_name:'movrr-intake-boundary-controlled',default_transaction_read_only:applying?'off':'on',statement_timeout:'30000'}});
const protectedTables=['reward_transactions','rider_reward_balance','reward_redemptions','fulfilment','ride_session','account_deletion_jobs','account_deletion_review','account_deletion_audit','account_deletion_receipt_access'];
async function fingerprints(tx){const result={};for(const table of protectedTables){
 const row=(await tx.unsafe(`SELECT count(*)::text count,md5(coalesce(string_agg(digest,'' ORDER BY digest),'')) digest FROM (SELECT md5(to_jsonb(t)::text) digest FROM public."${table}" t) x`))[0];result[table]=row;
 }return result;}
async function snapshot(tx){return{
 gate:(await tx`SELECT operating_state,operating_version,active_policy_version,managed_resources_execution_enabled FROM public.account_deletion_contract_gate WHERE singleton`)[0],
 contract:(await tx`SELECT public.account_deletion_contract_status() status`)[0].status,
 functions:await tx`SELECT p.oid::regprocedure::text signature,p.proname,encode(sha256(convert_to(replace(pg_get_functiondef(p.oid),E'\r',''),'UTF8')),'hex') digest,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('ops_assert_capability','ops_audit','account_deletion_activation_authorized','request_verified_account_deletion','request_verified_account_deletion_core','read_account_deletion_lifecycle','read_account_deletion_delivered_receipt','claim_account_deletions','account_deletion_monitor','set_account_deletion_intake','account_deletion_contract_status','establish_account_deletion_barrier') ORDER BY 1`,
 policyV1:(await tx`SELECT md5(jsonb_build_object('policy',(SELECT to_jsonb(p) FROM public.account_deletion_policy_version p WHERE version=1),'retention',(SELECT jsonb_agg(to_jsonb(r) ORDER BY category) FROM public.account_deletion_retention_rule r WHERE policy_version=1),'actions',(SELECT jsonb_agg(to_jsonb(a) ORDER BY scope) FROM public.account_deletion_action_rule a WHERE policy_version=1))::text) digest`)[0].digest,
 data:await fingerprints(tx),shop:await tx`SELECT redemption_enabled FROM public.shop_release_control`
};}
async function verifyInstalled(tx){
 const functions=await tx`SELECT proname,prosrc,prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN ('account_deletion_intake_ready','account_deletion_contract_status','set_account_deletion_intake','establish_account_deletion_barrier')`;
 assert.equal(functions.length,4);
 for(const fn of functions){
  const source=migrations[0].source.slice(migrations[0].source.indexOf('FUNCTION public.'+fn.proname+'('));
  const body=source.match(/AS \$\$([\s\S]*?)\$\$;/)[1];
  assert.equal(fn.prosrc.replace(/\r/g,'').trim(),body.trim(),'Installed function differs from reviewed source: '+fn.proname);assert.equal(fn.prosecdef,true);
 }
 assert.equal((await tx`SELECT public.account_deletion_intake_ready(2) ready`)[0].ready,true);
 const rule=(await tx`SELECT period::text period,start_event,minimum_fields,approval_reference FROM public.account_deletion_retention_rule WHERE policy_version=2 AND category='receipt_access'`)[0];
 assert.equal(rule.period,'30 days');assert.equal(rule.start_event,'barrier_established');assert.deepEqual(rule.minimum_fields,['token_digest','expires_at']);
 assert.equal(rule.approval_reference,manifest.receiptApprovalReference);
 const permissions=await tx`SELECT has_function_privilege('authenticated','public.set_account_deletion_intake(text,bigint,text,uuid)','EXECUTE') admin_command,has_function_privilege('service_role','public.set_account_deletion_intake(text,bigint,text,uuid)','EXECUTE') service_command,has_function_privilege('authenticated','public.request_verified_account_deletion(uuid,integer,boolean)','EXECUTE') direct_rider_request,has_function_privilege('anon','public.account_deletion_intake_ready(integer)','EXECUTE') anon_helper`;
 assert.deepEqual(permissions[0],{admin_command:true,service_command:false,direct_rider_request:false,anon_helper:false});
 const allowed=await tx`SELECT scope FROM public.account_deletion_action_rule WHERE policy_version=2 AND public.account_deletion_rule_allowed(policy_version,scope) ORDER BY scope`;
 assert.deepEqual(allowed.map(r=>r.scope),['receipt.delivery']);
 return{receiptPolicy:rule,permissions:permissions[0],onlyAllowedAction:'receipt.delivery',functionBodiesMatchReviewedSource:true};
}
(async()=>{try{
 const result=await db.begin(applying?'isolation level repeatable read':'read only',async tx=>{
  await tx.unsafe("SET LOCAL lock_timeout='5s'");
  if(applying)await tx.unsafe('LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE');
  const journal=await tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') digest FROM supabase_migrations.schema_migrations WHERE version IN ${tx(migrations.map(m=>m.version))} OR name IN ${tx(migrations.map(m=>m.file.replace('.sql','')))}`;
  if(verifying){
   assert.equal(journal.length,2);for(const m of migrations){const row=journal.find(j=>j.version===m.version);assert(row);assert.equal(row.name,m.file.replace('.sql',''));assert.equal(row.digest,m.sha256);}
   const state=await snapshot(tx);assert.equal(state.gate.managed_resources_execution_enabled,false);assert(state.shop.every(s=>s.redemption_enabled===false));
   return{verified:true,installed:await verifyInstalled(tx),operatingState:state.gate,contract:state.contract,journal};
  }
  assert.equal(journal.length,0,'Migration journal already contains a release entry; inspect before proceeding');
  const before=await snapshot(tx);assert.equal(before.gate.operating_state,'disabled');assert.equal(before.gate.operating_version,'0');assert.equal(before.gate.active_policy_version,1);assert.equal(before.gate.managed_resources_execution_enabled,false);
  if(!applying)return{preflightOnly:true,sourceRevision:revision,manifest,baseline:before};
  for(const m of migrations){await tx.unsafe(m.source.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
   await tx`INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback) VALUES(${m.version},${m.file.replace('.sql','')},${[m.source]},${'codex-authorized:'+revision},${'intake-boundary:'+m.sha256},${['-- Pause new intake through the existing MFA Admin command. Preserve accepted requests and immutable policy history; see docs/operations/deletion-intake-separation.md.']})`;
  }
  const installed=await verifyInstalled(tx),after=await snapshot(tx);
  assert.deepEqual(after.data,before.data,'Protected business/request/receipt data changed');assert.equal(after.policyV1,before.policyV1,'Immutable v1 changed');assert.deepEqual(after.shop,before.shop);
  assert.deepEqual(after.gate,{...before.gate,active_policy_version:2});assert.equal(after.contract.requestsEnabled,false);
  for(const old of before.functions){const current=after.functions.find(f=>f.signature===old.signature);assert(current);assert.equal(current.acl,old.acl);
   if(!['set_account_deletion_intake','account_deletion_contract_status','establish_account_deletion_barrier'].includes(old.proname))assert.equal(current.digest,old.digest,'Unrelated guard changed: '+old.signature);
  }
  fs.writeFileSync(path.join(out,'preservation.json'),JSON.stringify({before,after},null,2)+'\n');
  return{applied:true,sourceRevision:revision,migrations:manifest.migrations,installed,operatingState:after.gate,contract:after.contract,protectedDataPreserved:true,v1Preserved:true,executionAndReceiptFunctionsPreserved:true};
 });
 const report={...result,recordedAt:new Date().toISOString(),project:'kzdvunpuxaxlphqvmzxw'};
 fs.writeFileSync(path.join(out,applying?'applied.json':verifying?'post-deployment.json':'preflight.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message,commitStatus:'Inspect the production migration journal after any client interruption; never infer rollback or replay blindly.'}));process.exitCode=1;});
