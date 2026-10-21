import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { provisionEmployee } from "@/features/identity/application/employeeProvisioning";
import { provisionProduct } from "@/features/identity/application/productProvisioning";
import { CANONICAL_EMPLOYEE_ROLES, capabilitiesForEmployeeRole } from "@/features/organisations/domain/employeeRoleTemplates";

// Opt-in, localhost only, no .env loading and no production connection override.
const integration = process.env.MOVRR_EMPLOYEE_POSTGRES === "1";
describe.skipIf(!integration)("employee provisioning: actual service + isolated PostgreSQL contracts", () => {
  const opts = { host: "127.0.0.1", port: 55442, username: "postgres", password: "isolated-local-test-only", max: 16, onnotice: () => {} };
  const root = postgres({ ...opts, database: "postgres" });
  const database = `employee_test_${process.pid}`;
  const db = postgres({ ...opts, database });
  const actor = randomUUID(), restrictedActor = randomUUID(), incidentId = randomUUID(), legacyId = randomUUID();
  const input = (extra = {}) => ({ email: `${randomUUID()}@example.test`, name: "Test Employee", role: "partner_operations_manager" as const, status: "active" as const, isVerified: false, languagePreference: "en", sendWelcomeEmail: false, ...extra });
  let failPersist = false, loseAuthResponse = false, losePersistResponse = false, failActivation = false;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    try {
      const value = await db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.role','service_role',true)`;
        if (name === "provision_employee") {
          if (args.p_phase === "persist" && failPersist) await tx`select set_config('test.fail_member','on',true)`;
          return (await tx`select public.provision_employee(${String(args.p_actor)}::uuid,${tx.json(args.p_input as never)}::jsonb,${String(args.p_phase)}) result`)[0].result;
        }
        if (name === "provision_product") {
          if (args.p_phase === "persist" && failPersist) await tx`select set_config('test.fail_product','on',true)`;
          return (await tx`select public.provision_product(${String(args.p_actor)}::uuid,${String(args.p_id)}::uuid,${tx.json(args.p_input as never)}::jsonb,${String(args.p_fingerprint)},${String(args.p_phase)}) result`)[0].result;
        }
        return (await tx`select public.assign_employee_role(${String(args.p_actor)}::uuid,${String(args.p_user)}::uuid,${args.p_role === null ? null : String(args.p_role)}) result`)[0].result;
      });
      if (args.p_phase === "persist" && losePersistResponse) { losePersistResponse = false; throw new Error("Lost persistence response"); }
      return { data: value, error: null };
    } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
  };
  const getUserById = async (id: string) => {
    const rows = await db`select id,email,raw_app_meta_data app_metadata from auth.users where id=${id}`;
    return rows[0] ? { data: { user: rows[0] }, error: null } : { data: { user: null }, error: { status: 404, message: "Not found" } };
  };
  const createUser = vi.fn(async (args: Record<string, unknown>) => {
    try {
      await db`insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,banned_until) values(${String(args.id)},${String(args.email)},${db.json(args.app_metadata as never)},${db.json(args.user_metadata as never)},now()+interval '100 years')`;
      if (loseAuthResponse) { loseAuthResponse = false; throw new Error("Lost Auth response"); }
      return getUserById(String(args.id));
    } catch (e) { return { data: { user: null }, error: { message: (e as Error).message } }; }
  });
  const client = { rpc, auth: { admin: { getUserById, createUser,
    updateUserById: async (id: string, args: { ban_duration?: string; app_metadata?: Record<string, unknown> }) => {
      if (failActivation) return { error: { message: "Injected Auth activation failure" } };
      if (args.ban_duration === "none") await db`update auth.users set banned_until=null where id=${id}`;
      if (args.app_metadata) await db`update auth.users set raw_app_meta_data=raw_app_meta_data || ${db.json(args.app_metadata as never)} where id=${id}`;
      return { error: null };
    },
  } } } as unknown as SupabaseClient;
  const state = async (email: string) => (await db`
    select p.user_id,p.state,a.banned_until,u.role,u.status,ad.role employee_role,
      (select count(*)::int from public.rider where user_id=p.user_id) riders,
      (select count(*)::int from public.organisation_membership where user_id=p.user_id) memberships
    from public.employee_provisioning p left join auth.users a on a.id=p.user_id
    left join public."user" u on u.id=p.user_id left join public.admin_users ad on ad.user_id=p.user_id
    where p.email=${email}`)[0];
  beforeAll(async () => {
    await root.unsafe(`CREATE DATABASE "${database}"`);
    await db.unsafe(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE NOT NULL,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',banned_until timestamptz,deleted_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TYPE public.user_role AS ENUM('super_admin','admin','moderator','support','advertiser','rider','gov');
    CREATE TYPE public.user_status AS ENUM('active','suspended','pending','deleted');
    CREATE TYPE public.rider_status AS ENUM('active','inactive','suspended');
    CREATE TABLE public."user"(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,email text UNIQUE,name text,phone text,organization text,avatar_url text,role public.user_role DEFAULT 'rider',status public.user_status DEFAULT 'active',created_at timestamptz,updated_at timestamptz,language_preference text,is_verified boolean,email_verified boolean,verification_level text,account_notes text);
    CREATE TABLE public.rider(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES public."user"(id),created_at timestamptz,phone text,city text,country text,status public.rider_status DEFAULT 'active');
    CREATE TABLE public.advertiser(id uuid DEFAULT gen_random_uuid(),user_id uuid UNIQUE,company_name text,language text,timezone text,created_at timestamptz,company_email text,website text,logo_url text,industry text,budget numeric,email_notifications boolean,campaign_updates boolean);
    CREATE TABLE public.waitlist(id uuid PRIMARY KEY,email text,name text,city text,country_code text,status text DEFAULT 'pending',status_reason text,converted_to_user boolean DEFAULT false,updated_at timestamptz);
    CREATE TABLE public.admin_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES auth.users(id),email text,role text,created_by uuid REFERENCES auth.users(id),updated_at timestamptz);
    CREATE TABLE public.organisation_membership(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id));`);
    await db.unsafe(`CREATE TABLE public.platform_audit_record(actor_user_id uuid,principal_type text,capability text,target_entity_type text,target_entity_id text,previous_state jsonb,resulting_state jsonb,correlation_id text,reason text,created_at timestamptz DEFAULT now());`);
    await db.unsafe(readFileSync("scripts/fixtures/employee-provisioning/handle_new_user.sql", "utf8"));
    await db.unsafe(`CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`);
    await db.unsafe(readFileSync("scripts/056_alignment_capabilities.sql", "utf8"));
    await db`insert into auth.users(id,email,raw_user_meta_data) values(${actor},'actor@example.test','{"server_assigned_role":"admin"}')`;
    await db`insert into public.admin_users(user_id,email,role) values(${actor},'actor@example.test','super_admin')`;
    await db`insert into auth.users(id,email,raw_user_meta_data) values(${incidentId},'original-defect@example.test','{"server_assigned_role":"partner_operations_manager"}')`;
    await db`insert into auth.users(id,email,raw_user_meta_data) values(${restrictedActor},'ops@example.test','{"server_assigned_role":"admin"}')`;
    await db`insert into public.admin_users(user_id,role) values(${restrictedActor},'operations_manager')`;
    await db`insert into auth.users(id,email) values(${legacyId},'preserved-rider-employee@example.test')`;
    await db`insert into public.admin_users(user_id,email,role) values(${legacyId},'preserved-rider-employee@example.test','admin')`;
    await db.unsafe(`CREATE TABLE staff_reference(id uuid PRIMARY KEY,staff_id uuid REFERENCES admin_users(id));
      CREATE TABLE reward_transactions(id uuid PRIMARY KEY,rider_id uuid REFERENCES rider(id),points_earned integer);
      CREATE TABLE ride_history(id uuid PRIMARY KEY,rider_id uuid REFERENCES rider(id));
      CREATE TABLE scheduled_exports(id uuid PRIMARY KEY); ALTER TABLE scheduled_exports ENABLE ROW LEVEL SECURITY;
      CREATE POLICY employee_exports ON scheduled_exports FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM admin_users au WHERE au.user_id=auth.uid()));
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON scheduled_exports TO authenticated;`);
    await db`insert into staff_reference select ${randomUUID()},id from admin_users where user_id=${legacyId}`;
    await db`insert into reward_transactions select ${randomUUID()},id,123 from rider where user_id=${legacyId}`;
    await db`insert into ride_history select ${randomUUID()},id from rider where user_id=${legacyId}`;
    await db`insert into organisation_membership values(${randomUUID()},${legacyId})`;
    await db`insert into scheduled_exports values(${randomUUID()})`;
    const migration = await db.reserve();
    try { await migration.unsafe(readFileSync("scripts/068_employee_provisioning.sql", "utf8")); }
    finally { await migration.release(); }
    const invitationSchema = readFileSync("scripts/050_platform_invitations.sql", "utf8");
    await db.unsafe(invitationSchema.slice(0, invitationSchema.indexOf("CREATE INDEX")));
    const notificationSchema=readFileSync("scripts/057_alignment_operations.sql","utf8");
    await db.unsafe(notificationSchema.slice(notificationSchema.indexOf("CREATE TABLE public.ops_notification_send"),notificationSchema.indexOf("CREATE FUNCTION public.ops_notification_status")));
    await db.begin(async tx => {
      await tx`select set_config('movrr.migration_actor',${actor},true)`;
      await tx.unsafe(readFileSync("scripts/070_employee_rbac_authority.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, ""));
    });
    await db.unsafe(`CREATE FUNCTION fail_employee_membership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.fail_member',true)='on' THEN RAISE EXCEPTION 'Injected employee grant persistence failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_employee_membership BEFORE INSERT ON public.admin_users FOR EACH ROW EXECUTE FUNCTION fail_employee_membership();`);
    await db.unsafe(`CREATE FUNCTION fail_product_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.fail_product',true)='on' THEN RAISE EXCEPTION 'Injected product persistence failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_product_profile BEFORE UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION fail_product_profile();`);
  }, 30000);
  afterAll(async () => {
    await db.end({ timeout: 5 });
    await root.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end({ timeout: 5 });
  });

  it("reproduces the production enum error and Rider fallback with the unchanged trigger", async () => {
    const id = incidentId;
    expect((await db`select role,status from public."user" where id=${id}`)[0]).toMatchObject({ role: "rider", status: "active" });
    expect((await db`select user_id from rider where user_id=${id}`)).toHaveLength(1);
    await expect(db`update public."user" set role='partner_operations_manager' where id=${id}`).rejects.toThrow('invalid input value for enum user_role: "partner_operations_manager"');
    await expect(db`delete from auth.users where id=${id}`).rejects.toThrow(/foreign key constraint/);
    expect(await db`select id from auth.users where id=${id}`).toHaveLength(1);
  });
  it("provisions the exact Partner Operations employee template without a Rider or tenant grant", async () => {
    const p = input(); const result = await provisionEmployee(client, actor, p);
    expect(await state(p.email)).toMatchObject({ user_id: result.id, state: "complete", banned_until: null, role: "admin", status: "active", employee_role: p.role, riders: 0, memberships: 0 });
    expect(capabilitiesForEmployeeRole(p.role)).toContain("partners.approve");
    expect(capabilitiesForEmployeeRole(p.role)).not.toContain("users.role.assign");
  });
  it("canonicalizes historical employee membership once without touching Rider identity, references or financial evidence", async () => {
    expect((await db`select role from admin_users where user_id=${legacyId}`)[0].role).toBe("operations_manager");
    expect((await db`select role from public."user" where id=${legacyId}`)[0].role).toBe("rider");
    expect((await db`select points_earned from reward_transactions`)[0].points_earned).toBe(123);
    expect(await db`select id from ride_history`).toHaveLength(1);
    expect(await db`select id from organisation_membership where user_id=${legacyId}`).toHaveLength(1);
    expect(await db`select id from staff_reference`).toHaveLength(1);
    expect(await db`select reason from platform_audit_record where reason='070_employee_role_canonicalization'`).toHaveLength(1);
  });
  it("revokes and restores only employee access, preserving the same staff ID and all owned records", async () => {
    const staffId=(await db`select id from admin_users where user_id=${legacyId}`)[0].id;
    const exportsForRider=()=>db.begin(async tx=>{
      await tx`select set_config('request.jwt.claim.sub',${legacyId},true)`;
      await tx.unsafe('SET LOCAL ROLE authenticated');
      return tx`select id from scheduled_exports`;
    });
    expect(await exportsForRider()).toHaveLength(1);
    const revoke=()=>rpc("assign_employee_role",{p_actor:actor,p_user:legacyId,p_role:null});
    expect((await revoke()).error).toBeNull(); expect((await revoke()).error).toBeNull();
    expect((await db`select id,role from admin_users where user_id=${legacyId}`)[0]).toMatchObject({id:staffId,role:null});
    expect(await exportsForRider()).toHaveLength(0);
    expect((await rpc("assign_employee_role",{p_actor:actor,p_user:legacyId,p_role:"partner_operations_manager"})).error).toBeNull();
    expect((await db`select id from admin_users where user_id=${legacyId}`)[0].id).toBe(staffId);
    expect((await db`select role from public."user" where id=${legacyId}`)[0].role).toBe("rider");
    expect(await exportsForRider()).toHaveLength(1);
    expect(await db`select id from staff_reference`).toHaveLength(1);
    expect(await db`select id from organisation_membership where user_id=${legacyId}`).toHaveLength(1);
    expect((await db`select sum(points_earned)::int points from reward_transactions`)[0].points).toBe(123);
    expect(await db`select id from ride_history`).toHaveLength(1);
  });
  it("serializes duplicate assignments into one grant and one role audit", async () => {
    const before=(await db`select count(*)::int n from platform_audit_record where target_entity_id=${incidentId} and reason='employee_membership.change'`)[0].n;
    const results=await Promise.all(Array.from({length:8},()=>rpc("assign_employee_role",{p_actor:actor,p_user:incidentId,p_role:"partner_operations_manager"})));
    expect(results.every(r=>r.error===null)).toBe(true);
    expect((await db`select count(*)::int n from admin_users where user_id=${incidentId}`)[0].n).toBe(1);
    expect((await db`select count(*)::int n from platform_audit_record where target_entity_id=${incidentId} and reason='employee_membership.change'`)[0].n).toBe(before+1);
    expect((await db`select role from public."user" where id=${incidentId}`)[0].role).toBe("rider");
  });
  it("denies obsolete roles, account conversion, privileged demotion and status-restricted assignment", async () => {
    for(const role of ["admin","moderator","support","government","compliance_officer","rider","advertiser","owner","manager"]){
      expect((await rpc("assign_employee_role",{p_actor:actor,p_user:legacyId,p_role:role})).error?.message).toContain("Canonical employee role");
    }
    await expect(db`update admin_users set role='admin' where user_id=${legacyId}`).rejects.toThrow(/check constraint/);
    expect((await rpc("assign_employee_role",{p_actor:restrictedActor,p_user:actor,p_role:"support_agent"})).error?.message).toContain("Unauthorized");
    await db`update auth.users set banned_until=now()+interval '1 day' where id=${restrictedActor}`;
    try {expect((await rpc("assign_employee_role",{p_actor:restrictedActor,p_user:legacyId,p_role:"support_agent"})).error?.message).toContain("Unauthorized");}
    finally {await db`update auth.users set banned_until=null where id=${restrictedActor}`;}
    await db`update public."user" set status='suspended' where id=${legacyId}`;
    try {expect((await rpc("assign_employee_role",{p_actor:actor,p_user:legacyId,p_role:"support_agent"})).error?.message).toContain("Active account");}
    finally {await db`update public."user" set status='active' where id=${legacyId}`;}
    expect((await db`select to_regprocedure('public.update_admin_user_profile(uuid,uuid,text,jsonb)') old`)[0].old).toBeNull();
    expect((await db`select to_regprocedure('public.get_user_role()') old`)[0].old).toBeNull();
    expect((await db`select to_regprocedure('public.mark_employee_profile_pending()') old`)[0].old).toBeNull();
  });
  it("rechecks actor authorization after a concurrent revocation commits", async () => {
    const operator=await provisionEmployee(client,actor,input({role:"operations_manager"}));
    let pending:ReturnType<typeof rpc>;
    await db.begin(async tx=>{
      await tx`select set_config('request.jwt.claim.role','service_role',true)`;
      await tx`select assign_employee_role(${actor},${operator.id},null)`;
      pending=rpc("assign_employee_role",{p_actor:operator.id,p_user:legacyId,p_role:"support_agent"});
    });
    expect((await pending!).error?.message).toContain("Unauthorized");
    expect((await db`select role from admin_users where user_id=${legacyId}`)[0].role).toBe("partner_operations_manager");
  });
  it("preserves the last active super administrator and rolls back a failed combined profile grant", async () => {
    expect((await rpc("assign_employee_role",{p_actor:actor,p_user:actor,p_role:null})).error?.message).toContain("last active super");
    const before=(await db`select name from public."user" where id=${legacyId}`)[0].name;
    expect((await rpc("update_admin_user_profile",{p_actor:restrictedActor,p_user:legacyId,p_patch:{name:"Must not persist",employee_role:"super_admin"}})).error).not.toBeNull();
    expect((await db`select name from public."user" where id=${legacyId}`)[0].name).toBe(before);
    expect((await db`select role from admin_users where user_id=${legacyId}`)[0].role).toBe("partner_operations_manager");
  });
  it("rejects invalid and organisation-domain roles before reservations or Auth side effects", async () => {
    for (const extra of [{ role: "unknown" }, { role: "owner" }, { organisationId: randomUUID() }, { membershipRole: "manager" }]) {
      const before = createUser.mock.calls.length;
      const p = input(extra);
      await expect(provisionEmployee(client, actor, p as never)).rejects.toThrow();
      expect(await state(p.email)).toBeUndefined(); expect(createUser.mock.calls.length).toBe(before);
    }
  });
  it("keeps Auth banned and profile pending when employee membership persistence fails; retry recovers exact ID", async () => {
    const p = input(); failPersist = true;
    await expect(provisionEmployee(client, actor, p)).rejects.toThrow("Injected employee grant");
    const failed = await state(p.email);
    expect(failed).toMatchObject({ state: "reserved", role: "admin", status: "pending", employee_role: null, riders: 0, memberships: 0 });
    expect(failed.banned_until).not.toBeNull();
    failPersist = false;
    expect((await provisionEmployee(client, actor, p)).id).toBe(failed.user_id);
    expect((await state(p.email)).state).toBe("complete");
  });
  it("reconciles a lost Auth response and a lost DB response using the durable reservation", async () => {
    const a = input(); loseAuthResponse = true;
    await provisionEmployee(client, actor, a);
    expect((await state(a.email)).state).toBe("complete");
    const b = input(); losePersistResponse = true;
    await expect(provisionEmployee(client, actor, b)).rejects.toThrow("Lost persistence response");
    const ready = await state(b.email); expect(ready.state).toBe("ready"); expect(ready.banned_until).not.toBeNull();
    expect((await provisionEmployee(client, actor, b)).id).toBe(ready.user_id);
  });
  it("replays duplicate submissions, serializes concurrency, and rejects conflicting retries", async () => {
    const p = input();
    const results = await Promise.all(Array.from({ length: 8 }, () => provisionEmployee(client, actor, p)));
    expect(new Set(results.map((x) => x.id)).size).toBe(1);
    expect((await provisionEmployee(client, actor, p)).id).toBe(results[0].id);
    await expect(provisionEmployee(client, actor, { ...p, role: "security_admin" })).rejects.toThrow("Conflicting");
    expect((await state(p.email)).employee_role).toBe(p.role);
  });
  it("does not adopt or reclassify an existing Rider for an employee request", async () => {
    const p = input(); const id = randomUUID();
    await db`insert into auth.users(id,email) values(${id},${p.email})`;
    await expect(provisionEmployee(client, actor, p)).rejects.toThrow("Existing account");
    expect((await db`select role from public."user" where id=${id}`)[0].role).toBe("rider");
    expect(await state(p.email)).toBeUndefined();
  });
  it("preserves ordinary Rider signup and its location fields", async () => {
    const id = randomUUID();
    await db`insert into auth.users(id,email,raw_user_meta_data) values(${id},'rider-signup@example.test','{"city":"Amsterdam","country":"NL","full_name":"Rider"}')`;
    expect((await db`select u.role,u.status,r.city,r.country from public."user" u join rider r on r.user_id=u.id where u.id=${id}`)[0]).toEqual({ role: "rider", status: "active", city: "Amsterdam", country: "NL" });
  });
  it.each(CANONICAL_EMPLOYEE_ROLES)("persists valid canonical role %s using its actual template", async (role) => {
    const p = input({ role }); await provisionEmployee(client, actor, p);
    expect(await state(p.email)).toMatchObject({ employee_role: role, riders: 0, memberships: 0 });
  });
  it("denies unauthorized assignment and privileged escalation before side effects", async () => {
    const restricted = restrictedActor;
    const p = input({ role: "security_admin" });
    await expect(provisionEmployee(client, restricted, p)).rejects.toThrow("Unauthorized");
    expect(await state(p.email)).toBeUndefined();
    const unknown = input();
    await expect(provisionEmployee(client, randomUUID(), unknown)).rejects.toThrow("Unauthorized");
    expect(await state(unknown.email)).toBeUndefined();
  });
  it("retains a recoverable banned identity on activation failure", async () => {
    const p = input(); failActivation = true;
    await expect(provisionEmployee(client, actor, p)).rejects.toThrow("activation pending");
    expect((await state(p.email)).banned_until).not.toBeNull();
    failActivation = false; await provisionEmployee(client, actor, p);
    expect((await state(p.email)).state).toBe("complete");
  });
  it("keeps pending/inactive employees banned, with exact roles", async () => {
    for (const status of ["inactive", "pending"] as const) {
      const p = input({ status }); await provisionEmployee(client, actor, p);
      const result = await state(p.email);
      expect(result.status).toBe(status === "inactive" ? "suspended" : "pending");
      expect(result.banned_until).not.toBeNull(); expect(result.riders).toBe(0);
    }
  });
  it("assigns employee membership without converting an underlying Rider", async () => {
    const p = input(); const created = await provisionEmployee(client, actor, p);
    const result = await rpc("assign_employee_role", { p_actor: actor, p_user: created.id, p_role: "support_agent" });
    expect(result.error).toBeNull(); expect((await state(p.email)).employee_role).toBe("support_agent");
    const rider = (await db`select id from public."user" where email='rider-signup@example.test'`)[0].id;
    expect((await rpc("assign_employee_role", { p_actor: actor, p_user: rider, p_role: "partner_operations_manager" })).error).toBeNull();
    expect((await db`select role from public."user" where id=${rider}`)[0].role).toBe("rider");
    expect(await db`select id from rider where user_id=${rider}`).toHaveLength(1);
  });
  it("rolls back the employee role when a combined profile edit fails and preserves it on ordinary edits", async () => {
    const p = input(), created = await provisionEmployee(client, actor, p);
    const edit = (role: string | null, patch: Record<string, unknown>) => db.begin(async tx => {
      await tx`select set_config('request.jwt.claim.role','service_role',true)`;
      await tx`select update_admin_user_profile(${actor}::uuid,${created.id}::uuid,${tx.json((role ? { ...patch, employee_role: role } : patch) as never)})`;
    });
    await expect(edit("support_agent", { email: "actor@example.test" })).rejects.toThrow(/unique constraint/);
    expect((await state(p.email)).employee_role).toBe("partner_operations_manager");
    expect((await db`select count(*)::int n from platform_audit_record where target_entity_id=${created.id} and reason='employee_membership.change'`)[0].n).toBe(1);
    await edit(null, { name: "Updated name" });
    expect((await state(p.email)).employee_role).toBe("partner_operations_manager");
    expect((await db`select name from public."user" where id=${created.id}`)[0].name).toBe("Updated name");
  });
  it("denies a Security Admin's self-escalation even though it holds role approval", async () => {
    const p = input({ role: "security_admin" }), created = await provisionEmployee(client, actor, p);
    const result = await rpc("assign_employee_role", { p_actor: created.id, p_user: created.id, p_role: "super_admin" });
    expect(result.error?.message).toContain("Self-escalation");
    expect((await state(p.email)).employee_role).toBe("security_admin");
  });
  it("creates an ordinary Admin Rider idempotently and never assigns employee access", async () => {
    const p = { ...input(), role: "rider" as const, city: "Amsterdam", country: "NL" };
    const { sendWelcomeEmail: _unused, ...payload } = p;
    const results = await Promise.all(Array.from({ length: 6 }, () => provisionProduct(client, actor, payload)));
    expect(new Set(results.map(x => x.id)).size).toBe(1);
    const rows = await db`select u.role,u.status,r.city,r.country from public."user" u join rider r on r.user_id=u.id where u.id=${results[0].id}`;
    expect(rows[0]).toMatchObject({ role: "rider", status: "active", city: "Amsterdam", country: "NL" });
    expect(await db`select id from admin_users where user_id=${results[0].id}`).toHaveLength(0);
  });
  it("rolls back a failed waitlist conversion and retries the exact pending Rider", async () => {
    const wid = randomUUID(), email = `${randomUUID()}@example.test`;
    await db`insert into waitlist(id,email,name) values(${wid},${email},'Waitlist Rider')`;
    const payload = { email, name: "Waitlist Rider", role: "rider" as const, status: "active" as const, isVerified: true, languagePreference: "en", waitlistId: wid };
    failPersist = true;
    await expect(provisionProduct(client, actor, payload)).rejects.toThrow("Injected product persistence");
    const failed = (await db`select a.id,a.banned_until,u.status,r.status rider_status from auth.users a join public."user" u on u.id=a.id join rider r on r.user_id=a.id where a.email=${email}`)[0];
    expect(failed.status).toBe("pending"); expect(failed.rider_status).toBe("inactive"); expect(failed.banned_until).not.toBeNull();
    expect((await db`select converted_to_user from waitlist where id=${wid}`)[0].converted_to_user).toBe(false);
    failPersist = false;
    expect((await provisionProduct(client, actor, payload)).id).toBe(failed.id);
    expect((await db`select converted_to_user,provisioning_user_id from waitlist where id=${wid}`)[0]).toMatchObject({ converted_to_user: true, provisioning_user_id: failed.id });
  });
  it("commits a full advertiser profile before activation and rejects changed retries", async () => {
    const { sendWelcomeEmail: _unused, ...base } = input();
    const payload = { ...base, role: "advertiser" as const, advertiserProfile: {
      companyName: "Test Advertiser", budget: 500, language: "nl", timezone: "Europe/Amsterdam",
      emailNotifications: true, campaignUpdates: false,
    } };
    failPersist = true;
    await expect(provisionProduct(client, actor, payload)).rejects.toThrow("Injected product persistence");
    const failed = (await db`select a.id,a.banned_until,u.status from auth.users a join public."user" u on u.id=a.id where a.email=${base.email}`)[0];
    expect(failed.status).toBe("pending"); expect(failed.banned_until).not.toBeNull();
    failPersist = false;
    const result = await provisionProduct(client, actor, payload);
    expect(result.id).toBe(failed.id);
    expect((await db`select company_name,budget,campaign_updates from advertiser where user_id=${result.id}`)[0]).toMatchObject({ company_name: "Test Advertiser", budget: "500", campaign_updates: false });
    expect(await db`select id from rider where user_id=${result.id}`).toHaveLength(0);
    await expect(provisionProduct(client, actor, { ...payload, name: "Changed" })).rejects.toThrow("Conflicting");
  });
});
