import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { provisionEmployee } from "@/features/identity/application/employeeProvisioning";
import { provisionExternalAccount } from "@/features/identity/application/externalAccountProvisioning";
import { synchronizeAccountAuthStatus } from "@/features/identity/application/accountAuthStatus";
import { provisionProduct } from "@/features/identity/application/productProvisioning";
import { CANONICAL_EMPLOYEE_ROLES, capabilitiesForEmployeeRole } from "@/features/organisations/domain/employeeRoleTemplates";
const actionState = vi.hoisted(() => ({ actor: "", client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: async () => ({ authUser: { id: actionState.actor } }), requireAnyCapability: async () => ({ authUser: { id: actionState.actor } }) }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => actionState.client }));
vi.mock("@/lib/env", () => ({ CUSTOMER_APP_URL: "http://localhost:3001" }));
import { changeAccountMembership, getAccountMemberships, getAccountOrganisations, getAccountInvitations, issueAccountInvitation, revokeAccountInvitation } from "@/app/actions/accountMemberships";

// Opt-in, localhost only, no .env loading and no production connection override.
const integration = process.env.MOVRR_EMPLOYEE_POSTGRES === "1";
describe.skipIf(!integration)("external account domains: actual services and PostgreSQL", () => {
  const opts = { host: "127.0.0.1", port: process.env.MOVRR_DETAILS_HTTP === "1" ? 55443 : 55442, username: "postgres", password: "isolated-local-test-only", max: 16, onnotice: () => {} };
  const root = postgres({ ...opts, database: "postgres" });
  const database = `external_domains_${process.pid}`;
  const db = postgres({ ...opts, database });
  const actor = randomUUID(), restrictedActor = randomUUID(), incidentId = randomUUID(), legacyId = randomUUID();
  const input = (extra = {}) => ({ email: `${randomUUID()}@example.test`, name: "Test Employee", role: "partner_operations_manager" as const, status: "active" as const, isVerified: false, languagePreference: "en", sendWelcomeEmail: false, ...extra });
  let failPersist = false, loseAuthResponse = false, losePersistResponse = false, failActivation = false;
  const detailsHttp = process.env.MOVRR_DETAILS_HTTP === "1", restContainer = `movrr-membership-editor-${randomUUID()}`;
  let restStarted = false;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    try {
      const value = await db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.role','service_role',true)`;
        if (name === "account_auth_sync_state") return (await tx`select account_auth_sync_state(${String(args.p_actor)}::uuid,${String(args.p_user)}::uuid,${args.p_version as number | null},${Boolean(args.p_ack)}) result`)[0].result;
        if (name === "update_admin_user_profile") return (await tx`select update_admin_user_profile(${String(args.p_actor)}::uuid,${String(args.p_user)}::uuid,${tx.json(args.p_patch as never)}) result`)[0].result;
        if (name === "provision_external_account") {
          if (args.p_phase === "persist" && failPersist) await tx`select set_config('test.fail_member','on',true)`;
          return (await tx`select public.provision_external_account(${String(args.p_actor)}::uuid,${tx.json(args.p_input as never)}::jsonb,${String(args.p_phase)}) result`)[0].result;
        }
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
      else if (args.ban_duration) await db`update auth.users set banned_until=now()+interval '100 years' where id=${id}`;
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
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') $$;
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
    await db.unsafe(`ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz DEFAULT now(); CREATE TABLE public.organisation(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,type text,status text DEFAULT 'active');
      CREATE TABLE public.permission_bundle(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),key text UNIQUE,name text);
      CREATE TABLE public.bundle_capability(bundle_id uuid,capability text);
      INSERT INTO public.permission_bundle(key) VALUES('org.owner'),('org.manager'),('org.staff'),('org.viewer');
      ALTER TABLE public.organisation_membership ADD COLUMN organisation_id uuid REFERENCES public.organisation(id),ADD COLUMN role text,
        ADD COLUMN status text DEFAULT 'active',ADD COLUMN bundle_key text REFERENCES public.permission_bundle(key),
        ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now(),ADD UNIQUE(organisation_id,user_id);`);
    const externalMigration = await db.reserve();
    expect((await db`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='advertiser' and column_name='organisation_id'`)[0].n).toBe(0);
    try { await externalMigration.unsafe(readFileSync("scripts/071_external_account_domains.sql", "utf8")); }
    catch (error) { const e = error as { position?: string; internal_position?: string; internal_query?: string }; console.error(e.position, e.internal_position, e.internal_query); throw error; }
    finally { externalMigration.release(); }
    const invitationMigration = await db.reserve();
    try { await invitationMigration.unsafe(readFileSync("scripts/072_organisation_invitations.sql", "utf8")); }
    finally { invitationMigration.release(); }
    await db.begin(tx => tx.unsafe(readFileSync("scripts/073_account_status_and_staff_commands.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    await db.unsafe(readFileSync("scripts/fixtures/enterprise-identity/rls-contract.sql", "utf8"));
    await db.unsafe(readFileSync("scripts/fixtures/enterprise-identity/rider-can-access-advertiser.sql", "utf8"));
    const policies = JSON.parse(readFileSync("scripts/fixtures/enterprise-identity/rls-policies.json", "utf8")) as { tablename: string; policyname: string; permissive: string; roles: string[]; cmd: string; qual: string | null; with_check: string | null }[];
    const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
    for (const policy of policies) {
      await db.unsafe(`ALTER TABLE public.${quote(policy.tablename)} ENABLE ROW LEVEL SECURITY`);
      await db.unsafe(`CREATE POLICY ${quote(policy.policyname)} ON public.${quote(policy.tablename)} AS ${policy.permissive} FOR ${policy.cmd} TO ${policy.roles.map(quote).join(",")} ${policy.qual ? `USING (${policy.qual})` : ""} ${policy.with_check ? `WITH CHECK (${policy.with_check})` : ""}`);
    }
    await db.begin(async tx => {
      // pg_policies deparses schema-qualified function names in this context.
      // Exercise the same context used by a full pg_dump schema restoration.
      await tx`select set_config('search_path','',true)`;
      await tx.unsafe(readFileSync("scripts/075_identity_rls_capability_boundaries.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, ""));
    });
    await db.unsafe(`CREATE TABLE public.user_preferences(user_id uuid PRIMARY KEY,notifications boolean);
      CREATE TABLE public.platform_settings(key text,value jsonb);`);
    await db.unsafe(readFileSync("scripts/fixtures/enterprise-identity/notification-functions.sql", "utf8"));
    await db.begin(tx => tx.unsafe(readFileSync("scripts/076_identity_notification_audiences.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    await db.unsafe(`CREATE TABLE public.workboard_team_members(team_id uuid,user_id uuid,role text,status text DEFAULT 'active');
      GRANT SELECT,INSERT,UPDATE ON public.platform_invitations TO service_role;`);
    await db.unsafe(readFileSync("scripts/fixtures/enterprise-identity/resend-functions.sql", "utf8"));
    await db.begin(tx => tx.unsafe(readFileSync("scripts/077_invitation_authority_boundaries.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    await db.begin(tx => tx.unsafe(readFileSync("scripts/078_independent_user_accounts.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    await db.unsafe(`CREATE FUNCTION fail_external_membership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.fail_member',true)='on' THEN RAISE EXCEPTION 'Injected membership persistence failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_external_membership BEFORE INSERT ON public.organisation_membership FOR EACH ROW EXECUTE FUNCTION fail_external_membership();`);
    if (detailsHttp) {
      await db.unsafe('ALTER ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public,auth TO service_role; GRANT SELECT ON public."user",public.rider,public.admin_users,public.organisation,public.organisation_membership,public.platform_invitations TO service_role');
      const secret="local-membership-editor-only-secret", encode=(value: unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
      const payload=`${encode({alg:"HS256",typ:"JWT"})}.${encode({role:"service_role",exp:Math.floor(Date.now()/1000)+3600})}`;
      const token=`${payload}.${createHmac("sha256",secret).update(payload).digest("base64url")}`;
      execFileSync("docker",["run","--detach","--name",restContainer,"--label","movrr.task=user-details-p1-20261021","--publish","127.0.0.1:55446:3000","--env",`PGRST_DB_URI=postgres://postgres:isolated-local-test-only@host.docker.internal:${opts.port}/${database}`,"--env","PGRST_DB_SCHEMAS=public","--env","PGRST_DB_ANON_ROLE=anon","--env",`PGRST_JWT_SECRET=${secret}`,"--env","PGRST_DB_MAX_ROWS=2","public.ecr.aws/supabase/postgrest:v16.4"],{windowsHide:true,stdio:"pipe"});restStarted=true;
      let ready=false,health="";for(let i=0;i<40;i++){ready=await fetch("http://127.0.0.1:55446/organisation?select=id&limit=0",{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(500)}) .then(async r=>{health=String(r.status)+" "+await r.text();return r.ok;}).catch(e=>{health=String(e);return false;});if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}if(!ready) throw new Error("Local membership PostgREST failed: "+health+" "+execFileSync("docker",["logs","--tail","15",restContainer],{windowsHide:true}).toString());
      actionState.client=createClient("http://127.0.0.1:55446",token,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(String(input).replace("/rest/v1/","/"),init)}});actionState.actor=actor;
    }
  }, 30000);
  afterAll(async () => {
    if(restStarted)execFileSync("docker",["rm","--force",restContainer],{windowsHide:true,stdio:"pipe"});
    await db.end({ timeout: 5 });
    await root.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end({ timeout: 5 });
  });

  async function organisation(domain: string) {
    return (await db`insert into organisation(name,type) values('Test organisation',${domain === "partner" ? "reward_partner" : domain}) returning id`)[0].id as string;
  }
  async function change(user: string, org: string, role: string, status: string, expected: string | null = null, actorId: string = actor) {
    return db.begin(async tx => {
      await tx`select set_config('request.jwt.claim.role','service_role',true)`;
      return (await tx`select change_organisation_membership(${actorId}::uuid,${user}::uuid,${org}::uuid,${role},${status},${expected}::text::timestamptz) result`)[0].result;
    });
  }
  const externalInput = (domain: "partner" | "advertiser" | "government", organisationId: string) => ({
    email: `${randomUUID()}@example.test`, name: "External operator", domain, organisationId,
    role: domain === "government" ? "viewer" as const : domain === "partner" ? "partner_operations_manager" as const : "manager" as const, status: "active" as const, isVerified: false, languagePreference: "en",
  });
  it("installs the Advertiser organization dependency from 071, enforcing a real foreign key and one profile per organization", async () => {
    const org = await organisation("advertiser");
    await db`insert into advertiser(organisation_id) values(${org})`;
    await expect(db`insert into advertiser(organisation_id) values(${org})`).rejects.toThrow(/advertiser_organisation_id_key/);
    await expect(db`insert into advertiser(organisation_id) values(${randomUUID()})`).rejects.toThrow(/advertiser_organisation_id_fkey/);
  });
  it.each(["partner", "advertiser", "government"] as const)("%s Create → Save → Reload → Edit → Save → Revoke preserves exact scope", async domain => {
    const org = await organisation(domain), payload = externalInput(domain, org);
    if (domain === "government") await change(actor, org, "owner", "active");
    const account = await provisionExternalAccount(client, actor, payload);
    const rows = await db`select *,updated_at::text as updated_at from organisation_membership where user_id=${account.id}`;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ organisation_id: org, role: payload.role, bundle_key: `org.${payload.role}`, status: "active" });
    expect(await db`select id from rider where user_id=${account.id}`).toHaveLength(0);
    expect(await db`select id from admin_users where user_id=${account.id}`).toHaveLength(0);
    expect((await db`select role,status from public."user" where id=${account.id}`)[0]).toMatchObject({ role: null, status: "active" });
    const changedRole = domain === "government" ? "owner" : "staff";
    const edited = await change(account.id, org, changedRole, "active", rows[0].updated_at);
    expect(edited.role).toBe(changedRole); expect(edited.bundle_key).toBe(`org.${changedRole}`);
    const revoked = await change(account.id, org, changedRole, "revoked", edited.updated_at);
    expect(revoked.status).toBe("revoked");
    await expect(provisionExternalAccount(client, actor, payload)).rejects.toThrow(/changed/);
    expect(await db`select id from auth.users where id=${account.id}`).toHaveLength(1);
    expect(await db`select reason from platform_audit_record where target_entity_id=${rows[0].id}`).toHaveLength(3);
  });
  it("rejects mismatched domains, operational employee roles and unauthorised actors before Auth creation", async () => {
    const org = await organisation("partner"), calls = createUser.mock.calls.length;
    await expect(provisionExternalAccount(client, actor, { ...externalInput("government", org) })).rejects.toThrow(/match/);
    await expect(provisionExternalAccount(client, actor, { ...externalInput("partner", org), role: "security_admin" } as never)).rejects.toThrow();
    await expect(provisionExternalAccount(client, incidentId, externalInput("partner", org))).rejects.toThrow(/Unauthorized/);
    expect(createUser.mock.calls.length).toBe(calls);
  });
  it("recovers a failed membership transaction, leaving Auth banned and no fallback Rider", async () => {
    const org = await organisation("partner"), payload = externalInput("partner", org);
    failPersist = true;
    await expect(provisionExternalAccount(client, actor, payload)).rejects.toThrow(/Injected membership/);
    failPersist = false;
    const receipt = (await db`select * from external_account_provisioning where email=${payload.email}`)[0];
    expect(receipt.state).toBe("reserved");
    expect((await db`select banned_until from auth.users where id=${receipt.user_id}`)[0].banned_until).toBeTruthy();
    expect(await db`select id from organisation_membership where user_id=${receipt.user_id}`).toHaveLength(0);
    expect(await db`select id from rider where user_id=${receipt.user_id}`).toHaveLength(0);
    expect((await provisionExternalAccount(client, actor, payload)).id).toBe(receipt.user_id);
  });
  it("reconciles lost Auth and persistence responses and serialises concurrent provisioning", async () => {
    const org = await organisation("partner"), payload = externalInput("partner", org);
    loseAuthResponse = true;
    const first = await provisionExternalAccount(client, actor, payload);
    const results = await Promise.all(Array.from({ length: 6 }, () => provisionExternalAccount(client, actor, payload)));
    expect(results.every(result => result.id === first.id)).toBe(true);
    expect(await db`select id from organisation_membership where user_id=${first.id}`).toHaveLength(1);
    const other = externalInput("partner", org); losePersistResponse = true;
    await expect(provisionExternalAccount(client, actor, other)).rejects.toThrow(/Lost persistence/);
    await provisionExternalAccount(client, actor, other);
    expect(await db`select m.id from organisation_membership m join auth.users a on a.id=m.user_id where a.email=${other.email}`).toHaveLength(1);
  });
  it("requires explicit multi-membership assignment and rejects stale, cross-tenant and ownership escalation commands", async () => {
    const org = await organisation("partner"), other = await organisation("partner");
    const account = await provisionExternalAccount(client, actor, externalInput("partner", org));
    const first = (await db`select *,updated_at::text as updated_at from organisation_membership where user_id=${account.id}`)[0];
    await change(account.id, other, "viewer", "active");
    expect(await db`select id from organisation_membership where user_id=${account.id}`).toHaveLength(2);
    await expect(change(incidentId, other, "owner", "active", null, account.id)).rejects.toThrow(/Unauthorized/);
    const updated = await change(account.id, org, "staff", "active", first.updated_at);
    await expect(change(account.id, org, "viewer", "active", first.updated_at)).rejects.toThrow(/Stale/);
    await change(account.id, org, "staff", "revoked", updated.updated_at);
    await expect(change(incidentId, org, "staff", "active", null, account.id)).rejects.toThrow(/Unauthorized/);
  });
  async function invitationCommand(kind: "issue" | "accept" | "revoke", user: string, org: string, token: string, expected: string | null = null, actorId: string = actor) {
    return db.begin(async tx => {
      await tx`select set_config('request.jwt.claim.role','service_role',true)`;
      const hash = createHash("sha256").update(token).digest("hex");
      if (kind === "issue") return (await tx`select issue_organisation_invitation(${actorId}::uuid,${user}::uuid,${org}::uuid,'partner_operations_manager',${hash},${expected}::text::timestamptz) result`)[0].result;
      if (kind === "accept") return (await tx`select accept_organisation_invitation(${user}::uuid,${hash}) result`)[0].result;
      return (await tx`select revoke_organisation_invitation(${actorId}::uuid,${token}::uuid) result`)[0].result;
    });
  }
  it("creates, accepts and retries an explicit organisation invitation without creating another identity", async () => {
    const org = await organisation("partner");
    const payload = { ...externalInput("partner", org), membershipStatus: "invited" as const };
    const account = await provisionExternalAccount(client, actor, payload), token = randomUUID();
    const invitation = await invitationCommand("issue", account.id, org, token);
    expect((await invitationCommand("issue", account.id, org, token)).id).toBe(invitation.id);
    expect(invitation.status).toBe("pending"); expect(invitation.token_hash).toBeUndefined();
    await expect(invitationCommand("issue", account.id, org, randomUUID())).rejects.toThrow(/pending invitation/);
    await expect(invitationCommand("accept", incidentId, org, token)).rejects.toThrow(/verified invited/);
    expect((await invitationCommand("accept", account.id, org, token)).status).toBe("active");
    expect((await invitationCommand("accept", account.id, org, token)).status).toBe("active");
    expect((await db`select status from platform_invitations where id=${invitation.id}`)[0].status).toBe("accepted");
    expect(await db`select id from rider where user_id=${account.id}`).toHaveLength(0);
  });
  it("invalidates pending and accepted tokens when access changes and permits a fresh invitation", async () => {
    const org = await organisation("partner"), account = await provisionExternalAccount(client, actor, { ...externalInput("partner", org), membershipStatus: "invited" });
    const token = randomUUID(), invite = await invitationCommand("issue", account.id, org, token);
    const changed = await change(account.id, org, "viewer", "invited", invite.metadata.membershipVersion);
    expect((await db`select status from platform_invitations where id=${invite.id}`)[0].status).toBe("revoked");
    const nextToken = randomUUID();
    await invitationCommand("issue", account.id, org, nextToken, changed.updated_at);
    const accepted = await invitationCommand("accept", account.id, org, nextToken);
    const revoked = await change(account.id, org, "partner_operations_manager", "revoked", accepted.updated_at);
    await change(account.id, org, "partner_operations_manager", "active", revoked.updated_at);
    await expect(invitationCommand("accept", account.id, org, token)).rejects.toThrow(/expired|revoked|superseded/);
    await expect(invitationCommand("accept", account.id, org, nextToken)).rejects.toThrow(/expired|revoked|superseded/);
    await invitationCommand("revoke", account.id, org, invite.id);
    expect((await db`select status from organisation_membership where organisation_id=${org} and user_id=${account.id}`)[0].status).toBe("active");
  });
  it("denies expired, revoked and superseded invitation acceptance, including an issuer who lost authority", async () => {
    for (const mode of ["expired", "revoked", "superseded", "issuer-revoked"]) {
      const org = await organisation("partner"), account = await provisionExternalAccount(client, actor, { ...externalInput("partner", org), membershipStatus: "invited" });
      const token = randomUUID(), invitation = await invitationCommand("issue", account.id, org, token);
      if (mode === "expired") await db`update platform_invitations set expires_at=now()-interval '1 second' where id=${invitation.id}`;
      if (mode === "revoked") await invitationCommand("revoke", account.id, org, invitation.id);
      if (mode === "superseded") await change(account.id, org, "viewer", "invited", invitation.metadata.membershipVersion);
      if (mode === "issuer-revoked") await db`update admin_users set role=null where user_id=${actor}`;
      await expect(invitationCommand("accept", account.id, org, token)).rejects.toThrow(/expired|revoked|superseded|Unauthorized/);
      if (mode === "issuer-revoked") await db`update admin_users set role='super_admin' where user_id=${actor}`;
    }
  });
  it("denies direct table writes and coarse-role authority after account or membership revocation", async () => {
    expect((await db`select has_table_privilege('authenticated','organisation_membership','INSERT,UPDATE,DELETE') allowed`)[0].allowed).toBe(false);
    expect((await db`select has_table_privilege('service_role','organisation_membership','INSERT,UPDATE,DELETE') allowed`)[0].allowed).toBe(false);
    expect((await db`select is_movrr_admin(${incidentId}) allowed`)[0].allowed).toBe(false);
    await db`update public."user" set status='suspended' where id=${restrictedActor}`;
    await expect(change(incidentId, await organisation("partner"), "viewer", "active", null, restrictedActor)).rejects.toThrow(/Unauthorized/);
    await db`update public."user" set status='active' where id=${restrictedActor}`;
  });
  async function asAuthenticated<T>(user: string, command: (tx: postgres.TransactionSql) => Promise<T>, aal = "aal1") {
    return db.begin(async tx => {
      await tx`select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claim.aal',${aal},true)`;
      await tx.unsafe('SET LOCAL ROLE authenticated');
      return command(tx);
    });
  }
  it("enforces actual production RLS policies for tenant revocation and MFA-bound employee capabilities", async () => {
    const org = await organisation("advertiser");
    const account = await provisionExternalAccount(client, actor, externalInput("advertiser", org));
    const ad = (await db`insert into advertiser(user_id,organisation_id) values(${account.id},${org}) returning id`)[0];
    await db`insert into campaign(advertiser_id) values(${ad.id})`;
    const otherOrg = await organisation("advertiser");
    const otherAd = (await db`insert into advertiser(organisation_id) values(${otherOrg}) returning id`)[0];
    await db`insert into campaign(advertiser_id,lifecycle_status) values(${otherAd.id},'open_for_signup')`;
    expect(await asAuthenticated(account.id, tx => tx`select id from campaign`)).toHaveLength(1);
    expect(await asAuthenticated(incidentId, tx => tx`select id from campaign`)).toHaveLength(1);
    await db`update rider set status='suspended' where user_id=${incidentId}`;
    expect(await asAuthenticated(incidentId, tx => tx`select id from campaign`)).toHaveLength(0);
    await db`update rider set status='active' where user_id=${incidentId}`;
    const member = (await db`select *,updated_at::text as updated_at from organisation_membership where user_id=${account.id}`)[0];
    await change(account.id, org, "manager", "revoked", member.updated_at);
    expect(await asAuthenticated(account.id, tx => tx`select id from campaign`)).toHaveLength(0);
    expect(await asAuthenticated(account.id, tx => tx`select id from advertiser where id=${ad.id}`)).toHaveLength(0);
    await db`update admin_users set role='support_agent' where user_id=${restrictedActor}`;
    expect((await asAuthenticated(restrictedActor, tx => tx`select identity_has_capability('users.read') allowed`))[0].allowed).toBe(false);
    expect((await asAuthenticated(restrictedActor, tx => tx`select identity_has_capability('users.read') allowed`, "aal2"))[0].allowed).toBe(true);
    expect((await asAuthenticated(restrictedActor, tx => tx`select identity_has_capability('routes.write') allowed`, "aal2"))[0].allowed).toBe(false);
    await db`update admin_users set role='operations_manager' where user_id=${restrictedActor}`;
    expect((await db`select count(*)::int n from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) ~ '\\mis_admin\\(\\)|\\mis_dashboard_admin\\(\\)'`)[0].n).toBe(0);
  });
  it("preserves explicit Mobile personal routes while denying status, certification and cross-account changes", async () => {
    await expect(asAuthenticated(incidentId, tx => tx`update rider set status='suspended' where user_id=${incidentId}`)).rejects.toThrow(/Rider identity/);
    await expect(asAuthenticated(incidentId, tx => tx`update rider set is_certified=true where user_id=${incidentId}`)).rejects.toThrow(/Rider identity/);
    const personal = await asAuthenticated(incidentId, tx => tx`insert into route(name) values('Personal route') returning *`);
    expect(personal[0].identity_created_by).toBe(incidentId);
    expect(await asAuthenticated(legacyId, tx => tx`update route set name='Other account' where id=${personal[0].id} returning id`)).toHaveLength(0);
    await expect(asAuthenticated(incidentId, tx => tx`insert into route(name,supported_earning_modes) values('Escalated',ARRAY['campaign'])`)).rejects.toThrow(/earning authority/);
    await db`update public."user" set status='suspended' where id=${incidentId}`;
    expect(await asAuthenticated(incidentId, tx => tx`select id from rider`)).toHaveLength(0);
    await db`update public."user" set status='active' where id=${incidentId}`;
  });
  it("persists suspension, survives an Auth outage and retries synchronization without restoring revoked memberships", async () => {
    const org = await organisation("partner"), account = await provisionExternalAccount(client, actor, externalInput("partner", org));
    const prior = (await db`select updated_at::text version from public."user" where id=${account.id}`)[0].version;
    expect((await rpc("update_admin_user_profile", { p_actor: actor, p_user: account.id, p_patch: { status: "suspended", expected_updated_at: prior } })).error).toBeNull();
    failActivation = true;
    await expect(synchronizeAccountAuthStatus(client, actor, account.id)).rejects.toThrow(/pending/);
    expect((await db`select state,status from account_auth_sync where user_id=${account.id}`)[0]).toMatchObject({ state: "pending", status: "suspended" });
    failActivation = false;
    await synchronizeAccountAuthStatus(client, actor, account.id);
    expect((await db`select state from account_auth_sync where user_id=${account.id}`)[0].state).toBe("applied");
    expect((await rpc("update_admin_user_profile", { p_actor: actor, p_user: account.id, p_patch: { status: "active", expected_updated_at: prior } })).error?.message).toContain("Stale");
  });
  it("staff membership changes use the expected role and preserve the existing Rider and financial evidence", async () => {
    const assign = (role: string | null, expected: string | null) => db.begin(async tx => {
      await tx`select set_config('request.jwt.claim.role','service_role',true)`;
      return tx`select assign_employee_role(${actor},${legacyId},${role},${expected})`;
    });
    await assign("partner_operations_manager", "operations_manager");
    await expect(assign("support_agent", "operations_manager")).rejects.toThrow(/Stale/);
    await assign(null, "partner_operations_manager");
    expect((await db`select role from admin_users where user_id=${legacyId}`)[0].role).toBeNull();
    expect(await db`select id from rider where user_id=${legacyId}`).toHaveLength(1);
    expect((await db`select points_earned from reward_transactions`)[0].points_earned).toBe(123);
    expect((await db`select to_regprocedure('public.assign_employee_role(uuid,uuid,text)') old`)[0].old).toBeNull();
  });
  it("external Partner Operations Manager administers operational staff only within its own tenant", async () => {
    const org = await organisation("partner"), other = await organisation("partner");
    const operator = await provisionExternalAccount(client, actor, externalInput("partner", org));
    const staff = await change(incidentId, org, "staff", "active", null, operator.id);
    expect(staff.role).toBe("staff");
    await expect(change(incidentId, other, "staff", "active", null, operator.id)).rejects.toThrow(/Unauthorized/);
    await expect(change(incidentId, org, "manager", "active", staff.updated_at, operator.id)).rejects.toThrow(/only operational staff/);
    await expect(change(incidentId, org, "partner_operations_manager", "active", staff.updated_at, operator.id)).rejects.toThrow(/only operational staff/);
    await expect(change(incidentId, org, "owner", "active", staff.updated_at, operator.id)).rejects.toThrow(/Unauthorized/);
    const revoked = await change(incidentId, org, "staff", "revoked", staff.updated_at, operator.id);
    expect(revoked.status).toBe("revoked");
    expect(await db`select id from rider where user_id=${incidentId}`).toHaveLength(1);
    expect(await db`select id from admin_users where user_id=${operator.id}`).toHaveLength(0);
  });
  it("targets notification domains from explicit active memberships without coarse-role fallbacks", async () => {
    const org = await organisation("partner"), account = await provisionExternalAccount(client, actor, externalInput("partner", org));
    const queue = (operation: string) => db.begin(async tx => {
      await tx`select set_config('request.jwt.claim.sub',${actor},true),set_config('request.jwt.claims','{"aal":"aal2"}',true)`;
      return (await tx`select ops_queue_notifications(${operation}::uuid,'{"target":"role","role":"partner","title":"Test","message":"Test","type":"system","respectPreferences":true}') value`)[0].value;
    });
    const operation = randomUUID(); await queue(operation); await queue(operation);
    expect(await db`select user_id from ops_notification_recipient where operation=${operation} and user_id=${account.id}`).toHaveLength(1);
    const member = (await db`select updated_at::text value from organisation_membership where user_id=${account.id}`)[0];
    await change(account.id, org, "partner_operations_manager", "revoked", member.value);
    const revokedOperation = randomUUID(); await queue(revokedOperation);
    expect(await db`select user_id from ops_notification_recipient where operation=${revokedOperation} and user_id=${account.id}`).toHaveLength(0);
  });
  it("retires public resend authorities and binds Workboard resends to actor, scope and exact prepared token", async () => {
    const team = randomUUID(), invite = randomUUID(), oldHash = createHash("sha256").update("old").digest("hex"), nextHash = createHash("sha256").update("next").digest("hex");
    await db`insert into workboard_team_members(team_id,user_id,role) values(${team},${actor},'owner')`;
    await db`insert into platform_invitations(id,scope,target_entity_id,email,role,token_hash,invited_by,expires_at) values(${invite},'workboard_team',${team},'actor@example.test','editor',${oldHash},${actor},now()+interval '1 day')`;
    const command = (kind: "prepare" | "commit" | "abort", id = invite, actorId = actor, hash = nextHash) => db.begin(async tx => {
      await tx`select set_config('request.jwt.claim.role','service_role',true)`;
      if (kind === "prepare") return tx`select * from prepare_resend_platform_invitation(${id}::uuid,${hash},now()+interval '1 day',${actorId}::uuid)`;
      if (kind === "commit") return tx`select * from commit_resend_platform_invitation(${id}::uuid,${actorId}::uuid,${hash})`;
      return tx`select * from abort_resend_platform_invitation(${id}::uuid,${actorId}::uuid,${hash})`;
    });
    expect((await db`select has_function_privilege('anon','prepare_resend_platform_invitation(uuid,text,timestamptz,uuid)','EXECUTE') allowed`)[0].allowed).toBe(false);
    expect((await db`select to_regprocedure('commit_resend_platform_invitation(uuid)') old`)[0].old).toBeNull();
    await expect(command("prepare", invite, incidentId)).rejects.toThrow(/administrator/);
    await command("prepare");
    await expect(command("prepare", invite, actor, oldHash)).rejects.toThrow(/already prepared/);
    await expect(command("commit", invite, actor, oldHash)).rejects.toThrow(/Stale/);
    await expect(command("abort", invite, actor, oldHash)).rejects.toThrow(/Stale/);
    expect((await command("commit"))[0].success).toBe(true);
    expect((await command("commit"))[0].success).toBe(true);
    const org = await organisation("partner"), account = await provisionExternalAccount(client, actor, { ...externalInput("partner", org), membershipStatus: "invited" });
    const invitation = await invitationCommand("issue", account.id, org, randomUUID());
    await expect(command("prepare", invitation.id)).rejects.toThrow(/administrator/);
    await expect(db.begin(async tx => { await tx.unsafe('SET LOCAL ROLE service_role'); return tx`update platform_invitations set role='owner' where id=${invitation.id}`; })).rejects.toThrow(/canonical lifecycle/);
  });
  describe.skipIf(!detailsHttp)("User Details actual Server Actions through PostgREST and PostgreSQL", () => {
    async function person(staff = false) {
      const id=randomUUID();await db`INSERT INTO auth.users(id,email) VALUES(${id},${id+'@example.test'})`;
      if(staff)await db`INSERT INTO admin_users(user_id,role) VALUES(${id},'support_agent')`;
      return id;
    }
    async function memberships(id: string) {
      actionState.actor=actor;const result=await getAccountMemberships(id);expect(result.success,JSON.stringify(result)).toBe(true);if(!result.success)throw new Error(result.error.message);return result.data;
    }
    const command=(id:string,org:string,role:"owner"|"manager"|"partner_operations_manager"|"staff"|"viewer",status:"active"|"invited"|"revoked",expectedUpdatedAt:string|null=null)=>changeAccountMembership({userId:id,organisationId:org,role,status,expectedUpdatedAt});
    it.each(["partner","advertiser","government"] as const)("%s assignment, readback and revocation preserve a profile-free external account",async domain=>{
      actionState.actor=actor;const org=await organisation(domain),account=await provisionExternalAccount(client,actor,{...externalInput(domain,org),role:"viewer"});
      const [read]=await memberships(account.id);expect(read.domain).toBe(domain);expect(read.role).toBe("viewer");
      const result=await command(account.id,org,"viewer","revoked",read.updatedAt);expect(result.success,JSON.stringify(result)).toBe(true);
      expect((await memberships(account.id))[0].status).toBe("revoked");
      expect(await db`SELECT id FROM rider WHERE user_id=${account.id}`).toHaveLength(0);expect(await db`SELECT id FROM admin_users WHERE user_id=${account.id}`).toHaveLength(0);
      expect((await db`SELECT status FROM public."user" WHERE id=${account.id}`)[0].status).toBe("active");
    });
    it("assigns, edits, reloads and revokes for a Rider/Staff account without touching financial or identity history",async()=>{
      actionState.actor=actor;const id=await person(true),org=await organisation("partner");
      await db`INSERT INTO reward_transactions SELECT ${randomUUID()},id,23 FROM rider WHERE user_id=${id}`;await db`INSERT INTO ride_history SELECT ${randomUUID()},id FROM rider WHERE user_id=${id}`;
      const snapshot=async()=>JSON.stringify((await db`SELECT to_jsonb(u) account,(SELECT to_jsonb(r) FROM rider r WHERE r.user_id=u.id) rider,(SELECT to_jsonb(s) FROM admin_users s WHERE s.user_id=u.id) staff,(SELECT jsonb_agg(t) FROM reward_transactions t) finances,(SELECT jsonb_agg(h) FROM ride_history h) rides FROM public."user" u WHERE u.id=${id}`)[0]);
      const before=await snapshot();expect((await command(id,org,"partner_operations_manager","active")).success).toBe(true);
      const [first]=await memberships(id);expect(first.role).toBe("partner_operations_manager");expect(first.updatedAt).toMatch(/\.\d{4,}/);
      expect((await command(id,org,"staff","active",first.updatedAt)).success).toBe(true);
      const [second]=await memberships(id);expect(second.role).toBe("staff");expect(second.updatedAt).not.toBe(first.updatedAt);
      expect((await command(id,org,"staff","revoked",second.updatedAt)).success).toBe(true);expect((await memberships(id))[0].status).toBe("revoked");
      expect(await snapshot()).toBe(before);
      const audits=await db`SELECT previous_state,resulting_state FROM platform_audit_record WHERE reason='organisation_membership.change' AND target_entity_id=${first.id} ORDER BY created_at`;
      expect(audits).toHaveLength(3);expect(audits[2].previous_state.status).toBe("active");expect(audits[2].resulting_state.status).toBe("revoked");
      const session=await db.begin(async tx=>{await tx`SELECT set_config('request.jwt.claim.sub',${id},true),set_config('request.jwt.claims','{"aal":"aal2"}',true)`;return(await tx`SELECT identity_organisation_capability(${org},'fulfilment.read') org_access,identity_has_capability('dashboard.read') staff_access,(SELECT id FROM public.rider WHERE user_id=auth.uid()) rider_id`)[0];});
      expect(session.org_access).toBe(false);expect(session.staff_access).toBe(true);expect(session.rider_id).toBeTruthy();
    });
    it("uses the real invitation/read/revoke handlers without inventing profiles for an independent User",async()=>{
      actionState.actor=actor;const org=await organisation("partner"),account=await provisionProduct(client,actor,{email:randomUUID()+"@example.test",name:"Independent invite fixture",role:null,status:"active",languagePreference:"en",isVerified:true});
      const organisations=await getAccountOrganisations();expect(organisations.success).toBe(true);if(organisations.success)expect(organisations.data.some(row=>row.id===org)).toBe(true);
      const issued=await issueAccountInvitation({userId:account.id,organisationId:org,role:"viewer",expectedUpdatedAt:null},createHash("sha256").update(randomUUID()).digest("hex"));
      expect(issued.success,JSON.stringify(issued)).toBe(true);if(!issued.success)throw new Error(issued.error.message);
      const invitations=await getAccountInvitations(account.id);expect(invitations.success,JSON.stringify(invitations)).toBe(true);if(invitations.success)expect(invitations.data[0].id).toBe(issued.data.invitationId);
      expect((await revokeAccountInvitation(issued.data.invitationId)).success).toBe(true);expect((await memberships(account.id))[0].status).toBe("revoked");
      expect(await db`SELECT id FROM rider WHERE user_id=${account.id}`).toHaveLength(0);expect(await db`SELECT id FROM admin_users WHERE user_id=${account.id}`).toHaveLength(0);
      expect((await db`SELECT role,status FROM public."user" WHERE id=${account.id}`)[0]).toMatchObject({role:null,status:"active"});
    });
    it("returns the exact sole-Owner denial without a thrown RSC error, then permits a protected transfer",async()=>{
      actionState.actor=actor;const id=await person(),other=await person(),org=await organisation("partner");expect((await command(id,org,"owner","active")).success).toBe(true);
      const [sole]=await memberships(id);expect(sole.isLastActiveOwner).toBe(true);
      const denied=await command(id,org,"owner","revoked",sole.updatedAt);expect(denied).toMatchObject({success:false,error:{code:"last_owner",message:expect.stringContaining("Cannot remove last active organisation owner")}});
      expect((await memberships(id))[0].status).toBe("active");
      expect((await command(other,org,"owner","active")).success).toBe(true);expect((await memberships(id))[0].isLastActiveOwner).toBe(false);
      expect((await command(id,org,"owner","revoked",sole.updatedAt)).success).toBe(true);expect((await memberships(id))[0].status).toBe("revoked");
      const [remaining]=await memberships(other);expect(remaining.isLastActiveOwner).toBe(true);
      // A disabled target owner is removable when a different active Owner exists.
      expect((await command(id,org,"owner","active",(await memberships(id))[0].updatedAt)).success).toBe(true);
      await db`UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=${other}`;
      expect((await memberships(other))[0].isLastActiveOwner).toBe(false);
    });
    it("rejects stale and concurrent commands without a duplicate writer or audit",async()=>{
      actionState.actor=actor;const id=await person(),org=await organisation("partner");expect((await command(id,org,"staff","active")).success).toBe(true);const [initial]=await memberships(id);
      const results=await Promise.all([command(id,org,"viewer","active",initial.updatedAt),command(id,org,"staff","revoked",initial.updatedAt)]);
      expect(results.filter(r=>r.success)).toHaveLength(1);expect(results.filter(r=>!r.success&&r.error.code==="conflict")).toHaveLength(1);
      const stale=await command(id,org,"manager","active",initial.updatedAt);expect(stale).toMatchObject({success:false,error:{code:"conflict"}});
      expect(await db`SELECT 1 FROM platform_audit_record WHERE target_entity_id=${initial.id}`).toHaveLength(2);
    });
    it("denies Owner escalation, cross-tenant commands and suspended/revoked actors at the canonical boundary",async()=>{
      actionState.actor=actor;const id=await person(),org=await organisation("partner"),other=await organisation("partner");expect((await command(id,org,"staff","active")).success).toBe(true);const [initial]=await memberships(id);
      actionState.actor=restrictedActor;expect(await command(id,org,"owner","active",initial.updatedAt)).toMatchObject({success:false,error:{code:"denied"}});
      const operator=await provisionExternalAccount(client,actor,externalInput("partner",org));actionState.actor=operator.id;
      expect(await command(id,other,"staff","active")).toMatchObject({success:false,error:{code:"denied"}});
      await db`UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=${operator.id}`;
      expect(await command(id,org,"staff","revoked",initial.updatedAt)).toMatchObject({success:false,error:{code:"denied"}});
      await db`UPDATE auth.users SET banned_until=NULL WHERE id=${operator.id}`;const [operatorGrant]=await memberships(operator.id);expect((await command(operator.id,org,"partner_operations_manager","revoked",operatorGrant.updatedAt)).success).toBe(true);
      actionState.actor=operator.id;expect(await command(id,org,"staff","revoked",initial.updatedAt)).toMatchObject({success:false,error:{code:"denied"}});actionState.actor=actor;
    });
  });

});
