// Read-only deployment evidence. Never runs migrations or changes account access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),postgres=require('postgres'),{createClient}=require('@supabase/supabase-js');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/account-terminology-deploy-20261021');
const phase=process.argv[2];assert(['before','after'].includes(phase));fs.mkdirSync(out,{recursive:true});
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:20,onnotice:()=>{},connection:{application_name:'movrr-account-terminology-readonly',default_transaction_read_only:'on',statement_timeout:'60000'}});
const api=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),q=s=>'"'+s.replaceAll('"','""')+'"';
(async()=>{try{const result=await db.begin('isolation level repeatable read read only',async tx=>{
 const readOnly=(await tx`SHOW transaction_read_only`)[0].transaction_read_only;assert.equal(readOnly,'on');
 const functions=await tx`SELECT p.oid::regprocedure::text signature,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') checksum,p.proacl,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth') AND p.prokind='f' ORDER BY 1`;
 const policies=await tx`SELECT * FROM pg_policies WHERE schemaname IN ('public','auth') ORDER BY schemaname,tablename,policyname`;
 const grants=await tx`SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema IN ('public','auth') ORDER BY 1,2,3,4`;
 const tables=await tx`SELECT n.nspname schema,c.relname name,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth') AND c.relkind='r' ORDER BY 1,2`;
 const journal=await tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations ORDER BY version DESC`;
 const counts=(await tx`WITH x AS(SELECT u.id,u.status,EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=u.id) rider,EXISTS(SELECT 1 FROM public.admin_users s WHERE s.user_id=u.id AND s.role IS NOT NULL) staff,EXISTS(SELECT 1 FROM public.organisation_membership m WHERE m.user_id=u.id AND m.status<>'revoked') org FROM public."user" u) SELECT count(*)::int users,count(*) FILTER(WHERE status::text='active')::int active,count(*) FILTER(WHERE rider)::int riderUsers,count(*) FILTER(WHERE staff)::int internalStaff,count(*) FILTER(WHERE org)::int organisationUsers,count(*) FILTER(WHERE NOT rider AND NOT staff AND NOT org)::int unassigned,count(*) FILTER(WHERE rider AND NOT org AND NOT staff)::int riderOnlyWithoutOrganisation FROM x`)[0];
 const receiptPrivilege=(await tx`SELECT has_table_privilege('service_role','public.account_auth_sync','SELECT') allowed`)[0].allowed;
 const gates={deletion:(await tx`SELECT requests_enabled,managed_resources_execution_enabled,operating_state,active_policy_version FROM public.account_deletion_contract_gate WHERE singleton`)[0],shop:(await tx`SELECT state,redemption_enabled FROM public.shop_release_control WHERE singleton`)[0]};
 assert.equal(gates.deletion.requests_enabled,true);assert.equal(gates.deletion.managed_resources_execution_enabled,false);assert.equal(gates.shop.redemption_enabled,false);
 const fingerprints={};for(const t of await tx`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','auth') ORDER BY 1,2`){fingerprints[t.schemaname+'.'+t.tablename]=(await tx.unsafe(`SELECT count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM ${q(t.schemaname)}.${q(t.tablename)} t`))[0];}
 return {readOnly,functions,policies,grants,tables,journal,counts,receiptPrivilege,gates,fingerprints};
 });
 const accountRead=await api.from('user').select('id',{count:'exact',head:true}),receiptRead=await api.from('account_auth_sync').select('user_id').limit(1);
 result.rest={users:{count:accountRead.count,error:accountRead.error?.code??null},privateReceipt:{error:receiptRead.error?.code??null}};
 assert.equal(accountRead.error,null);assert.equal(result.rest.users.count,result.counts.users);
 result.recordedAt=new Date().toISOString();result.phase=phase;result.productionMutations=0;
 if(phase==='after'){
  const before=JSON.parse(fs.readFileSync(path.join(out,'database-before.json')));
  for(const key of ['functions','policies','grants','tables','journal','gates','receiptPrivilege','counts','rest'])assert.deepEqual(JSON.parse(JSON.stringify(result[key])),before[key],'Unexpected production baseline change: '+key);
  const routine=new Set(['public.shop_scheduler_state','public.shop_worker_health','public.admin_dashboard_sessions','auth.sessions','auth.refresh_tokens','auth.audit_log_entries']);
  result.dataChanges=Object.keys(before.fingerprints).filter(t=>JSON.stringify(before.fingerprints[t])!==JSON.stringify(result.fingerprints[t])).map(table=>({table,routine:routine.has(table)}));
  result.unexpectedChanges=result.dataChanges.filter(d=>!d.routine);assert.deepEqual(result.unexpectedChanges,[],'Unexpected account, cleanup or financial changes; review before claiming acceptance');
 }
 fs.writeFileSync(path.join(out,'database-'+phase+'.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({phase,at:result.recordedAt,counts:result.counts,rest:result.rest,gates:result.gates,protectedTables:Object.keys(result.fingerprints).length,dataChanges:result.dataChanges,productionMutations:0}));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message}));process.exitCode=1;});
