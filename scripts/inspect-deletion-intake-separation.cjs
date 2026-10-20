// Read-only baseline for the intake/execution boundary migration. No rider records or secrets are exported.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres');
const root=path.resolve(__dirname,'..');
const env=Object.fromEntries(fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,connection:{default_transaction_read_only:'on',statement_timeout:'20000',application_name:'movrr-intake-separation-preflight'}});
(async()=>{try{
 const result=await db.begin('read only',async tx=>({
  inspectedAt:new Date().toISOString(),project:'kzdvunpuxaxlphqvmzxw',readOnly:(await tx`SHOW transaction_read_only`)[0].transaction_read_only,
  constraints:await tx`SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.account_deletion_contract_gate'::regclass ORDER BY conname`,
  functions:await tx`SELECT p.oid::regprocedure::text signature,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('establish_account_deletion_barrier','set_account_deletion_intake','account_deletion_contract_status','account_deletion_activation_authorized','request_verified_account_deletion','request_verified_account_deletion_core','read_account_deletion_lifecycle','read_account_deletion_delivered_receipt','claim_account_deletions','account_deletion_monitor') ORDER BY 1`,
  gate:await tx`SELECT operating_state,operating_version,active_policy_version,requests_enabled,managed_resources_execution_enabled FROM public.account_deletion_contract_gate WHERE singleton`,
  reviewColumns:await tx`SELECT table_name,column_name,udt_name,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('account_deletion_jobs','account_deletion_review') ORDER BY table_name,ordinal_position`,
  counts:(await tx`SELECT (SELECT count(*) FROM public.account_deletion_jobs) requests,(SELECT count(*) FROM public.account_deletion_receipt_access) receipts,(SELECT count(*) FROM public.account_deletion_audit) lifecycle_audit,(SELECT count(*) FROM public.ops_command_receipt WHERE kind='deletion.intake') intake_commands`)[0],
  shop:await tx`SELECT redemption_enabled FROM public.shop_release_control`
 }));
 assert.equal(result.readOnly,'on');
 const out=path.join(root,'.tmp/intake-execution-separation');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'functions.json'),JSON.stringify(result.functions,null,2)+'\n');
 result.functions=result.functions.map(({definition,...f})=>({...f,sha256:crypto.createHash('sha256').update(definition.replace(/\r/g,'')).digest('hex')}));
 fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({constraints:result.constraints,functions:result.functions,gate:result.gate,counts:result.counts,shop:result.shop}));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||'inspection_failed'}));process.exitCode=1;});
