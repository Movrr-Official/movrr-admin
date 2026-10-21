import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHmac,randomUUID } from 'node:crypto';
import { GoTrueAdminApi,GoTrueClient } from '@supabase/auth-js';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
// Isolated real GoTrue. No production environment files or account credentials.
describe.skipIf(process.env.MOVRR_EMPLOYEE_AUTH_HTTP!=='1')('Last Active: real Auth login, refresh and logout',()=>{
 const name=`activity_auth_${process.pid}`,container=`movrr-activity-auth-${randomUUID()}`;
 const opts={host:'127.0.0.1',port:55442,username:'postgres',password:'isolated-local-test-only',max:1,onnotice:()=>{}};
 const root=postgres({...opts,database:'postgres'}),db=postgres({...opts,database:name});
 const secret='isolated-activity-only-regression-secret',url='http://127.0.0.1:55446';
 const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const body=`${encode({alg:'HS256',typ:'JWT'})}.${encode({role:'service_role',exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}`;
 const token=`${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;
 const admin=new GoTrueAdminApi({url,headers:{Authorization:`Bearer ${token}`}});
 const auth=new GoTrueClient({url,headers:{Authorization:`Bearer ${token}`},persistSession:false,autoRefreshToken:false});
 let created=false,started=false,user:string,reader:string;
 beforeAll(async()=>{
  await root.unsafe(`create database "${name}"`);created=true;
  await db.unsafe('create schema auth');
  execFileSync('docker',['run','--detach','--name',container,'--label','movrr.task=rider-identity-activity','--publish','127.0.0.1:55446:9999',
   '--env','GOTRUE_API_HOST=0.0.0.0','--env','GOTRUE_API_PORT=9999','--env','GOTRUE_DB_DRIVER=postgres',
   '--env',`GOTRUE_DB_DATABASE_URL=postgres://postgres:isolated-local-test-only@host.docker.internal:55442/${name}?search_path=auth`,
   '--env','GOTRUE_SITE_URL=http://localhost:3000','--env',`API_EXTERNAL_URL=${url}`,'--env',`GOTRUE_JWT_SECRET=${secret}`,
   '--env','GOTRUE_JWT_ADMIN_ROLES=service_role','--env','GOTRUE_JWT_AUD=authenticated','--env','GOTRUE_EXTERNAL_EMAIL_ENABLED=true',
   '--env','GOTRUE_MAILER_AUTOCONFIRM=true','public.ecr.aws/supabase/gotrue:v2.197.0'],{windowsHide:true,stdio:'pipe'});started=true;
  let healthy=false;for(let i=0;i<40;i++){healthy=await fetch(`${url}/health`,{signal:AbortSignal.timeout(400)}).then(r=>r.ok).catch(()=>false);if(healthy)break;await new Promise(r=>setTimeout(r,100));}expect(healthy).toBe(true);
  await db.unsafe(`create or replace function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
   create table public."user"(id uuid primary key references auth.users(id) on delete cascade,status text);
   create table public.admin_users(user_id uuid primary key,role text);
   create table public.admin_dashboard_sessions(auth_user_id uuid primary key,last_seen_at timestamptz);
   create table public.user_activity(user_id uuid references public."user"(id) on delete cascade,actor_user_id uuid,source text,action text,description text,occurred_at timestamptz);`);
  await db.unsafe(readFileSync('scripts/070_employee_rbac_authority.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.ops_employee_capabilities\(p_role text\)[\s\S]*?\$cap\$;/)![0]);
  await db.unsafe(readFileSync('scripts/071_external_account_domains.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.account_identity_active\(p_user uuid\)[\s\S]*?\$\$;/)![0]);
  await db.unsafe(readFileSync('scripts/080_authenticated_account_activity.sql','utf8'));
  for(const email of ['reader@activity.example.test','user@activity.example.test']){
   const result=await admin.createUser({email,password:'isolated-activity-test-password',email_confirm:true});expect(result.error).toBeNull();
   const id=result.data.user!.id;await db`insert into public."user" values(${id},'active')`;
   if(email.startsWith('reader')){reader=id;await db`insert into public.admin_users values(${id},'support_agent')`;}else user=id;
  }
 },45000);
 afterAll(async()=>{if(started)execFileSync('docker',['rm','--force',container],{windowsHide:true,stdio:'pipe'});await db.end();if(created)await root.unsafe(`drop database "${name}" with(force)`);await root.end();},15000);
 const read=()=>db.begin('read only',async tx=>{await tx`select set_config('request.jwt.claim.role','service_role',true)`;return(await tx`select * from jsonb_to_recordset(public.read_account_activity(${reader},${[user]}::uuid[])) as t(user_id uuid,last_active_at timestamptz)`)[0].last_active_at as Date|null;});
 it('shows no activity before sign-in, then uses actual Auth sign-in metadata',async()=>{
  expect(await read()).toBeNull();
  const result=await auth.signInWithPassword({email:'user@activity.example.test',password:'isolated-activity-test-password'});expect(result.error).toBeNull();
  const authoritative=(await db`select last_sign_in_at from auth.users where id=${user}`)[0].last_sign_in_at;
  expect((await read())!.getTime()).toBeGreaterThanOrEqual(authoritative.getTime());
 });
 it('advances on an actual token exchange and retains that exact timestamp after actual logout',async()=>{
  const before=(await read())!.getTime();const refreshed=await auth.refreshSession();expect(refreshed.error).toBeNull();
  const active=(await read())!.getTime();expect(active).toBeGreaterThanOrEqual(before);
  expect((await db`select count(*)::int n from auth.sessions where user_id=${user}`)[0].n).toBeGreaterThan(0);
  expect((await auth.signOut()).error).toBeNull();
  expect((await db`select count(*)::int n from auth.sessions where user_id=${user}`)[0].n).toBe(0);
  expect((await read())!.getTime()).toBe(active);
 });
});
