// DDL rollback rehearsal on a minimal exclusively local database. No .env.
const postgres=require('postgres'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const options={host:'127.0.0.1',port:55443,username:'postgres',password:'isolated-local-test-only',max:1,onnotice:()=>{}};
const root=postgres({...options,database:'postgres'}),name='creation_rollback_'+process.pid,db=postgres({...options,database:name});
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');let assertions=0;
const equal=(a,b)=>{assert.deepEqual(a,b);assertions++};
async function install(){await db.unsafe(read('068_employee_provisioning.sql'));await db.unsafe(read('069_admin_creation_transactions.sql'));}
(async()=>{try{
 await root.unsafe('CREATE DATABASE '+name);
 await db.unsafe(`CREATE EXTENSION postgis WITH SCHEMA public;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 CREATE TYPE user_status AS ENUM('active','pending','suspended','deleted');CREATE TABLE public."user"(id uuid,status user_status);
 CREATE TABLE public.waitlist(id uuid);CREATE TABLE public.route(id uuid);CREATE TABLE public.platform_audit_record(reason text);
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role;END IF;END $$;`);
 await db.unsafe(read('050_platform_invitations.sql'));
 await install();
 await db.unsafe(read('manual/creation-workflows/rollback-unused.sql'));
 equal((await db`select to_regclass('public.employee_provisioning')::text name`)[0].name,null);
 equal((await db`select to_regclass('public.admin_creation_operation')::text name`)[0].name,null);
 equal((await db`select count(*)::int n from pg_trigger where tgname in ('guard_employee_auth_insert','zz_mark_employee_profile_pending')`)[0].n,0);
 equal((await db`select pg_get_functiondef('public.accept_workboard_platform_invitation(text,uuid,text)'::regprocedure) definition`)[0].definition.includes('ON CONFLICT (team_id, user_id)'),true);
 await install();
 await db`insert into employee_provisioning(email,actor_id,input) values('held@example.test',${randomUUID()},'{}')`;
 await assert.rejects(db.unsafe(read('manual/creation-workflows/rollback-unused.sql')),/evidence exists/);assertions++;
 await db.unsafe('ROLLBACK');
 equal((await db`select count(*)::int n from employee_provisioning`)[0].n,1);
 equal((await db`select count(*)::int n from pg_trigger where tgname in ('guard_employee_auth_insert','zz_mark_employee_profile_pending')`)[0].n,2);
 equal((await db`select count(*)::int n from auth.users`)[0].n,0);
 console.log(JSON.stringify({status:'passed',assertions,scope:'isolated DDL rollback; unused removal and evidence-preserving refusal',productionExecuted:false}));
}finally{await db.unsafe('ROLLBACK').catch(()=>{});await db.end({timeout:5});await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)').catch(()=>{});await root.end({timeout:5});}})().catch(error=>{console.error(error.stack);process.exitCode=1});
