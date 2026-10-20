// Authorized 068 -> 069 rollout; default/readback modes are read-only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),source=repo,revision='7d5d53753a1c68b10c49ec614e4360c580e8f9ce';
const out=path.join(repo,'.tmp/admin-creation-rollout');fs.mkdirSync(out,{recursive:true});
const hash=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex'),norm=s=>s.replace(/\r\n/g,'\n').trim().replace(/;$/,'');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'docs/security/admin-creation-workflows-verification.json')));
const migrations=manifest.orderedSql.map((m,i)=>{const sql=fs.readFileSync(path.join(source,m.path),'utf8').replace(/\r\n/g,'\n');assert.equal(hash(sql),m.normalizedLfSha256);assert.equal(sql,cp.execFileSync('git',['show',revision+':'+m.path],{cwd:repo,encoding:'utf8'}).replace(/\r\n/g,'\n'));return{...m,sql,version:'2026102019530'+(i+1),name:path.basename(m.path,'.sql')};});
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const apply=process.argv.includes('--apply'),verify=process.argv.includes('--verify');assert(!(apply&&verify));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,onnotice:()=>{},connection:{application_name:'movrr-approved-creation-rollout',default_transaction_read_only:apply?'off':'on',statement_timeout:'30000'}});
const protectedTables=['user','rider','admin_users','organisation','organisation_membership','reward_transactions','rider_reward_balance','reward_redemptions','fulfilment','ride_session','account_deletion_jobs','account_deletion_review','account_deletion_audit','account_deletion_receipt_access'];
const q=s=>'"'+s.replaceAll('"','""')+'"';
async function snapshot(tx){
 const data={};for(const table of protectedTables)data[table]=(await tx.unsafe(`SELECT count(*)::text count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM public.${q(table)} t`))[0];
 const auth=(await tx`SELECT count(*)::text count,md5(coalesce(string_agg(md5(to_jsonb(a)::text),'' ORDER BY id),'')) digest FROM auth.users a`)[0];
 const account=await tx`SELECT a.id,md5(to_jsonb(a)::text) auth_digest,md5(to_jsonb(u)::text) user_digest,md5(to_jsonb(r)::text) rider_digest,u.role,u.status,r.status rider_status,ad.role employee_role,(SELECT count(*)::int FROM public.organisation_membership m WHERE m.user_id=a.id) memberships FROM auth.users a LEFT JOIN public."user" u ON u.id=a.id LEFT JOIN public.rider r ON r.user_id=a.id LEFT JOIN public.admin_users ad ON ad.user_id=a.id WHERE lower(a.email)='powerdonnl@gmail.com'`;
 const gates={deletion:(await tx`SELECT requests_enabled,managed_resources_execution_enabled,operating_state,active_policy_version FROM public.account_deletion_contract_gate WHERE singleton`)[0],shop:(await tx`SELECT state,redemption_enabled FROM public.shop_release_control WHERE singleton`)[0]};
 assert.equal(gates.deletion.requests_enabled,true);assert.equal(gates.deletion.managed_resources_execution_enabled,false);assert.equal(gates.shop.redemption_enabled,false);assert.equal(gates.shop.state,'disabled');
 return JSON.parse(JSON.stringify({data,auth,account,gates}));
}
async function baseline(tx){
 const files=['employee-provisioning/handle_new_user.sql','creation-workflows/functions.sql','creation-workflows/location-function.sql','creation-workflows/catalog-functions.sql','creation-workflows/invitation-function.sql'];const functions=[];
 for(const f of files){const text=fs.readFileSync(path.join(source,'scripts/fixtures',f),'utf8');for(const match of text.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\bAS (\$\w*\$)[\s\S]*?\2;?/g)){const name=match[1];const rows=await tx`SELECT pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=${name}`;assert.equal(rows.length,1,name);assert.equal(norm(rows[0].definition),norm(match[0]),'Production contract drift: '+name);functions.push(name);}}
 assert.equal(functions.length,7,'Dependency function capture coverage');
 const capabilities=fs.readFileSync(path.join(source,'scripts/056_alignment_capabilities.sql'),'utf8').match(/AS \$cap\$([\s\S]*?)\$cap\$/)[1];assert.equal(norm((await tx`SELECT prosrc FROM pg_proc WHERE oid='public.ops_employee_capabilities(text)'::regprocedure`)[0].prosrc),norm(capabilities));
 const triggers=await tx`SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgrelid IN ('auth.users'::regclass,'public.user'::regclass,'public.rider'::regclass) ORDER BY c.relname,t.tgname`;
 assert(triggers.some(t=>t.relname==='users'&&t.tgname==='on_auth_user_created'&&t.tgenabled==='O'&&t.definition.includes('handle_new_user()')));
 assert(!triggers.some(t=>['guard_employee_auth_insert','zz_mark_employee_profile_pending'].includes(t.tgname)));
 const schema=JSON.parse(fs.readFileSync(path.join(source,'scripts/fixtures/creation-workflows/schema.json')));const tables=[...new Set(schema.columns.map(c=>c.table_name))];
 const columns=await tx`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ${tx(tables)} ORDER BY table_name,ordinal_position`;
 const sorted=rows=>JSON.parse(JSON.stringify(rows)).sort((a,b)=>(a.table_name+'.'+a.column_name).localeCompare(b.table_name+'.'+b.column_name));
 assert.deepEqual(sorted(columns),sorted(schema.columns),'Creation workflow column contract drift');
 for(const e of schema.enums){const labels=await tx`SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=${e.typname} ORDER BY enumsortorder`;assert.deepEqual(labels.map(r=>r.enumlabel),e.labels,'Enum contract drift: '+e.typname);}
 for(const c of schema.constraints){const rows=await tx`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=${'public.'+c.relation}::regclass AND conname=${c.conname}`;assert.equal(rows.length,1,c.conname);assert.equal(rows[0].definition,c.definition,'Constraint drift: '+c.conname);}
 for(const c of schema.formattedTypes){const rows=await tx`SELECT format_type(atttypid,atttypmod) formatted_type FROM pg_attribute WHERE attrelid=${'public.'+c.table_name}::regclass AND attname=${c.column_name} AND NOT attisdropped`;assert.equal(rows[0]?.formatted_type,c.formatted_type,'Formatted type drift: '+c.table_name+'.'+c.column_name);}
 return{functions,canonicalCapabilitiesMatch:true,creationColumnContractsMatch:true,enumContracts:schema.enums.length,constraintContracts:schema.constraints.length,formattedTypeContracts:schema.formattedTypes.length,triggers};
}
async function installed(tx){
 const functions=[];for(const m of migrations)for(const match of m.sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\([\s\S]*?\bAS (\$\w*\$)([\s\S]*?)\2;/g)){
  const name=match[1],rows=await tx`SELECT p.oid::regprocedure::text signature,p.prosrc,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=${name}`;assert.equal(rows.length,1,name);const row=rows[0];assert.equal(norm(row.prosrc),norm(match[3]),'Installed source mismatch: '+name);
  if(!['accept_workboard_platform_invitation','guard_employee_auth_insert','mark_employee_profile_pending'].includes(name)){assert.equal(row.anon,false,name);assert.equal(row.authenticated,false,name);assert.equal(row.prosecdef,true,name);assert(row.proconfig.some(v=>v==='search_path=""'),name);}
  functions.push({name,signature:row.signature,sourceSha256:hash(norm(row.prosrc)),anon:row.anon,authenticated:row.authenticated,service:row.service});
 }
 assert(functions.length>=12,'Function body coverage');
 const tables=await tx`SELECT relname,relrowsecurity,has_table_privilege('anon',c.oid,'select,insert,update,delete') anon,has_table_privilege('authenticated',c.oid,'select,insert,update,delete') authenticated FROM pg_class c WHERE oid IN ('public.employee_provisioning'::regclass,'public.product_provisioning'::regclass,'public.admin_creation_operation'::regclass) ORDER BY relname`;
 for(const t of tables){assert.equal(t.relrowsecurity,true);assert.equal(t.anon,false);assert.equal(t.authenticated,false);}
 const enumLabels=await tx`SELECT enumlabel FROM pg_enum WHERE enumtypid='public.user_role'::regtype ORDER BY enumsortorder`;assert(!enumLabels.some(r=>r.enumlabel==='partner_operations_manager'));
 const caps=(await tx`SELECT public.ops_employee_capabilities('partner_operations_manager') capabilities`)[0].capabilities;assert(caps.length>0);assert(!caps.includes('users.role.assign'));assert(!caps.includes('staff.manage'));
 const triggers=await tx`SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname IN ('guard_employee_auth_insert','zz_mark_employee_profile_pending') ORDER BY tgname`;assert.equal(triggers.length,2);assert(triggers.every(t=>t.tgenabled==='O'));
 const ledgers={};for(const name of ['employee_provisioning','product_provisioning','admin_creation_operation'])ledgers[name]=await tx.unsafe(`SELECT ${name==='admin_creation_operation'?"'committed'::text":"state"} state,count(*)::int count FROM public.${q(name)} GROUP BY 1 ORDER BY 1`);
 return{functions,tables,enumLabels,partnerOperationsCapabilities:caps,triggers,ledgers};
}
async function deniedReadOnly(){const checks=[];async function denied(name,role,query,expected){try{await db.begin('read only',async tx=>{await tx`SELECT set_config('request.jwt.claim.role',${role},true)`;await query(tx);});assert.fail('Unexpected acceptance: '+name);}catch(e){assert(expected.test(e.message),name+': '+e.message);checks.push({name,denied:true,message:e.message});}}
 await denied('No service claim','authenticated',tx=>tx`SELECT public.provision_employee(NULL,'{}'::jsonb,'reserve')`,/Service role required/);
 await denied('Missing employee actor','service_role',tx=>tx`SELECT public.provision_employee(NULL,'{"role":"partner_operations_manager"}'::jsonb,'reserve')`,/Unauthorized employee role assignment/);
 await denied('Missing creation actor','service_role',tx=>tx`SELECT public.admin_create(NULL,'00000000-0000-0000-0000-000000000001','workboard_bootstrap','{}'::jsonb)`,/Unauthorized/);
 await denied('Incident Rider cannot grant roles','service_role',tx=>tx`SELECT public.provision_employee('007b5ab8-fea0-41f2-9068-055f154d7db0','{"role":"partner_operations_manager"}'::jsonb,'reserve')`,/Unauthorized employee role assignment/);
 const actor=(await db`SELECT a.user_id FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id WHERE a.role='super_admin' AND u.status='active' ORDER BY a.user_id LIMIT 1`)[0];assert(actor,'Existing authorized actor required for side-effect-free contract validation');
 const input={role:'partner_operations_manager',status:'active',name:'Contract validation only',email:'no-production-identity@example.invalid'};
 await denied('Invalid employee role before reservation','service_role',tx=>tx`SELECT public.provision_employee(${actor.user_id},${tx.json({...input,role:'not_a_role'})},'reserve')`,/Invalid employee provisioning contract/);
 await denied('Employee role with organisation scope rejected','service_role',tx=>tx`SELECT public.provision_employee(${actor.user_id},${tx.json({...input,organisationId:'00000000-0000-0000-0000-000000000001'})},'reserve')`,/Invalid employee provisioning contract/);
 return checks;}
