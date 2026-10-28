// Existing MOVRR production only. Default is a rolled-back schema rehearsal.
// --apply deploys only 087; --verify checks installed bodies/ACLs. Never emails.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, {info(){}, error(){}});
const postgres = require('postgres');
const root = process.cwd(), source = fs.readFileSync(path.join(root,'scripts/087_account_access_recovery.sql'),'utf8');
const version = '20261028103000', name = 'account_access_recovery';
const applying = process.argv.includes('--apply'), verifying = process.argv.includes('--verify'), digest = crypto.createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex');
assert(!(applying&&verifying),'Choose apply or verify');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'kzdvunpuxaxlphqvmzxw.supabase.co','Unexpected project');
assert(new URL(process.env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'),'Unexpected database');
const db = postgres(process.env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,onnotice(){},connection:{application_name:'movrr-account-access-rollout',statement_timeout:'30000'}});
const fn = ['account_access_state','begin_account_access','finish_account_access','record_account_access_delivery'];
const counts = tx => tx`select (select count(*) from auth.users)::int identities,(select count(*) from public.organisation_membership)::int memberships,(select count(*) from public.platform_invitations)::int invitations`;
(async()=>{let evidence;try{
 await db.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(70001,1)`;
  const existing=await tx`select name,statements from supabase_migrations.schema_migrations where version=${version}`;
  if(verifying){assert.equal(existing.length,1);assert.equal(existing[0].statements[0].replace(/\r\n/g,'\n'),source.replace(/\r\n/g,'\n'));}
  else assert.equal(existing.length,0,'Migration already recorded; use --verify instead of replay');
  const before=await counts(tx);
  if(!verifying)await tx.unsafe(source.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
  const functions=await tx`select p.proname,p.prosecdef,p.proconfig,
   has_function_privilege('anon',p.oid,'EXECUTE') anon,
   has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
   has_function_privilege('service_role',p.oid,'EXECUTE') service
   from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=any(${fn}) order by p.proname`;
  assert.equal(functions.length,4);
  for(const f of functions){assert(f.prosecdef);assert.deepEqual([...f.proconfig],['search_path=""']);assert(!f.anon&&!f.authenticated&&f.service);}
  const bodies=await tx`select proname,prosrc from pg_proc where pronamespace='public'::regnamespace and proname=any(${fn})`;
  const httpErrors=(await tx`select version from supabase_migrations.schema_migrations where version='20261028110000'`).length>0;
  for(const f of bodies){let body=new RegExp('CREATE FUNCTION public\\.'+f.proname+'\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;').exec(source)?.[1];if(httpErrors&&f.proname==='begin_account_access')body=body.replace("ERRCODE='40001'","ERRCODE='PT429'").replace("ERRCODE='40001'","ERRCODE='PT429'").replace("ERRCODE='40001'","ERRCODE='PT409'");assert.equal(f.prosrc,body,'Deployed function body mismatch: '+f.proname);}
  const after=await counts(tx);assert.deepEqual(after,before,'Recovery deployment changed identities or access');
  evidence={project:'kzdvunpuxaxlphqvmzxw',version,sha256:digest,applied:applying||verifying,verifiedAt:new Date().toISOString(),functions,countsUnchanged:true,emailsSent:0};
  if(verifying)return;
  if(!applying)throw Object.assign(new Error('verified_rollback'),{verified:true});
  await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},${name},${[source]})`;
 });
 }catch(e){if(!e.verified)throw e;}finally{await db.end();}
 const dir=path.join(root,applying||verifying?'docs/verification/account-access-20261028':'.tmp/account-access');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,verifying?'backend-verification.json':applying?'backend-deployment.json':'schema-rehearsal.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message?.split('\n')[0]}));process.exitCode=1});
