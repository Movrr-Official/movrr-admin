// Production READ ONLY. No DDL, identities, sessions, emails or financial writes.
// Run from repository root: node scripts/manual/users-dashboard/verify-production.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),postgres=require('postgres'),{createClient}=require('@supabase/supabase-js');
const repo=path.resolve(__dirname,'../../..');
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,connection:{application_name:'movrr-users-dashboard-p1-readonly',default_transaction_read_only:'on',statement_timeout:'30000'}});
const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const quote=s=>'"'+s.replaceAll('"','""')+'"';
(async()=>{try{
 const result=await db.begin('isolation level repeatable read read only',async tx=>{
  assert.equal((await tx`SHOW transaction_read_only`)[0].transaction_read_only,'on');
  const counts=(await tx`SELECT count(*)::int total,count(*) FILTER(WHERE status::text='active')::int active,count(*) FILTER(WHERE status::text='suspended')::int suspended,count(*) FILTER(WHERE status::text='pending')::int pending,
   count(*) FILTER(WHERE created_at>=now()-interval '7 days')::int registered7,count(*) FILTER(WHERE created_at>=now()-interval '30 days')::int registered30,
   count(*) FILTER(WHERE created_at>=now()-interval '60 days' AND created_at<now()-interval '30 days')::int registeredPrevious30,
   count(*) FILTER(WHERE is_verified)::int verified,
   count(*) FILTER(WHERE greatest(nullif(to_jsonb(u)->>'last_active_at','')::timestamptz,nullif(to_jsonb(u)->>'last_login','')::timestamptz,
    (SELECT a.last_sign_in_at FROM auth.users a WHERE a.id=u.id),(SELECT max(occurred_at) FROM public.user_activity WHERE user_id=u.id))>=now()-interval '30 days')::int recentlyActive30,
   (SELECT count(*)::int FROM public.rider) riderProfiles,(SELECT count(*)::int FROM public.rider WHERE user_id IS NULL) orphanProfiles,
   (SELECT count(DISTINCT user_id)::int FROM public.rider) riderUsers,(SELECT count(*)::int FROM public.organisation_membership) memberships,
   (SELECT count(DISTINCT user_id)::int FROM public.organisation_membership WHERE status<>'revoked') organisationUsers,
   (SELECT count(DISTINCT user_id)::int FROM public.admin_users WHERE role IS NOT NULL) staff,(SELECT count(*)::int FROM auth.users) authUsers FROM public."user" u`)[0];
  const shapes=(await tx`WITH x AS(SELECT u.id,EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=u.id) rider,
   EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=u.id AND a.role IS NOT NULL) staff,
   EXISTS(SELECT 1 FROM public.organisation_membership m WHERE m.user_id=u.id AND m.status<>'revoked') org FROM public."user" u)
   SELECT count(*) FILTER(WHERE NOT rider AND NOT staff AND NOT org)::int userOnly,
    count(*) FILTER(WHERE rider AND NOT staff AND NOT org)::int riderOnlyWithoutOrganisation,
    count(*) FILTER(WHERE staff AND NOT rider AND NOT org)::int staffOnly,
    count(*) FILTER(WHERE rider::int+staff::int+org::int>1)::int multipleDomains FROM x`)[0];
  const tablePrivileges=await tx`SELECT has_table_privilege('service_role','public.account_auth_sync','SELECT') sync_select,has_table_privilege('service_role','public.user','SELECT') users_select`;
  const journal=await tx`SELECT version,name,encode(sha256(convert_to(statements[1],'UTF8')),'hex') checksum FROM supabase_migrations.schema_migrations WHERE name ~ '^07[1-9]_' ORDER BY version`;
  const gates={deletion:(await tx`SELECT requests_enabled,managed_resources_execution_enabled,operating_state FROM public.account_deletion_contract_gate WHERE singleton`)[0],shop:(await tx`SELECT state,redemption_enabled FROM public.shop_release_control WHERE singleton`)[0]};
  assert.equal(gates.deletion.requests_enabled,true);assert.equal(gates.deletion.managed_resources_execution_enabled,false);assert.equal(gates.shop.redemption_enabled,false);
  const fingerprints={};
  for(const t of await tx`SELECT schemaname,tablename FROM pg_tables WHERE (schemaname='auth' AND tablename='users') OR (schemaname='public' AND tablename IN ('user','rider','admin_users','organisation_membership','account_auth_sync','rider_reward_balance','reward_transactions','reward_redemptions','wallet_ledger','wallets')) ORDER BY 1,2`){
   fingerprints[t.schemaname+'.'+t.tablename]=(await tx.unsafe(`SELECT count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM ${quote(t.schemaname)}.${quote(t.tablename)} t`))[0];
  }
  return {counts,shapes,tablePrivileges,journal,gates,fingerprints};
 });
 const sqlContexts=[];
 const staff=await db`SELECT user_id,role FROM public.admin_users`;
 const external=await db`SELECT DISTINCT user_id FROM public.organisation_membership WHERE status='active' AND user_id NOT IN(SELECT user_id FROM public.admin_users)`;
 for(const actor of [...staff,...external.map(r=>({...r,role:'external membership'}))]){
  const context=await db.begin('read only',async tx=>{
   await tx.unsafe('SET LOCAL ROLE authenticated');
   await tx`SELECT set_config('request.jwt.claim.sub',${actor.user_id},true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',${JSON.stringify({sub:actor.user_id,role:'authenticated',aal:'aal2'})},true)`;
   return (await tx`SELECT public.identity_has_capability('users.read') users_read,(SELECT count(*)::int FROM public."user") visible_users`)[0];
  });sqlContexts.push({role:actor.role,...context});
 }
 const reads={};for(const [table,select] of [['user','id'],['admin_users','user_id,role'],['rider','user_id,status'],['organisation_membership','id,user_id,organisation_id,role,status,updated_at,organisation:organisation_id(name,type)'],['account_auth_sync','user_id']]){
  const r=await client.from(table).select(select);reads[table]={count:r.data?.length,error:r.error};
 }
 result.recordedAt=new Date().toISOString();result.method='Read-only production PostgreSQL transactions and Supabase GET requests; SQL contexts are not browser acceptance';result.sqlContexts=sqlContexts;result.reads=reads;
 const http=[];for(const url of ['https://admin.movrr.nl/users','https://admin.movrr.nl/api/dashboard/reads/users?args=%5B%5D']){const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});http.push({url,status:r.status,location:r.headers.get('location'),cacheControl:r.headers.get('cache-control')});}result.anonymousHttp=http;
 const out=path.join(repo,'.tmp/users-dashboard-p1-20261021');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'production-readonly.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({recordedAt:result.recordedAt,counts:result.counts,shapes:result.shapes,sqlContexts,reads,gates:result.gates,anonymousHttp:http}));
}finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({code:e.code,message:e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]')}));process.exitCode=1});
