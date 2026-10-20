// Read-only governance inventory for the existing deletion architecture. No rider data or approvals are written.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres');
const root=path.resolve(__dirname,'..');
const env=Object.fromEntries(fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,connection:{default_transaction_read_only:'on',statement_timeout:'20000',application_name:'movrr-deletion-policy-readonly'}});
const tables=['account_deletion_policy_version','account_deletion_retention_rule','account_deletion_action_rule'];
(async()=>{try{
 const r=await db.begin('read only',async tx=>({
  inspectedAt:new Date().toISOString(),project:'kzdvunpuxaxlphqvmzxw',readOnly:(await tx`SHOW transaction_read_only`)[0].transaction_read_only,
  policies:await tx`SELECT * FROM public.account_deletion_policy_version ORDER BY version`,
  retention:await tx`SELECT * FROM public.account_deletion_retention_rule ORDER BY policy_version,category`,
  actions:await tx`SELECT *,public.account_deletion_rule_allowed(policy_version,scope) allowed FROM public.account_deletion_action_rule ORDER BY policy_version,scope`,
  immutableTriggers:await tx`SELECT t.tgrelid::regclass::text relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition
   FROM pg_trigger t WHERE t.tgrelid=ANY(ARRAY['public.account_deletion_policy_version'::regclass,'public.account_deletion_retention_rule'::regclass,'public.account_deletion_action_rule'::regclass]) AND NOT t.tgisinternal ORDER BY 1,2`,
  tablePermissions:await tx`SELECT c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'INSERT') authenticated_insert,
   has_table_privilege('authenticated',c.oid,'UPDATE') authenticated_update,has_table_privilege('service_role',c.oid,'INSERT') service_insert
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ${tx(tables)} ORDER BY 1`,
  governanceWriters:await tx`SELECT p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosrc ~* '(INSERT INTO|UPDATE|DELETE FROM)[[:space:]]+(public[.])?account_deletion_(policy_version|retention_rule|action_rule)' ORDER BY 1`,
  functions:await tx`SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('capture_account_deletion_case','account_deletion_rule_allowed','account_deletion_activation_authorized',
   'review_account_deletion_proposal','set_account_deletion_intake','account_deletion_contract_status','account_deletion_immutable') ORDER BY 1`,
  contract:(await tx`SELECT public.account_deletion_contract_status() r`)[0].r,
  gate:(await tx`SELECT operating_state,operating_version,active_policy_version,managed_resources_execution_enabled,
   catalog_digest IS NOT NULL catalog_digest_present,catalog_verified_at,barrier_verified_at,disposition_verified_at FROM public.account_deletion_contract_gate WHERE singleton`)[0],
  counts:(await tx`SELECT (SELECT count(*) FROM public.account_deletion_jobs) requests,(SELECT count(*) FROM public.account_deletion_receipt_access) receipt_access,
   (SELECT count(*) FROM public.account_deletion_audit) lifecycle_audit,(SELECT count(*) FROM public.ops_command_receipt WHERE kind='deletion.intake') intake_commands`)[0],
  shop:await tx`SELECT redemption_enabled FROM public.shop_release_control`
 }));
 assert.equal(r.readOnly,'on');assert.equal(r.retention.filter(x=>x.policy_version===r.gate.active_policy_version).length,13);
 const out=path.join(root,'.tmp/deletion-policy-finalization');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'functions.json'),JSON.stringify(r.functions,null,2)+'\n');
 r.functions=r.functions.map(({definition,...f})=>({...f,sha256:crypto.createHash('sha256').update(definition.replace(/\r/g,'')).digest('hex')}));
 fs.writeFileSync(path.join(out,'production.json'),JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify({inspectedAt:r.inspectedAt,retentionCategories:r.retention.length,policyVersions:r.policies.length,actions:r.actions.length,
  approvedRetention:r.retention.filter(x=>x.approval_status==='approved').length,allowedActions:r.actions.filter(x=>x.allowed).length,
  governanceWriters:r.governanceWriters,immutableTriggers:r.immutableTriggers.map(x=>({table:x.relation,enabled:x.tgenabled})),gate:r.gate,contract:r.contract,counts:r.counts,shop:r.shop}));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||'inspection_failed'}));process.exitCode=1;});
