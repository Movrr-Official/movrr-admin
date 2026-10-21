// Offline-only production schema fixture. No credentials or production network.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),dir=path.join(repo,'.tmp/user-relationships-20261021'),container='movrr-user-relationships-20261021-pg';
const schema=fs.readFileSync(path.join(dir,'production-schema-only.sql'),'utf8');
assert.equal(crypto.createHash('sha256').update(schema).digest('hex'),'94065a644a445e59044e2541e087c130c625820c87ddd9bddfedfd0100cdd07b');
const owner=JSON.parse(cp.execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];assert.equal(owner.Config.Labels['movrr.task'],'user-relationships-20261021');
const opts={host:'127.0.0.1',port:55443,username:'postgres',password:'isolated-local-test-only',max:1,onnotice:()=>{}},database='independent_users_'+process.pid,root=postgres({...opts,database:'postgres'}),db=postgres({...opts,database});
const q=s=>'"'+s.replaceAll('"','""')+'"',strip=s=>s.replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');let created=false;
async function fingerprint(tx){const result={};for(const t of await tx`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)result[t.tablename]=(await tx.unsafe(`SELECT count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM public.${q(t.tablename)} t`))[0];return result;}
(async()=>{try{
 await root.unsafe(`CREATE DATABASE ${q(database)}`);created=true;
 const prerequisites=JSON.parse(fs.readFileSync(path.join(dir,'production-schema-prerequisites.json')));
 for(const role of prerequisites.roles.map(r=>r.name).filter(r=>r!=='public'))if(!(await db`SELECT 1 FROM pg_roles WHERE rolname=${role}`).length)await db.unsafe(`CREATE ROLE ${q(role)} NOLOGIN`);
 for(const ext of prerequisites.extensions.filter(e=>!['plpgsql','pg_cron'].includes(e.extname))){await db.unsafe(`CREATE SCHEMA IF NOT EXISTS ${q(ext.nspname)}`);await db.unsafe(`CREATE EXTENSION IF NOT EXISTS ${q(ext.extname)} WITH SCHEMA ${q(ext.nspname)}`);}
 await db.unsafe(schema.replace(/^\\(?:un)?restrict .*$/gm,'').replace('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;'));
 const barrier=JSON.parse(fs.readFileSync(path.join(dir,'deletion-barrier-metadata.json')));
 for(const [table,rows] of [['account_deletion_barrier_binding',barrier.bindings],['account_deletion_barrier_parent',barrier.parents]])for(const row of rows)await db.unsafe('INSERT INTO public.'+q(table)+' SELECT * FROM jsonb_populate_record(NULL::public.'+q(table)+',$1::jsonb)',[db.json(row)]);
 for(const bundle of JSON.parse(fs.readFileSync(path.join(repo,'docs/verification/enterprise-identity/production-before.json'))).bundles)await db`INSERT INTO public.permission_bundle(key,name) VALUES(${bundle.key},${bundle.name})`;
 const actor=crypto.randomUUID(),historical=crypto.randomUUID();
 await db.unsafe('ALTER TABLE auth.users DISABLE TRIGGER USER');
 for(const [id,email] of [[actor,'local-actor@example.test'],[historical,'local-history@example.test']]){await db`INSERT INTO auth.users(id,email) VALUES(${id},${email})`;await db`INSERT INTO public."user"(id,email,name,role,status) VALUES(${id},${email},'Local fixture','advertiser','active')`;}
 await db.unsafe('ALTER TABLE auth.users ENABLE TRIGGER USER');
 await db`INSERT INTO public.admin_users(user_id,email,role) VALUES(${actor},'local-actor@example.test','super_admin')`;
 await db`INSERT INTO public.advertiser(user_id,company_name) VALUES(${historical},'Local existing institution')`;
 for(const prefix of ['071','072','073','074','075','076','077']){const file=fs.readdirSync(path.join(repo,'scripts')).filter(f=>f.startsWith(prefix+'_')&&f.endsWith('.sql'));assert.equal(file.length,1);await db.begin(async tx=>{await tx`SELECT set_config('movrr.migration_actor',${actor},true)`;await tx.unsafe(strip(fs.readFileSync(path.join(repo,'scripts',file[0]),'utf8')));});}
 const before=await fingerprint(db),functions=await db`SELECT p.oid::regprocedure::text signature,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1`;
 await db.unsafe(fs.readFileSync(path.join(repo,'scripts/078_independent_user_accounts.sql'),'utf8'));
 assert.deepEqual(await fingerprint(db),before,'078 must not rewrite any historical rows');
 const changed=new Set(['guard_employee_auth_insert','handle_new_user','provision_product']);
 const afterFunctions=await db`SELECT p.oid::regprocedure::text signature,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1`;
 assert.deepEqual(afterFunctions.filter(f=>!changed.has(f.proname)),functions.filter(f=>!changed.has(f.proname)));
 const id=crypto.randomUUID(),input={email:'local-independent@example.test',name:'Independent User',role:null,status:'active',languagePreference:'en',isVerified:true},hash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
 await db.begin(async tx=>{
  await tx`SELECT set_config('request.jwt.claim.role','service_role',true)`;
  await tx`SELECT public.provision_product(${actor},${id},${tx.json(input)},${hash},'validate')`;
  await tx`INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) VALUES(${id},${input.email},now(),'{}','{}')`;
  await tx`SELECT public.provision_product(${actor},${id},${tx.json(input)},${hash},'persist')`;
  await tx`UPDATE auth.users SET banned_until=NULL WHERE id=${id}`;
  await tx`SELECT public.provision_product(${actor},${id},${tx.json(input)},${hash},'complete')`;
 });
 assert.equal((await db`SELECT role FROM public."user" WHERE id=${id}`)[0].role,null);
 assert.equal((await db`SELECT public.account_identity_active(${id}) allowed`)[0].allowed,true);
 assert.equal((await db`SELECT public.is_movrr_admin(${id}) allowed`)[0].allowed,false);
 for(const table of ['rider','admin_users','organisation_membership'])assert.equal((await db.unsafe(`SELECT count(*)::int records FROM public.${q(table)} WHERE user_id=$1`,[id]))[0].records,0);
 const after=await fingerprint(db);for(const name of ['organisation','advertiser','rider','admin_users','organisation_membership','reward_transactions','rider_reward_balance','reward_redemptions','ride_session','platform_invitations'])assert.deepEqual(after[name],before[name],name+' must remain unchanged');
 const result={recordedAt:new Date().toISOString(),offline:true,productionConnections:0,productionRowsExported:0,actualPublicAndAuthSchema:true,allPublicTablesPreservedByMigration:Object.keys(before).length,onlyThreeFunctionsChanged:true,userOnly:{activeIdentity:true,legacyRole:null,riderProfiles:0,staffGrants:0,organisationMemberships:0,internalPrivileges:false},organisationFinancialRideAndInvitationFingerprintsUnchanged:true,localOnly:true};fs.writeFileSync(path.join(dir,'full-schema-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db.end({timeout:5});if(created)await root.unsafe(`DROP DATABASE ${q(database)} WITH (FORCE)`);await root.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message,productionMutations:false}));process.exitCode=1;});
