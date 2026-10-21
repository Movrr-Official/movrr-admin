import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const handler=vi.hoisted(()=>({client:null as any,actor:""}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/admin",()=>({requireCapability:async()=>({authUser:{id:handler.actor}})}));
vi.mock("@/lib/supabase-admin",()=>({createSupabaseAdminClient:()=>handler.client}));
vi.mock("@/lib/activitySignals",()=>({fetchLatestUserActivitySignalMap:async()=>new Map(),resolveLatestIsoTimestamp:()=>undefined}));
vi.mock("@/lib/env",()=>({APP_URL:"https://example.test",FROM_EMAIL:"test@example.test",RESEND_API_KEY:"test-only"}));
vi.mock("@/lib/platformSettings",()=>({}));
import { getUsers } from "@/app/actions/users";

// Only the existing localhost test server. Never reads .env or production URLs.
describe.skipIf(process.env.MOVRR_EMPLOYEE_POSTGRES !== "1")("Users sync read: actual PostgreSQL ACL and contract", () => {
  const opts={host:"127.0.0.1",port:55442,username:"postgres",password:"isolated-local-test-only",max:1,onnotice:()=>{}};
  const root=postgres({...opts,database:"postgres"}), name=`users_dashboard_${process.pid}`,db=postgres({...opts,database:name});
  const reader=randomUUID(), outsider=randomUUID(), inactive=randomUUID(), denied=randomUUID(), pending=randomUUID(), applied=randomUUID();
  const http=process.env.MOVRR_USERS_HTTP==="1",container=`movrr-users-p1-rest-${randomUUID()}`;
  let created=false,started=false;
  beforeAll(async () => {
    await root.unsafe(`CREATE DATABASE "${name}"`); created=true;
    await db.unsafe(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,last_sign_in_at timestamptz);
    CREATE TABLE auth.sessions(user_id uuid,refreshed_at timestamp without time zone);
    CREATE TABLE public.admin_dashboard_sessions(auth_user_id uuid,last_seen_at timestamptz);
    CREATE TABLE public.user_activity(user_id uuid,actor_user_id uuid,source text,action text,description text,occurred_at timestamptz);
    CREATE TABLE public."user"(id uuid PRIMARY KEY,status text,name text,email text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY,role text);
    CREATE TABLE public.rider(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public."user"(id),status text);
    CREATE TABLE public.organisation(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,type text);
    CREATE TABLE public.organisation_membership(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public."user"(id),organisation_id uuid REFERENCES public.organisation(id),role text,status text,updated_at timestamptz DEFAULT now());
    CREATE TABLE public.account_auth_sync(user_id uuid PRIMARY KEY,actor_id uuid,status text,version bigint,state text,updated_at timestamptz DEFAULT now());
    ALTER TABLE public.account_auth_sync ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.account_auth_sync FROM PUBLIC,anon,authenticated,service_role;`);
    const authority=readFileSync("scripts/070_employee_rbac_authority.sql","utf8").match(/CREATE OR REPLACE FUNCTION public.ops_employee_capabilities\(p_role text\)[\s\S]*?\$cap\$;/)![0];
    const active=readFileSync("scripts/071_external_account_domains.sql","utf8").match(/CREATE OR REPLACE FUNCTION public.account_identity_active\(p_user uuid\)[\s\S]*?\$\$;/)![0];
    await db.unsafe(authority); await db.unsafe(active);
    await db.unsafe(readFileSync("scripts/079_users_dashboard_sync_read.sql","utf8"));
    await db.unsafe(readFileSync("scripts/080_authenticated_account_activity.sql","utf8"));
    for(const id of [reader,outsider,inactive,denied,pending,applied]) {
      await db`INSERT INTO auth.users(id) VALUES(${id})`;
      await db`INSERT INTO public."user"(id,status,name,email) VALUES(${id},${id===inactive?"suspended":"active"},${id},${id+'@example.test'})`;
    }
    for(const [id,role] of [[reader,"support_agent"],[inactive,"super_admin"],[denied,"executive_viewer"]]) await db`INSERT INTO public.admin_users VALUES(${id},${role})`;
    await db`INSERT INTO public.account_auth_sync(user_id,actor_id,status,version,state) VALUES(${pending},${reader},'suspended',7,'pending'),(${applied},${reader},'active',8,'applied')`;
    if(http) {
      await db.unsafe('GRANT USAGE ON SCHEMA public,auth TO service_role; GRANT SELECT ON public."user",public.admin_users,public.rider,public.organisation,public.organisation_membership TO service_role');
      const secret="local-users-dashboard-only-test-secret",encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString("base64url");
      const body=`${encode({alg:"HS256",typ:"JWT"})}.${encode({role:"service_role",exp:Math.floor(Date.now()/1000)+3600})}`;
      const token=`${body}.${createHmac("sha256",secret).update(body).digest("base64url")}`;
      execFileSync("docker",["run","--detach","--name",container,"--label","movrr.task=users-dashboard-p1-20261021","--publish","127.0.0.1:55445:3000","--env",`PGRST_DB_URI=postgres://postgres:isolated-local-test-only@host.docker.internal:55442/${name}`,"--env","PGRST_DB_SCHEMAS=public","--env","PGRST_DB_ANON_ROLE=anon","--env",`PGRST_JWT_SECRET=${secret}`,"--env","PGRST_DB_MAX_ROWS=37","public.ecr.aws/supabase/postgrest:v16.4"],{windowsHide:true,stdio:"pipe"});started=true;
      let healthy=false;
      for(let i=0;i<40;i++){healthy=await fetch("http://127.0.0.1:55445/",{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(500)}).then(r=>r.ok).catch(()=>false);if(healthy)break;await new Promise(r=>setTimeout(r,100));}
      expect(healthy).toBe(true);
      handler.actor=reader;
      handler.client=createClient("http://127.0.0.1:55445",token,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(String(input).replace("/rest/v1/","/"),init)}});
    }
  });
  afterAll(async()=>{if(started)execFileSync("docker",["rm","--force",container],{windowsHide:true,stdio:"pipe"});await db.end();if(created)await root.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end();});
  const read=(actor:string,users:string[],role="service_role")=>db.begin("read only",async tx=>{
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    await tx`SELECT set_config('request.jwt.claim.role',${role},true)`;
    return (await tx`SELECT public.read_user_auth_sync_pending(${actor},${users}::uuid[]) ids`)[0].ids;
  });
  it("returns only requested pending IDs in a read-only transaction",async()=>{
    expect(await read(reader,[pending,applied])).toEqual([{user_id:pending}]);
    expect(await read(reader,[applied])).toEqual([]); expect(await read(reader,[])).toEqual([]);
  });
  it.each(["anon","authenticated"])("denies direct %s function execution",async role=>{
    await expect(read(reader,[pending],role)).rejects.toMatchObject({code:"42501"});
  });
  it.each(["outside tenant","suspended Staff","employee without users.read"])("denies %s even through service role",async kind=>{
    const actor=kind==="outside tenant"?outsider:kind==="suspended Staff"?inactive:denied;
    await expect(read(actor,[pending])).rejects.toMatchObject({code:"42501"});
  });
  it("bounds requested IDs and preserves private table denial",async()=>{
    await expect(read(reader,Array(501).fill(pending))).rejects.toMatchObject({code:"22023"});
    await expect(db.begin("read only",async tx=>{await tx.unsafe("SET LOCAL ROLE service_role");return tx`SELECT * FROM public.account_auth_sync`;})).rejects.toMatchObject({code:"42501"});
    expect((await db`SELECT state,version FROM public.account_auth_sync WHERE user_id=${pending}`)[0]).toEqual({state:"pending",version:"7"});
  });
  it.skipIf(!http)("runs the actual Users handler through real PostgREST with a 37-row cap",async()=>{
    const ids=Array.from({length:1207},()=>randomUUID());
    await db`INSERT INTO auth.users ${db(ids.map(id=>({id})))}`;
    await db`INSERT INTO public."user" ${db(ids.map((id,i)=>({id,status:i===0?"pending":"active",name:i===1?'literal,a%_"\\':'HTTP '+i,email:id+'@example.test'})))}`;
    await db`INSERT INTO public.rider ${db(ids.slice(0,1001).map(user_id=>({user_id,status:"active"})))}`;
    await db`INSERT INTO public.account_auth_sync ${db(ids.slice(0,200).map(user_id=>({user_id,actor_id:reader,status:"active",version:1,state:"pending"})))}`;
    const org=(await db`INSERT INTO public.organisation(name,type) VALUES('Local partner','reward_partner') RETURNING id`)[0].id;
    await db`INSERT INTO public.organisation_membership ${db(ids.slice(1,1002).map(user_id=>({user_id,organisation_id:org,role:"viewer",status:"active"})))}`;
    await db`UPDATE auth.users SET last_sign_in_at='2026-01-01T12:00:00Z' WHERE id=${ids[1206]}`;
    const result=await getUsers();expect(result.success).toBe(true);expect(result.data).toHaveLength(1213);
    expect(result.data?.filter(u=>u.riderStatus!==undefined)).toHaveLength(1001);
    expect(result.data?.filter(u=>u.memberships?.length)).toHaveLength(1001);
    expect(result.data?.find(u=>u.id===ids[1206])?.domains).toEqual([]);
    expect(result.data?.find(u=>u.id===pending)?.authSyncPending).toBe(true);
    expect(result.data?.filter(u=>u.authSyncPending)).toHaveLength(201);
    expect(result.warnings).toEqual([]);
    expect(result.data?.every(u=>u.activityAvailable)).toBe(true);
    expect(result.data?.find(u=>u.id===ids[1206])?.lastActive).toBe('2026-01-01T12:00:00.000Z');
    expect(result.data?.find(u=>u.id===ids[1205])?.lastActive).toBeUndefined();
    expect((await getUsers({searchQuery:'literal,a%_"\\'})).data?.map(u=>u.id)).toEqual([ids[1]]);
    expect((await getUsers({role:"rider",status:"pending"})).data?.map(u=>u.id)).toEqual([ids[0]]);
    expect((await getUsers({role:"partner"})).data).toHaveLength(1001);
  },30_000);
});
