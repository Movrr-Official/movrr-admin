import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
describe.skipIf(process.env.MOVRR_EMPLOYEE_POSTGRES!=="1")("recorded authenticated activity: actual PostgreSQL",()=>{
 const opts={host:"127.0.0.1",port:55442,username:"postgres",password:"isolated-local-test-only",max:1,onnotice:()=>{}};
 const root=postgres({...opts,database:"postgres"}),name=`account_activity_${process.pid}`,db=postgres({...opts,database:name});
 const reader=randomUUID(),user=randomUUID(),other=randomUUID();let created=false;
 beforeAll(async()=>{
  await root.unsafe(`CREATE DATABASE "${name}"`);created=true;
  await db.unsafe(`CREATE SCHEMA auth;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,last_sign_in_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
   CREATE TABLE public."user"(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,status text);
   CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY,role text);
   CREATE TABLE auth.sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,refreshed_at timestamp without time zone,updated_at timestamptz);
   CREATE TABLE public.admin_dashboard_sessions(auth_user_id uuid PRIMARY KEY,last_seen_at timestamptz);
   CREATE TABLE public.user_activity(user_id uuid REFERENCES public."user"(id) ON DELETE CASCADE,actor_user_id uuid,source text,action text,description text,occurred_at timestamptz);
  `);
  for(const id of [reader,user,other]){await db`insert into auth.users(id) values(${id})`;await db`insert into public."user" values(${id},'active')`;}
  await db`insert into public.admin_users values(${reader},'support_agent')`;
  await db.unsafe(readFileSync('scripts/070_employee_rbac_authority.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.ops_employee_capabilities\(p_role text\)[\s\S]*?\$cap\$;/)![0]);
  await db.unsafe(readFileSync('scripts/071_external_account_domains.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.account_identity_active\(p_user uuid\)[\s\S]*?\$\$;/)![0]);
  await db.unsafe(readFileSync('scripts/080_authenticated_account_activity.sql','utf8'));
 });
 afterAll(async()=>{await db.end();if(created)await root.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end();});
 const read=(actor=reader,role='service_role',ids=[user])=>db.begin('read only',async tx=>{
  await tx`select set_config('request.jwt.claim.role',${role},true)`;
  return tx`select * from jsonb_to_recordset(public.read_account_activity(${actor},${ids}::uuid[])) as t(user_id uuid,last_active_at timestamptz)`;
 });
 it("returns null for never signed in; staff changes about a subject are not that subject's activity",async()=>{
  await db`insert into public.user_activity values(${user},${reader},'account','Account updated','Staff update','2026-01-01T00:00:00Z')`;
  expect((await read())[0].last_active_at).toBeNull();
  expect((await read(reader,'service_role',[reader]))[0].last_active_at.toISOString()).toBe('2026-01-01T00:00:00.000Z');
 });
 it("projects real login, UTC session token refresh, actor activity and ignores arbitrary session updates",async()=>{
  await db`update auth.users set last_sign_in_at='2026-02-01T12:00:00+01:00' where id=${user}`;
  expect((await read())[0].last_active_at.toISOString()).toBe('2026-02-01T11:00:00.000Z');
  await db`insert into auth.sessions(user_id,refreshed_at,updated_at) values(${user},'2026-02-01 12:00:00','2026-09-01T00:00:00Z')`;
  expect((await read())[0].last_active_at.toISOString()).toBe('2026-02-01T12:00:00.000Z');
  await db`insert into public.user_activity values(${user},${user},'route','Route completed','Own activity','2026-02-01T13:00:00Z')`;
  expect((await read())[0].last_active_at.toISOString()).toBe('2026-02-01T13:00:00.000Z');
 });
 it("preserves recorded activity at logout or forced expiry without inventing the removal time",async()=>{
  await db`insert into public.admin_dashboard_sessions values(${user},'2026-02-01T14:00:00Z')`;
  expect((await read())[0].last_active_at.toISOString()).toBe('2026-02-01T14:00:00.000Z');
  await db`delete from public.admin_dashboard_sessions where auth_user_id=${user}`;
  await db`delete from auth.sessions where user_id=${user}`;
  expect((await read())[0].last_active_at.toISOString()).toBe('2026-02-01T14:00:00.000Z');
  expect((await db`select count(*)::int n from public.user_activity where action='Recorded session activity'`)[0].n).toBe(2);
 });
 it("denies clients, external actors, inactive staff and oversized batches",async()=>{
  await expect(read(reader,'authenticated')).rejects.toThrow('Unauthorized');
  await expect(read(other)).rejects.toThrow('Unauthorized');
  await db`update public."user" set status='suspended' where id=${reader}`;
  await expect(read()).rejects.toThrow('Unauthorized');
  await db`update public."user" set status='active' where id=${reader}`;
  await expect(read(reader,'service_role',Array(501).fill(user))).rejects.toThrow('Invalid activity batch');
  expect((await db`select has_function_privilege('authenticated','public.read_account_activity(uuid,uuid[])','execute') allowed`)[0].allowed).toBe(false);
 });
 it("ignores future/system signals and preserves account deletion cascades without new activity",async()=>{
  await db`insert into public.user_activity values(${other},${other},'system','Sync','Background','2026-01-01T00:00:00Z'),(${other},${other},'account','Future','Bad clock','2999-01-01T00:00:00Z')`;
  expect((await read(reader,'service_role',[other]))[0].last_active_at).toBeNull();
  await db`insert into auth.sessions(user_id,refreshed_at) values(${other},'2026-01-01 00:00:00')`;
  await db`delete from auth.users where id=${other}`;
  expect((await db`select count(*)::int n from public.user_activity where user_id=${other}`)[0].n).toBe(0);
 });
});
