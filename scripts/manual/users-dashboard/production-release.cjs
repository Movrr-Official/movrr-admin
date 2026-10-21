// Owner-approved exact 079 only. Default is read-only preflight.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/users-dashboard-release-20261021');
fs.mkdirSync(out,{recursive:true});
const revision='083fe8ce749e012dea6812cafea10289bdd8a2eb',version='20261021144000',name='079_users_dashboard_sync_read';
const lf=s=>s.replace(/\r\n/g,'\n'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const source=p=>lf(cp.execFileSync('git',['show',revision+':'+p],{cwd:repo,encoding:'utf8'}));
const migration=source('scripts/'+name+'.sql'),receipt=JSON.parse(source('docs/verification/users-dashboard-p1/verification.json'));
assert.equal(hash(migration),'6d29a01faa98716c0b6d073f8863bdd5154cfe6e89d65a24d47cfe09e9e1ee4b');assert.equal(hash(migration),receipt.migration.sha256Utf8Lf);
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const apply=process.argv.includes('--apply'),verify=process.argv.includes('--verify');assert(!(apply&&verify));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:20,onnotice:()=>{},connection:{application_name:'movrr-approved-users-dashboard-079',default_transaction_read_only:apply?'off':'on',statement_timeout:'60000'}});
const q=s=>'"'+s.replaceAll('"','""')+'"',signature='read_user_auth_sync_pending(uuid,uuid[])';
async function metadata(tx){return {
 functions:await tx`SELECT p.oid::regprocedure::text signature,p.proname,p.prosrc,p.prosecdef,p.provolatile,p.proconfig,p.proacl,pg_get_userbyid(p.proowner) owner,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') checksum FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1`,
 policies:await tx`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
 grants:await tx`SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema IN ('public','auth') ORDER BY 1,2,3,4`,
 columns:await tx`SELECT table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('public','auth') ORDER BY 1,2,ordinal_position`,
 constraints:await tx`SELECT c.conrelid::regclass::text relation,c.conname,pg_get_constraintdef(c.oid) definition FROM pg_constraint c WHERE c.connamespace IN ('public'::regnamespace,'auth'::regnamespace) ORDER BY 1,2`,
 triggers:await tx`SELECT c.oid::regclass::text relation,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth') ORDER BY 1,2`
};}
async function fingerprints(tx){const r={};for(const t of await tx`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','auth') ORDER BY 1,2`)r[t.schemaname+'.'+t.tablename]=(await tx.unsafe(`SELECT count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM ${q(t.schemaname)}.${q(t.tablename)} t`))[0];return r;}
async function gates(tx){const deletion=(await tx`SELECT requests_enabled,managed_resources_execution_enabled,operating_state FROM public.account_deletion_contract_gate WHERE singleton`)[0],shop=(await tx`SELECT state,redemption_enabled FROM public.shop_release_control WHERE singleton`)[0];assert.equal(deletion.requests_enabled,true);assert.equal(deletion.managed_resources_execution_enabled,false);assert.equal(shop.redemption_enabled,false);assert.equal(shop.state,'disabled');return {deletion,shop};}
async function journal(tx){return tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations ORDER BY version`;}
function body(sql,fn){return sql.match(new RegExp('CREATE(?: OR REPLACE)? FUNCTION public\\.'+fn+'\\([\\s\\S]*?\\bAS (\\$\\w*\\$)([\\s\\S]*?)\\1;'))[2].trim();}
async function check(tx,meta,post){
 for(const [fn,file] of [['account_identity_active','071_external_account_domains.sql'],['ops_employee_capabilities','070_employee_rbac_authority.sql']]){const f=meta.functions.filter(f=>f.proname===fn);assert.equal(f.length,1);assert.equal(lf(f[0].prosrc).trim(),body(source('scripts/'+file),fn),'Dependency drift: '+fn);}
 for(const c of ['user_id','state'])assert(meta.columns.some(r=>r.table_schema==='public'&&r.table_name==='account_auth_sync'&&r.column_name===c));
 for(const role of ['anon','authenticated','service_role'])assert.equal((await tx`SELECT has_table_privilege(${role},'public.account_auth_sync','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed`)[0].allowed,false);
 const found=meta.functions.filter(f=>f.proname==='read_user_auth_sync_pending');assert.equal(found.length,post?1:0);
 if(post){const f=found[0];assert.equal(lf(f.prosrc).trim(),body(migration,'read_user_auth_sync_pending'));assert.equal(f.prosecdef,true);assert.equal(f.provolatile,'s');assert.deepEqual(f.proconfig,['search_path=""']);
  for(const role of ['anon','authenticated'])assert.equal((await tx`SELECT has_function_privilege(${role},${signature},'EXECUTE') allowed`)[0].allowed,false);
  assert.equal((await tx`SELECT has_function_privilege('service_role',${signature},'EXECUTE') allowed`)[0].allowed,true);
 }
 return {dependenciesMatchPinnedSource:true,privateTableDenied:true,readerInstalled:post};
}
(async()=>{try{const result=await db.begin(apply?'isolation level repeatable read':'isolation level repeatable read read only',async tx=>{
 if(apply){await tx.unsafe("SET LOCAL lock_timeout='5s'");await tx.unsafe('LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE');await tx`SELECT pg_advisory_xact_lock(70001,1)`;}
 const j=await journal(tx);for(const expected of receipt.production.journal){const row=j.find(r=>r.version===expected.version);assert(row,'Missing prior journal');assert.equal(row.checksum,expected.checksum);}
 const own=j.filter(r=>r.name===name||r.version===version);assert.equal(own.length,verify?1:0,'079 already exists or journal version collision');if(verify)assert.equal(own[0].checksum,hash(migration));
 const gate=await gates(tx),meta=await metadata(tx),checked=await check(tx,meta,verify),before=await fingerprints(tx);
 if(!apply)return {journal:j,checks:checked,gates:gate,metadata:meta,fingerprints:before};
 const preflight=JSON.parse(fs.readFileSync(path.join(out,'preflight.json'),'utf8'));assert.deepEqual(JSON.parse(JSON.stringify(meta)),preflight.metadata,'Schema/ACL drift since preflight');
 const candidate=JSON.parse(fs.readFileSync(path.join(out,'admin-runtime.json'),'utf8'));assert.equal(candidate.readyState,'READY');assert.equal(candidate.gitSource.sha,revision);assert.equal(candidate.autoAssignCustomDomains,false);
 await tx.unsafe(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
 await tx`INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback) VALUES(${version},${name},${[migration]},${'owner-approved:'+revision},${'users-dashboard:'+hash(migration)},${['-- Additive read contract; retain on app rollback. No account/data backfill.']})`;
 const after=await fingerprints(tx),newMeta=await metadata(tx),post=await check(tx,newMeta,true);
 assert.deepEqual(after,before,'Unexpected public/Auth record change in migration');assert.deepEqual(await gates(tx),gate);
 for(const key of ['policies','grants','columns','constraints','triggers'])assert.deepEqual(newMeta[key],meta[key],'Metadata drift: '+key);
 assert.deepEqual(newMeta.functions.filter(f=>f.proname!=='read_user_auth_sync_pending'),[...meta.functions]);
 return {applied:true,journal:await journal(tx),checks:post,gates:gate,before,after,metadata:newMeta,preservation:{tables:Object.keys(before).length,allPublicAndAuthRowsUnchanged:true,onlyOneReadFunctionAdded:true,existingFunctionsPoliciesGrantsColumnsConstraintsTriggersUnchanged:true}};
 });result.recordedAt=new Date().toISOString();result.revision=revision;result.project='kzdvunpuxaxlphqvmzxw';fs.writeFileSync(path.join(out,apply?'applied.json':verify?'verified.json':'preflight.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mode:apply?'applied':verify?'verified':'preflight',recordedAt:result.recordedAt,journal:result.journal.filter(j=>j.name===name),checks:result.checks,gates:result.gates,preservation:result.preservation}));
}finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({code:e.code||e.name,message:e.message,commitStatus:'Read journal before retry; a lost response does not prove rollback.'}));process.exitCode=1});
