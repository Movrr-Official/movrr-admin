// Owner-approved 078 only. Default is read-only preflight. No account/data backfill.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/user-relationships-rollout-20261021');
fs.mkdirSync(out,{recursive:true});
const revision='f3f0dec1bccf515cb53f48356bc1007b56e5eea1',version='20261021131000',name='078_independent_user_accounts',project='kzdvunpuxaxlphqvmzxw';
const lf=s=>s.replace(/\r\n/g,'\n'),hash=s=>crypto.createHash('sha256').update(s).digest('hex'),read=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8'));
const source=p=>lf(cp.execFileSync('git',['show',revision+':'+p],{cwd:repo,encoding:'utf8'}));
const migration=source('scripts/'+name+'.sql'),receipt=JSON.parse(source('docs/verification/user-relationships/verification.json'));
assert.equal(hash(migration),receipt.migration.sha256Utf8Lf);assert.equal(receipt.validation.admin.tests,887);assert.equal(receipt.validation.web.tests,91);
const rehearsal=JSON.parse(fs.readFileSync(path.join(repo,'.tmp/user-relationships-20261021/full-schema-verification.json')));
assert.equal(rehearsal.allPublicTablesPreservedByMigration,157);assert.equal(rehearsal.onlyThreeFunctionsChanged,true);
const approved=JSON.parse(fs.readFileSync(path.join(repo,'docs/verification/enterprise-identity/rollout-blocked.json'))).correctedMigrations;
const definitions=s=>[...s.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\([\s\S]*?\bAS (\$\w*\$)([\s\S]*?)\2;?/g)].map(m=>({name:m[1],body:m[3]}));
const expected=new Map();for(const m of approved){const sql=source(m.path);assert.equal(hash(sql),m.sha256Utf8Lf);for(const f of definitions(sql))expected.set(f.name,f.body);}
const changes=definitions(migration);assert.deepEqual(changes.map(f=>f.name),['guard_employee_auth_insert','handle_new_user','provision_product']);
const changed=new Set(changes.map(f=>f.name)),norm=s=>lf(s).trim().replace(/;$/,'');
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.'+project));
const apply=process.argv.includes('--apply'),verify=process.argv.includes('--verify');assert(!(apply&&verify));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:20,onnotice:()=>{},connection:{application_name:'movrr-approved-independent-users-078',default_transaction_read_only:apply?'off':'on',statement_timeout:'60000'}});
const q=s=>'"'+s.replaceAll('"','""')+'"';
async function metadata(tx){return {
 functions:await tx`SELECT p.oid::regprocedure::text signature,p.proname,p.prosrc,p.prosecdef,p.proconfig,p.proacl,pg_get_userbyid(p.proowner) owner,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') checksum FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY 1`,
 policies:await tx`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
 columns:await tx`SELECT table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('public','auth') ORDER BY 1,2,ordinal_position`,
 grants:await tx`SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema IN ('public','auth') ORDER BY 1,2,3,4`,
 constraints:await tx`SELECT c.conrelid::regclass::text relation,c.conname,pg_get_constraintdef(c.oid) definition FROM pg_constraint c WHERE c.connamespace IN ('public'::regnamespace,'auth'::regnamespace) ORDER BY 1,2`,
 triggers:await tx`SELECT c.oid::regclass::text relation,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth') ORDER BY 1,2`
};}
async function fingerprints(tx){const r={};for(const t of await tx`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','auth') ORDER BY 1,2`){r[t.schemaname+'.'+t.tablename]=(await tx.unsafe(`SELECT count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM ${q(t.schemaname)}.${q(t.tablename)} t`))[0];}return r;}
async function gates(tx){const deletion=(await tx`SELECT requests_enabled,managed_resources_execution_enabled,operating_state,active_policy_version FROM public.account_deletion_contract_gate WHERE singleton`)[0],shop=(await tx`SELECT state,redemption_enabled FROM public.shop_release_control WHERE singleton`)[0];assert.equal(deletion.requests_enabled,true);assert.equal(deletion.managed_resources_execution_enabled,false);assert.equal(shop.redemption_enabled,false);assert.equal(shop.state,'disabled');return {deletion,shop};}
async function journal(tx){return tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations ORDER BY version DESC`;}
async function checks(tx,meta,post){const want=new Map(expected);if(post)for(const f of changes)want.set(f.name,f.body);for(const [name,body] of want){const found=meta.functions.filter(f=>f.proname===name);assert.equal(found.length,1,name);assert.equal(norm(found[0].prosrc),norm(body),'Function drift: '+name);}
 for(const signature of ['assign_employee_role(uuid,uuid,text)','user_owns_campaign(uuid)','commit_resend_platform_invitation(uuid)','abort_resend_platform_invitation(uuid)'])assert.equal((await tx`SELECT to_regprocedure(${signature}) old`)[0].old,null,'Retired function survives');
 assert.equal(meta.policies.filter(p=>/\b(is_admin|is_dashboard_admin)\(\)|user_owns_campaign/.test((p.qual||'')+(p.with_check||''))).length,0);
 for(const table of ['organisation_membership','admin_users'])for(const role of ['anon','authenticated','service_role'])assert.equal((await tx`SELECT has_table_privilege(${role},${'public.'+table},'INSERT,UPDATE,DELETE,TRUNCATE') allowed`)[0].allowed,false);
 for(const role of ['anon','authenticated'])assert.equal((await tx`SELECT has_function_privilege(${role},'provision_product(uuid,uuid,jsonb,text,text)','EXECUTE') allowed`)[0].allowed,false);
 assert.equal((await tx`SELECT has_function_privilege('service_role','provision_product(uuid,uuid,jsonb,text,text)','EXECUTE') allowed`)[0].allowed,true);
 const catalog=JSON.parse(source('docs/architecture/account-domain-capabilities.json'));let catalogChecks=0;for(const [domain,type] of [['partner','reward_partner'],['advertiser','advertiser'],['government','government']])for(const [role,caps] of Object.entries(catalog[domain])){assert.deepEqual((await tx`SELECT public.ops_organisation_capabilities(${type},${role}) caps`)[0].caps,caps);catalogChecks++;}
 return {exactCanonicalBodies:want.size,domainRoleCatalogChecks:catalogChecks,retiredPathsAbsent:true,directGrantDmlDenied:true,rlsPolicies:meta.policies.length};
}
(async()=>{try{const result=await db.begin(apply?'isolation level repeatable read':'isolation level repeatable read read only',async tx=>{
 if(apply){await tx.unsafe("SET LOCAL lock_timeout='5s'");await tx.unsafe('LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE');await tx`SELECT pg_advisory_xact_lock(70001,1)`;}
 const j=await journal(tx);for(let i=0;i<approved.length;i++){const m=approved[i],row=j.filter(r=>r.version==='2026102111'+String(i+1).padStart(2,'0')+'00');assert.equal(row.length,1);assert.equal(row[0].checksum,m.sha256Utf8Lf);assert.equal(row[0].name,path.basename(m.path,'.sql'));}
 assert.equal(j[0].version,verify?version:'20261021110700','Unexpected journal drift');
 if(verify){assert.equal(j[0].checksum,hash(migration));assert.equal(j[0].name,name);}else assert(!j.some(r=>r.name===name||r.version===version));
 const gate=await gates(tx),meta=await metadata(tx),checked=await checks(tx,meta,verify),before=await fingerprints(tx);
 if(!verify){const tested=JSON.parse(fs.readFileSync(path.join(repo,'.tmp/user-relationships-20261021/production-readonly.json')));assert.deepEqual(meta.functions.map(f=>({signature:f.signature,sha256:f.checksum})),tested.functions.map(f=>({signature:f.signature,sha256:f.sha256})),'Function drift from tested production schema');assert.deepEqual([...meta.policies],tested.policies,'Policy drift from tested production schema');}
 if(!apply)return {journal:j.slice(0,9),gates:gate,checks:checked,metadata:meta,fingerprints:before};
 const preflight=read('preflight.json');assert.deepEqual(JSON.parse(JSON.stringify(meta)),preflight.metadata,'Metadata changed since preflight');
 const hold=read('holds-verified.json');assert.equal(hold.active,true);assert(Date.now()-new Date(hold.recordedAt).getTime()<15*60*1000,'Hold verification stale');
 for(const [key,sha] of [['admin',revision],['web','2d14d76fcfe4974626f96ec845f13f5ca061cfc0']]){const candidate=read(key+'-runtime.json');assert.equal(candidate.readyState,'READY');assert.equal(candidate.gitSource.sha,sha);assert.equal(candidate.autoAssignCustomDomains,false);}
 await tx.unsafe(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
 await tx`INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback) VALUES(${version},${name},${[migration]},${'owner-approved:'+revision},${'independent-users:'+hash(migration)},${['-- No row backfill; preserve canonical authorization and use approved forward repair.']})`;
 const after=await fingerprints(tx),newMeta=await metadata(tx),postChecks=await checks(tx,newMeta,true);
 assert.deepEqual(after,before,'STOP: unexpected production row change within migration');assert.deepEqual(await gates(tx),gate);
 for(const key of ['policies','columns','grants','constraints','triggers'])assert.deepEqual(newMeta[key],meta[key],'Unexpected metadata change: '+key);
 assert.deepEqual(newMeta.functions.filter(f=>!changed.has(f.proname)),meta.functions.filter(f=>!changed.has(f.proname)));
 for(const fn of newMeta.functions.filter(f=>changed.has(f.proname))){const old=meta.functions.find(f=>f.signature===fn.signature);for(const key of ['signature','prosecdef','proconfig','proacl','owner'])assert.deepEqual(fn[key],old[key],'Privilege drift: '+fn.proname+'/'+key);}
 return {applied:true,journal:(await journal(tx)).slice(0,9),gates:gate,checks:postChecks,before,after,metadata:newMeta,preservation:{tables:Object.keys(before).length,allPublicAndAuthRowsUnchanged:true,onlyThreeFunctionBodiesChanged:true,policiesGrantsColumnsConstraintsTriggersUnchanged:true,accountMutations:0,financialMutations:0,backfills:0}};
 });result.recordedAt=new Date().toISOString();result.project=project;result.revision=revision;fs.writeFileSync(path.join(out,apply?'applied.json':verify?'verified.json':'preflight.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mode:apply?'applied':verify?'verified':'preflight',recordedAt:result.recordedAt,journal:result.journal,gates:result.gates,checks:result.checks,preservation:result.preservation}));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message,commitStatus:'Inspect journal before retry; do not infer commit from a lost response.'}));process.exitCode=1;});
