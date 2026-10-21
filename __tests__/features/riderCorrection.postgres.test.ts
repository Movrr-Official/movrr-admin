import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { authenticateRequest } from '@/features/identity/application/commands/authenticateRequest';
import { withPermissions,assertCapability } from '@/features/organisations/application/commands/authorisationService';
describe.skipIf(process.env.MOVRR_EMPLOYEE_POSTGRES!=='1')('exact Partner Rider correction: actual PostgreSQL',()=>{
 const opts={host:'127.0.0.1',port:55442,username:'postgres',password:'isolated-local-test-only',max:1,onnotice:()=>{}};
 const root=postgres({...opts,database:'postgres'}),name=`rider_correction_${process.pid}`,db=postgres({...opts,database:name});let created=false;
 const uid='007b5ab8-fea0-41f2-9068-055f154d7db0',rid='183c4512-228b-441a-9b4f-e1d97359773a';
 const sql=readFileSync('scripts/manual/rider-identity/correct-powerdon.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
 beforeAll(async()=>{
  await root.unsafe(`create database "${name}"`);created=true;
  await db.unsafe(`create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,last_sign_in_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
   create table public."user"(id uuid primary key,role text,status text);
   create table public.rider(id uuid primary key,user_id uuid,status text);
   create table public.admin_users(user_id uuid,role text);
   create table public.organisation(id uuid primary key,name text,type text);
   create table public.organisation_membership(id uuid,user_id uuid,organisation_id uuid references organisation(id),role text,bundle_key text,status text);
   create table public.rider_reward_balance(rider_id uuid primary key references rider(id) on delete cascade,points_balance int,lifetime_points_earned int,daily_points_earned int,weekly_points_earned int,tier_points_last30 int);
   create table public.reward_transactions(id uuid default gen_random_uuid(),rider_id uuid references rider(id),points int);
   create table public.financial_evidence(id int,description text);
   insert into public.financial_evidence values(1,'Unrelated immutable ledger fixture');
  `);
  await db.unsafe(readFileSync('scripts/071_external_account_domains.sql','utf8').match(/CREATE OR REPLACE FUNCTION public.enforce_user_role_immutable_for_clients\(\) RETURNS trigger[\s\S]*?\$\$;/)![0]);
  await db.unsafe('create trigger enforce_user_role_immutable_for_clients before update on public."user" for each row execute function public.enforce_user_role_immutable_for_clients()');
  await db`insert into auth.users values(${uid},'powerdonnl@gmail.com','{"server_assigned_role":"partner_operations_manager","full_name":"Preserved"}',null,null,null)`;
  await db`insert into public."user" values(${uid},'rider','active')`;
  await db`insert into public.rider values(${rid},${uid},'active')`;
  await db`insert into public.admin_users values(${uid},null)`;
  await db`insert into public.organisation values('17be1d12-9e61-4654-afd0-fad0bf2d0278','Powerdon','reward_partner')`;
  await db`insert into public.organisation_membership values('16773fed-3edd-493b-bce4-fc366beb2cea',${uid},'17be1d12-9e61-4654-afd0-fad0bf2d0278','owner','org.owner','active')`;
  await db`insert into public.rider_reward_balance values(${rid},0,0,0,0,0)`;
 });
 afterAll(async()=>{await db.end();if(created)await root.unsafe(`drop database "${name}" with(force)`);await root.end();});
 it('refuses historical dependencies without deleting or changing a row',async()=>{
  await db`insert into public.reward_transactions(rider_id,points) values(${rid},10)`;
  await expect(db.begin(tx=>tx.unsafe(sql))).rejects.toThrow('Unexpected Rider dependency');
  expect((await db`select count(*)::int n from public.rider`)[0].n).toBe(1);
  expect((await db`select role from public."user" where id=${uid}`)[0].role).toBe('rider');
  await db`delete from public.reward_transactions`;
 });
 it('refuses even a small nonzero financial projection',async()=>{
  await db`update public.rider_reward_balance set points_balance=1`;
  await expect(db.begin(tx=>tx.unsafe(sql))).rejects.toThrow('financial review');
  await db`update public.rider_reward_balance set points_balance=0`;
 });
 it('removes only the empty Rider and obsolete metadata; preserves Partner Owner and history',async()=>{
  const owner=await db`select * from public.organisation_membership`,history=await db`select * from public.financial_evidence`;
  await db.begin(tx=>tx.unsafe(sql));
  expect(await db`select * from public.organisation_membership`).toEqual(owner);
  expect(await db`select * from public.financial_evidence`).toEqual(history);
  expect((await db`select count(*)::int n from public.rider`)[0].n).toBe(0);
  expect((await db`select count(*)::int n from public.rider_reward_balance`)[0].n).toBe(0);
  expect((await db`select role,status from public."user" where id=${uid}`)[0]).toEqual({role:null,status:'active'});
  expect((await db`select raw_user_meta_data from auth.users where id=${uid}`)[0].raw_user_meta_data).toEqual({full_name:'Preserved'});
  await expect(db`update public."user" set role='rider' where id=${uid}`).rejects.toThrow('immutable');
 });
 it('fails closed on replay',async()=>{await expect(db.begin(tx=>tx.unsafe(sql))).rejects.toThrow('Auth identity changed');});
 it('uses actual remaining relationships to preserve Owner grants and deny Rider-only and other-tenant access',async()=>{
  const deps={verifyAccessToken:async()=>({userId:uid,email:'powerdonnl@gmail.com'}),
   findAdminUser:async()=>null,
   findRiderProfile:async(id:string)=>{const row=(await db`select id,user_id from public.rider where user_id=${id}`)[0];return row?{id:row.id,userId:row.user_id}:null;},
   findOrganisationMembership:async(id:string,org?:string)=>{
    const rows=await db`select m.id,m.user_id,m.organisation_id,m.role,o.type from public.organisation_membership m join public.organisation o on o.id=m.organisation_id where user_id=${id} and status='active'`;
    const row=rows.find(r=>!org||r.organisation_id===org);return row?{id:row.id,userId:row.user_id,organisationId:row.organisation_id,role:row.role,organisationType:'reward_partner' as const}:null;
   }};
  const result=await authenticateRequest({accessToken:'verified-local-fixture',preferRider:true},deps);
  expect(result.ok).toBe(true);if(!result.ok)throw Error('Owner authentication failed');
  const ctx=withPermissions(result.value);expect(ctx.principal.type).toBe('organisation');
  expect(assertCapability(ctx,'staff.manage').ok).toBe(true);
  expect(assertCapability(ctx,'wallet.read').ok).toBe(false);
  expect(assertCapability(ctx,'rewards.redeem').ok).toBe(false);
  expect((await authenticateRequest({accessToken:'verified-local-fixture',organisationId:'00000000-0000-0000-0000-000000000001'},deps)).ok).toBe(false);
 });
});