(async()=>{try{
 const result=await db.begin(apply?'isolation level repeatable read':'isolation level repeatable read read only',async tx=>{
  await tx.unsafe("SET LOCAL lock_timeout='5s'");if(apply)await tx.unsafe('LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE');
  const journal=await tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations WHERE version IN ${tx(migrations.map(m=>m.version))} OR name IN ${tx(migrations.map(m=>m.name))} ORDER BY version`;
  if(verify){assert.equal(journal.length,2);for(const m of migrations){const row=journal.find(r=>r.version===m.version);assert(row);assert.equal(row.name,m.name);assert.equal(row.checksum,m.normalizedLfSha256);}return{journal,installed:await installed(tx),snapshot:await snapshot(tx)};}
  assert.equal(journal.length,0,'Existing journal entries: inspect before replay');
  const latest=await tx`SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 8`;assert(latest.every(m=>m.version<migrations[0].version),'Migration version ordering');
  const before=await snapshot(tx),dependencies=await baseline(tx);if(!apply)return{preflight:true,migrations:migrations.map(({sql,...m})=>m),latest,before,dependencies};
  for(const m of migrations){await tx.unsafe(m.sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));await tx`INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback) VALUES(${m.version},${m.name},${[m.sql]},${'codex-authorized:'+revision},${'admin-creation:'+m.normalizedLfSha256},${['-- Preserve provisioning and role-assignment evidence. Use reviewed rollback-unused.sql only if unused; otherwise forward recovery.']})`;}
  const verified=await installed(tx),after=await snapshot(tx);assert.deepEqual(after,before,'Protected data, incident account or operating gates changed');
  return{applied:true,migrations:migrations.map(({sql,...m})=>m),dependencies,installed:verified,before,after,protectedDataUnchanged:true};
 });
 if(verify)result.readOnlyDenials=await deniedReadOnly();result.sourceRevision=revision;result.recordedAt=new Date().toISOString();result.project='kzdvunpuxaxlphqvmzxw';
 fs.writeFileSync(path.join(out,apply?'applied.json':verify?'post-deployment.json':'preflight.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mode:apply?'applied':verify?'verified':'preflight',sourceRevision:revision,migrations:result.journal||result.migrations,dependencies:result.dependencies,installedFunctions:result.installed?.functions.length,gates:(result.after||result.snapshot||result.before).gates,protectedDataUnchanged:result.protectedDataUnchanged,readOnlyDenials:result.readOnlyDenials}));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message,detail:e.detail,commitStatus:'Inspect migration journal before retrying after interruption.'}));process.exitCode=1;});
