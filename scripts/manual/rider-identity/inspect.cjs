// Read-only incident inspection. Never prints credentials or session secrets.
const fs=require('node:fs'),path=require('node:path'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..');
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connection:{default_transaction_read_only:'on',statement_timeout:'20000'}});
const quote=s=>'"'+s.replaceAll('"','""')+'"';
(async()=>{try{const result=await db.begin('read only',async tx=>{
 const account=(await tx`select a.id,a.created_at,a.last_sign_in_at,a.raw_user_meta_data->>'server_assigned_role' legacy_role,u.role,u.status,r.id rider_id,r.status rider_status from auth.users a join public."user" u on u.id=a.id left join public.rider r on r.user_id=a.id where lower(a.email)='powerdonnl@gmail.com'`)[0];
 if(!account)throw Error('Incident account absent');
 const dependencies=[];
 const fks=await tx`select c.conrelid::regclass::text child,c.confrelid::regclass::text parent,pg_get_constraintdef(c.oid) definition,a.attname column from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid in ('public.rider'::regclass,'public.user'::regclass,'auth.users'::regclass)`;
 for(const fk of fks){const count=(await tx.unsafe(`select count(*)::int count from ${fk.child} where ${quote(fk.column)}=$1`,[fk.parent==='rider'||fk.parent==='public.rider'?account.rider_id:account.id]))[0].count;dependencies.push({...fk,count});}
 const functions=await tx`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and (p.proname in ('handle_new_user','guard_employee_auth_insert','identity_context','identity_has_capability') or p.prosrc ilike '%user_role%' or p.prosrc ilike '%last_active%' or p.prosrc ilike '%last_login%')`;
 const activity=await tx`select source,action,user_id=actor_user_id self_actor,count(*)::int records,max(occurred_at) latest from public.user_activity where user_id=${account.id} or actor_user_id=${account.id} group by 1,2,3`;
 const sessions=await tx`select auth_user_id,last_seen_at from public.admin_dashboard_sessions`;
 const provisioning={};for(const table of ['employee_provisioning','product_provisioning','external_account_provisioning'])provisioning[table]=await tx.unsafe(`select to_jsonb(t)-'input'-'fingerprint' record from public.${table} t where user_id=$1`,[account.id]);
 const memberships=await tx`select m.*,o.name,o.type from public.organisation_membership m join public.organisation o on o.id=m.organisation_id where m.user_id=${account.id}`;
 const triggers=await tx`select tgrelid::regclass::text relation,pg_get_triggerdef(oid) definition from pg_trigger where not tgisinternal and tgrelid in ('public.rider'::regclass,'public.user'::regclass,'auth.users'::regclass)`;
 const staff=await tx`select user_id,role from public.admin_users where user_id=${account.id}`;
 const authIdentities=await tx`select provider,created_at,updated_at,identity_data->>'server_assigned_role' legacy_role from auth.identities where user_id=${account.id}`;
 const legacyActivity=await tx`select last_login,last_active_at from public."user" where id=${account.id}`;
 const balance=await tx`select to_jsonb(b) record from public.rider_reward_balance b where rider_id=${account.rider_id}`;
 const columns=await tx`select table_schema,table_name,column_name,data_type from information_schema.columns where (table_schema='auth' and table_name='sessions') or (table_schema='public' and (table_name ilike '%wallet%' or table_name='rider_reward_balance'))`;
 const privileges=await tx`select current_user,has_table_privilege(current_user,'auth.sessions','TRIGGER') auth_session_trigger,has_table_privilege(current_user,'auth.users','UPDATE') auth_update,(select tableowner from pg_tables where schemaname='auth' and tablename='sessions') auth_session_owner`;
 const gates={deletion:(await tx`select requests_enabled,managed_resources_execution_enabled from public.account_deletion_contract_gate where singleton`)[0],shop:(await tx`select redemption_enabled from public.shop_release_control where singleton`)[0]};
 const activityPolicies=await tx`select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='user_activity'`;
 const nonFkRiderReferences=[];
 for(const col of await tx`select c.table_schema,c.table_name,c.column_name from information_schema.columns c where c.table_schema='public' and c.udt_name='uuid' and c.column_name ilike '%rider_id' and not exists(select 1 from pg_constraint fk join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=any(fk.conkey) where fk.contype='f' and fk.conrelid=(quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass and a.attname=c.column_name)`){
  const n=(await tx.unsafe(`select count(*)::int n from ${quote(col.table_schema)}.${quote(col.table_name)} where ${quote(col.column_name)}=$1`,[account.rider_id]))[0].n;
  const relation=(await tx`select relkind,case when relkind in ('v','m') then pg_get_viewdef(oid) end definition from pg_class where oid=${col.table_schema+'.'+col.table_name}::regclass`)[0];
  nonFkRiderReferences.push({...col,count:n,...relation});
 }
 return{recordedAt:new Date().toISOString(),account,authIdentities,legacyActivity,dependencies,nonFkRiderReferences,functions,activity,activityPolicies,sessions,provisioning,memberships,triggers,staff,balance,columns,privileges,gates};
 });const out=path.join(repo,'.tmp/rider-identity-20261021');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'inspection.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,functions:result.functions.map(f=>f.signature),triggers:result.triggers},null,2));}finally{await db.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
