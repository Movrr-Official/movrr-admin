// Approved 070 rollout. Default and --verify use read-only transactions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/employee-rbac-rollout-20261021');fs.mkdirSync(out,{recursive:true});
const revision='89c3a0b7f874af7e3a68a343a22bed8bc244f142',file='scripts/070_employee_rbac_authority.sql',checksum='185617e57be2f3f33f926dc0c19380b793f3bd7aff4f079b406021d85d0f2728',version='20261021071500',name='070_employee_rbac_authority';
const lf=s=>s.replace(/\r\n/g,'\n'),hash=s=>crypto.createHash('sha256').update(s).digest('hex'),norm=s=>lf(s).trim().replace(/;$/,'');
const sql=lf(fs.readFileSync(path.join(repo,file),'utf8'));assert.equal(hash(sql),checksum);assert.equal(sql,lf(cp.execFileSync('git',['show',revision+':'+file],{cwd:repo,encoding:'utf8'})));
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const apply=process.argv.includes('--apply'),verify=process.argv.includes('--verify');assert(!(apply&&verify));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,onnotice:()=>{},connection:{application_name:'movrr-approved-canonical-employee-rbac-070',default_transaction_read_only:apply?'off':'on',statement_timeout:'45000'}});
const q=s=>'"'+s.replaceAll('"','""')+'"';
const protectedTables=['user','rider','organisation','organisation_membership','reward_transactions','rider_reward_balance','reward_redemptions','fulfilment','ride_session','employee_provisioning','product_provisioning','admin_creation_operation','platform_invitations','workboard_team_members','account_deletion_jobs','account_deletion_review','account_deletion_audit','account_deletion_receipt_access'];
async function snapshot(tx){
 const data={};for(const table of protectedTables)data[table]=(await tx.unsafe(`SELECT count(*)::text count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM public.${q(table)} t`))[0];
 data.auth=(await tx`SELECT count(*)::text count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM auth.users t`)[0];
 data.staffIdentity=(await tx`SELECT count(*)::text count,md5(coalesce(string_agg(md5((to_jsonb(t)-'role'-'updated_at')::text),'' ORDER BY md5((to_jsonb(t)-'role'-'updated_at')::text)),'')) digest FROM public.admin_users t`)[0];
 const gates={deletion:(await tx`SELECT requests_enabled,managed_resources_execution_enabled,operating_state,active_policy_version FROM public.account_deletion_contract_gate WHERE singleton`)[0],shop:(await tx`SELECT state,redemption_enabled FROM public.shop_release_control WHERE singleton`)[0]};
 assert.equal(gates.deletion.requests_enabled,true);assert.equal(gates.deletion.managed_resources_execution_enabled,false);assert.equal(gates.shop.redemption_enabled,false);assert.equal(gates.shop.state,'disabled');
 return {data,gates};
}
function definitions(text){return [...lf(text).matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\([\s\S]*?\bAS (\$\w*\$)([\s\S]*?)\2;?/g)].map(m=>({name:m[1],body:m[3]}));}
async function metadata(tx){return {
 unrelatedFunctions:await tx`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname NOT IN ${tx([...definitions(sql).map(d=>d.name),'get_user_role','mark_employee_profile_pending'])} ORDER BY 1`,
 functions:await tx`SELECT p.oid::regprocedure::text signature,p.proname,pg_get_functiondef(p.oid) definition,p.prosrc,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.prosrc ilike '%admin_users%' OR p.proname IN ('ops_employee_capabilities','ops_queue_notifications','get_user_role','handle_new_user','mark_employee_profile_pending','guard_employee_auth_insert','update_admin_user_profile')) ORDER BY 1`,
 policies:await tx`SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND (coalesce(qual,'') LIKE '%admin_users%' OR coalesce(with_check,'') LIKE '%admin_users%' OR coalesce(qual,'') LIKE '%is_dashboard_admin%' OR policyname='employee_membership_required') ORDER BY tablename,policyname`,
 triggers:await tx`SELECT t.tgrelid::regclass::text relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('auth.users'::regclass,'public.admin_users'::regclass) ORDER BY 1,2`,
 constraints:await tx`SELECT c.conrelid::regclass::text relation,conname,pg_get_constraintdef(c.oid) definition FROM pg_constraint c WHERE c.conrelid='public.admin_users'::regclass OR c.confrelid='public.admin_users'::regclass ORDER BY 1,2`,
 roleCounts:await tx`SELECT role,count(*)::int count FROM public.admin_users GROUP BY role ORDER BY role`,
 enums:await tx`SELECT enumlabel FROM pg_enum WHERE enumtypid='public.user_role'::regtype ORDER BY enumsortorder`,
 ledgers:await tx`SELECT 'employee' kind,state,count(*)::int count FROM public.employee_provisioning GROUP BY state UNION ALL SELECT 'product',state,count(*)::int FROM public.product_provisioning GROUP BY state ORDER BY 1,2`
};}
async function baseline(tx,m){
 const manifest=JSON.parse(fs.readFileSync(path.join(repo,'docs/security/admin-creation-workflows-verification.json')));
 const journal=await tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10`;
 for(const [i,expected] of manifest.orderedSql.entries()){const row=journal.find(r=>r.version==='2026102019530'+(i+1));assert(row,'Required migration journal missing');assert.equal(row.checksum,expected.normalizedLfSha256);}
 assert(journal.every(j=>j.version<version),'Unexpected later migration: stop');
 assert.equal((await tx`SELECT count(*)::int n FROM public.employee_provisioning WHERE state<>'complete'`)[0].n,0,'Incomplete employee provisioning requires investigation');
 const expected=new Map();for(const f of ['068_employee_provisioning.sql','069_admin_creation_transactions.sql'])for(const d of definitions(fs.readFileSync(path.join(repo,'scripts',f),'utf8')))expected.set(d.name,d.body);
 const replaced=definitions(sql).map(x=>x.name);for(const key of replaced){if(!expected.has(key))continue;const rows=m.functions.filter(f=>f.proname===key);assert.equal(rows.length,1,key);assert.equal(norm(rows[0].prosrc),norm(expected.get(key)),'Production function drift: '+key);}
 const oldCaps=fs.readFileSync(path.join(repo,'scripts/056_alignment_capabilities.sql'),'utf8').match(/AS \$cap\$([\s\S]*?)\$cap\$/)[1];assert.equal(norm(m.functions.find(f=>f.proname==='ops_employee_capabilities').prosrc),norm(oldCaps));
 const grants=JSON.parse(sql.match(/AS \$cap\$ SELECT coalesce\('([^']+)'::jsonb/)[1]);const aliases={admin:'operations_manager',moderator:'product_operations',support:'support_agent',compliance_officer:'compliance_analyst',government:'programme_operations_manager'};
 for(const row of m.roleCounts){if(!row.role)continue;const canonical=aliases[row.role]||row.role;const caps=(await tx`SELECT public.ops_employee_capabilities(${row.role}) caps`)[0].caps;assert.deepEqual(caps,grants[canonical],'Existing employee capabilities changed');}
 const bootstrap=definitions(fs.readFileSync(path.join(repo,'scripts/fixtures/employee-provisioning/handle_new_user.sql'),'utf8'))[0];assert.equal(norm(m.functions.find(f=>f.proname==='handle_new_user').prosrc),norm(bootstrap.body));
 const join=JSON.parse(fs.readFileSync(path.join(repo,'scripts/fixtures/community/production-contracts.json'))).functions.find(f=>f.signature==='join_community_ride(uuid,uuid)');assert.equal(norm(m.functions.find(f=>f.proname==='join_community_ride').definition),norm(join.definition));
 for(const p of m.policies.filter(p=>(p.qual||'').includes('admin_users')||(p.with_check||'').includes('admin_users')))for(const e of [p.qual,p.with_check])if(e!==null)assert(['(EXISTS(SELECT1FROMadmin_usersauWHERE(au.user_id=auth.uid())))','(EXISTS(SELECT1FROMadmin_usersWHERE(admin_users.user_id=auth.uid())))'].includes(e.replace(/\s/g,'').replaceAll('public.','')),'Compound policy dependency: '+p.tablename+'.'+p.policyname);
 assert(!m.functions.some(f=>f.proname!=='get_user_role'&&f.prosrc.includes('get_user_role(')),'Obsolete function still has a caller');
 return journal;
}
async function installed(tx,m){
 const checks=[];for(const d of definitions(sql)){const rows=m.functions.filter(f=>f.proname===d.name);assert.equal(rows.length,1,d.name);assert.equal(norm(rows[0].prosrc),norm(d.body),'Installed body drift: '+d.name);checks.push({name:d.name,sourceSha256:hash(norm(d.body)),anon:rows[0].anon,authenticated:rows[0].authenticated,service:rows[0].service});}
 for(const name of ['assign_employee_role','update_admin_user_profile','provision_employee']){const f=m.functions.find(f=>f.proname===name);assert(f.prosecdef);assert.equal(f.anon,false);assert.equal(f.authenticated,false);assert.equal(f.service,true);}
 for(const signature of ['get_user_role()','mark_employee_profile_pending()','update_admin_user_profile(uuid,uuid,text,jsonb)'])assert.equal((await tx`SELECT to_regprocedure(${'public.'+signature}) old`)[0].old,null,signature);
 assert.equal((await tx`SELECT count(*)::int n FROM admin_users WHERE role IS NOT NULL AND jsonb_array_length(public.ops_employee_capabilities(role))=0`)[0].n,0);
 assert(!m.enums.some(e=>e.enumlabel==='partner_operations_manager'));
 assert(m.functions.find(f=>f.proname==='provision_employee').prosrc.includes('public.assign_employee_role(p_actor,r.user_id,requested)'));
 assert(!m.functions.find(f=>f.proname==='assign_employee_role').prosrc.match(/UPDATE public\."user" SET role/));
 assert(m.constraints.some(c=>c.conname==='admin_users_canonical_employee_role'));
 assert(!m.triggers.some(t=>t.tgname==='zz_mark_employee_profile_pending'));assert(m.triggers.some(t=>t.tgname==='guard_employee_auth_insert'&&t.tgenabled==='O'));
 const aliasCaps=await tx`SELECT public.ops_employee_capabilities('admin') legacy,public.ops_employee_capabilities('partner_operations_manager') canonical`;assert.deepEqual(aliasCaps[0].legacy,[]);assert(aliasCaps[0].canonical.length>0);
 const duplicates=(await tx`SELECT count(*)::int n FROM (SELECT user_id FROM admin_users GROUP BY user_id HAVING count(*)>1) x`)[0].n;assert.equal(duplicates,0);
 return {functions:checks,legacyContractsRetired:true,duplicateGrants:duplicates,partnerOperationsCapabilities:aliasCaps[0].canonical};
}
async function denials(){const result=[];async function denied(label,claim,query,re){try{await db.begin('read only',async tx=>{await tx`SELECT set_config('request.jwt.claim.role',${claim},true)`;await query(tx);});assert.fail('Unexpected acceptance '+label);}catch(e){assert(re.test(e.message),label+': '+e.message);result.push({label,denied:true});}}
 await denied('Untrusted employee grant','authenticated',tx=>tx`SELECT assign_employee_role(NULL,NULL,'partner_operations_manager')`,/Service role required/);
 await denied('Retired alias','service_role',tx=>tx`SELECT assign_employee_role(NULL,NULL,'admin')`,/Canonical employee role/);
 await denied('Organisation role rejected as employee','service_role',tx=>tx`SELECT assign_employee_role(NULL,NULL,'owner')`,/Canonical employee role/);
 await denied('Unauthorised employee creation','service_role',tx=>tx`SELECT provision_employee(NULL,'{"role":"partner_operations_manager"}'::jsonb,'reserve')`,/Unauthorized/);
 const actors=await db`SELECT a.user_id FROM admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id WHERE a.role='super_admin' AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now())`;assert.equal(actors.length,1);
 await denied('Organisation payload cannot enter employee provisioning','service_role',tx=>tx`SELECT provision_employee(${actors[0].user_id},'{"role":"partner_operations_manager","status":"active","name":"Validation only","email":"validation@example.invalid","organisationId":"00000000-0000-0000-0000-000000000001"}'::jsonb,'reserve')`,/Invalid employee provisioning contract/);
 return result;
}
async function effectiveAccess(){
 const staff=await db`SELECT a.user_id,a.role,u.status,au.deleted_at,au.banned_until FROM admin_users a LEFT JOIN public."user" u ON u.id=a.user_id LEFT JOIN auth.users au ON au.id=a.user_id`;
 let allowed=0,denied=0;for(const row of staff){const expected=!!row.role&&row.status==='active'&&!row.deleted_at&&(!row.banned_until||new Date(row.banned_until)<=new Date());const actual=await db.begin('read only',async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${row.user_id},true),set_config('request.jwt.claim.role','authenticated',true)`;return (await tx`SELECT public.is_dashboard_admin() allowed`)[0].allowed;});assert.equal(actual,expected);if(actual)allowed++;else denied++;}
 const riders=await db`SELECT r.id,r.user_id FROM rider r JOIN public."user" u ON u.id=r.user_id JOIN auth.users au ON au.id=u.id WHERE r.status='active' AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now()) ORDER BY r.id LIMIT 5`;
 for(const row of riders)await db.begin('read only',async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${row.user_id},true),set_config('request.jwt.claim.role','authenticated',true)`;assert.equal((await tx`SELECT public.current_rider_id() id`)[0].id,row.id);});
 const anomalies=(await db`SELECT count(*)::int n FROM admin_users a LEFT JOIN public."user" u ON u.id=a.user_id LEFT JOIN auth.users au ON au.id=a.user_id WHERE a.role IS NOT NULL AND (u.id IS NULL OR au.id IS NULL)`)[0].n;assert.equal(anomalies,0);
 const audits=(await db`SELECT count(*)::int count,count(DISTINCT actor_user_id)::int actors,count(*) FILTER(WHERE previous_state->>'role'='admin' AND resulting_state->>'role'='operations_manager')::int "adminToOperations" FROM platform_audit_record WHERE reason='070_employee_role_canonicalization'`)[0];assert.equal(audits.count,3);assert.equal(audits.actors,1);assert.equal(audits.adminToOperations,3);
 return {employeeMembershipsChecked:staff.length,allowed,denied,activeRiderOwnIdentityChecks:riders.length,orphanEmployeeGrants:anomalies,canonicalizationAudit:audits,method:'transaction-local existing identity contexts in read-only PostgreSQL; not authenticated browser/device sign-in'};
}
(async()=>{try{
 const result=await db.begin(apply?'isolation level repeatable read':'isolation level repeatable read read only',async tx=>{
  if(apply){await tx.unsafe("SET LOCAL lock_timeout='5s'");await tx.unsafe('LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE');await tx`SELECT pg_advisory_xact_lock(70001,1)`;}
  const journal=await tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations WHERE version=${version} OR name=${name}`;
  const before=await snapshot(tx),meta=await metadata(tx);
  if(verify){assert.equal(journal.length,1);assert.equal(journal[0].checksum,checksum);return {journal,installed:await installed(tx,meta),snapshot:before,metadata:meta};}
  assert.equal(journal.length,0,'Already applied: inspect before retrying');const dependencies=await baseline(tx,meta);
  if(!apply)return {dependencies,before,metadata:meta};
  const prior=JSON.parse(fs.readFileSync(path.join(out,'preflight.json')));assert.deepEqual(JSON.parse(JSON.stringify(meta)),prior.metadata,'Production metadata changed since preflight');
  const actors=await tx`SELECT a.user_id FROM admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id WHERE a.role='super_admin' AND u.status='active' AND au.deleted_at IS NULL AND (au.banned_until IS NULL OR au.banned_until<=now())`;assert.equal(actors.length,1,'Unambiguous existing authorized actor required');
  await tx`SELECT set_config('movrr.migration_actor',${actors[0].user_id},true)`;
  await tx.unsafe(sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
  await tx`INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback) VALUES(${version},${name},${[sql]},${'codex-authorized:'+revision},${'canonical-employee-rbac:'+checksum},${['-- Preserve all identity, membership and audit evidence. Coordinated approved forward recovery required; do not reinstall legacy authorities.']})`;
  const after=await snapshot(tx),afterMeta=await metadata(tx);assert.deepEqual(after,before,'Protected records/gates changed');assert.deepEqual(afterMeta.enums,meta.enums);assert.deepEqual(afterMeta.unrelatedFunctions,meta.unrelatedFunctions,'Unrelated function changed');
  const expectedCounts=new Map();const aliases={admin:'operations_manager',moderator:'product_operations',support:'support_agent',compliance_officer:'compliance_analyst',government:'programme_operations_manager'};for(const r of meta.roleCounts){const role=aliases[r.role]||r.role;expectedCounts.set(role,(expectedCounts.get(role)||0)+r.count);}assert.deepEqual(new Map(afterMeta.roleCounts.map(r=>[r.role,r.count])),expectedCounts);
  return {applied:true,journal:[{version,name,checksum}],dependencies,before,after,protectedDataUnchanged:true,installed:await installed(tx,afterMeta),metadata:afterMeta};
 });
 if(verify){result.readOnlyDenials=await denials();result.effectiveAccess=await effectiveAccess();}result.project='kzdvunpuxaxlphqvmzxw';result.sourceRevision=revision;result.recordedAt=new Date().toISOString();result.migration={version,name,checksum};
 fs.writeFileSync(path.join(out,apply?'applied.json':verify?'post-deployment.json':'preflight.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mode:apply?'applied':verify?'verified':'preflight',sourceRevision:revision,migration:result.migration,baseline:result.dependencies,roleCounts:result.metadata.roleCounts,provisioning:result.metadata.ledgers,protectedDataUnchanged:result.protectedDataUnchanged,gates:(result.after||result.snapshot||result.before).gates,installed:result.installed,readOnlyDenials:result.readOnlyDenials,effectiveAccess:result.effectiveAccess}));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message,commitStatus:'Inspect journal before retry after any interruption.'}));process.exitCode=1;});
