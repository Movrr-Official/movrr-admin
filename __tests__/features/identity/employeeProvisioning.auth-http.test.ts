import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ actor: "", client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin", () => ({ requireCapability: async () => ({ authUser: { id: actions.actor } }), requireAnyCapability: async () => ({ authUser: { id: actions.actor } }) }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => actions.client }));
vi.mock("@/lib/platformSettings", () => ({ getPlatformOperationalPolicies: async () => ({ security: { inviteDomainAllowlist: [] } }),
  isInviteDomainAllowed: () => true, getPlatformPrivacyPolicy: async () => ({}), getPlatformSecurityPolicy: async () => ({}) }));
vi.mock("@/lib/userActivity", () => ({ writeUserActivity: async () => {}, fetchUserActivityFeed: async () => [] }));
vi.mock("@/lib/env", () => ({ APP_URL: "http://localhost:3000", CUSTOMER_APP_URL: "http://localhost:3001", FROM_EMAIL: "test@example.test", RESEND_API_KEY: "" }));
import { createUser as createAccountAction, updateUser as updateAccountAction } from "@/app/actions/users";
import { changeAccountMembership } from "@/app/actions/accountMemberships";
import postgres from "postgres";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { GoTrueAdminApi, GoTrueClient } from "@supabase/auth-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { provisionExternalAccount } from "@/features/identity/application/externalAccountProvisioning";
import { provisionEmployee } from "@/features/identity/application/employeeProvisioning";
import { provisionProduct } from "@/features/identity/application/productProvisioning";

// Real Auth HTTP + actual application services + separate PostgreSQL RPC
// transactions. Opt-in; exclusively local credentials and image, never .env.
describe.skipIf(process.env.MOVRR_EMPLOYEE_AUTH_HTTP !== "1")("real GoTrue provisioning contracts", () => {
  const opts = { host: "127.0.0.1", port: 55443, username: "postgres", password: "isolated-local-test-only", max: 8, onnotice: () => {} };
  const database = `employee_auth_http_${process.pid}`;
  const container = `movrr-employee-auth-http-${randomUUID()}`;
  const root = postgres({ ...opts, database: "postgres" }), db = postgres({ ...opts, database });
  const secret = "local-only-employee-provisioning-regression-secret";
  const encode = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "service_role", exp: Math.floor(Date.now()/1000)+3600, aud: "authenticated" })}`;
  const token = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
  const admin = new GoTrueAdminApi({ url: "http://127.0.0.1:55444", headers: { Authorization: `Bearer ${token}` } });
  let started = false, actor: string, failGrant = false;
  const client = { auth: { admin }, rpc: async (name: string, args: Record<string, unknown>) => {
    try {
      const data = await db.begin(async tx => {
        await tx`select set_config('request.jwt.claim.role','service_role',true)`;
        if (failGrant) await tx`select set_config('test.fail_member','on',true)`;
        if (name === "change_organisation_membership") return (await tx`select change_organisation_membership(${String(args.p_actor)}::uuid,${String(args.p_user)}::uuid,${String(args.p_organisation)}::uuid,${String(args.p_role)},${String(args.p_status)},${args.p_expected as string | null}::text::timestamptz) value`)[0].value;
        if (name === "update_admin_user_profile") return (await tx`select update_admin_user_profile(${String(args.p_actor)}::uuid,${String(args.p_user)}::uuid,${tx.json(args.p_patch as never)}) value`)[0].value;
        if (name === "account_auth_sync_state") return (await tx`select account_auth_sync_state(${String(args.p_actor)}::uuid,${String(args.p_user)}::uuid,${args.p_version as number | null},${Boolean(args.p_ack)}) value`)[0].value;
        if (name === "provision_external_account") return (await tx`select provision_external_account(${String(args.p_actor)}::uuid,${tx.json(args.p_input as never)},${String(args.p_phase)}) value`)[0].value;
        if (name === "provision_employee") return (await tx`select public.provision_employee(${String(args.p_actor)}::uuid,${tx.json(args.p_input as never)},${String(args.p_phase)}) value`)[0].value;
        return (await tx`select public.provision_product(${String(args.p_actor)}::uuid,${String(args.p_id)}::uuid,${tx.json(args.p_input as never)},${String(args.p_fingerprint)},${String(args.p_phase)}) value`)[0].value;
      });
      return { data, error: null };
    } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
  } } as unknown as SupabaseClient;
  actions.client = client;
  const input = () => ({ email: `${randomUUID()}@example.test`, name: "Real Auth Employee", role: "partner_operations_manager" as const, status: "active" as const, isVerified: true, languagePreference: "en", sendWelcomeEmail: false });
  beforeAll(async () => {
    await root.unsafe(`CREATE DATABASE "${database}"`);
    await db.unsafe(`CREATE SCHEMA auth;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      END $$;`);
    execFileSync("docker", ["run", "--detach", "--name", container, "--label", "movrr.task=employee-provisioning-auth-http", "--publish", "127.0.0.1:55444:9999",
      "--env", "GOTRUE_API_HOST=0.0.0.0", "--env", "GOTRUE_API_PORT=9999", "--env", "GOTRUE_DB_DRIVER=postgres",
      "--env", `GOTRUE_DB_DATABASE_URL=postgres://postgres:isolated-local-test-only@host.docker.internal:55443/${database}?search_path=auth`,
      "--env", "GOTRUE_SITE_URL=http://localhost:3000", "--env", "API_EXTERNAL_URL=http://127.0.0.1:55444",
      "--env", `GOTRUE_JWT_SECRET=${secret}`, "--env", "GOTRUE_JWT_ADMIN_ROLES=service_role", "--env", "GOTRUE_JWT_AUD=authenticated",
      "--env", "GOTRUE_EXTERNAL_EMAIL_ENABLED=true", "--env", "GOTRUE_MAILER_AUTOCONFIRM=true", "--env", "GOTRUE_DISABLE_SIGNUP=false",
      "public.ecr.aws/supabase/gotrue:v2.197.0"], { windowsHide: true, stdio: "pipe" });
    started = true;
    let healthy = false;
    for (let attempt=0; attempt<40; attempt++) {
      healthy = await fetch("http://127.0.0.1:55444/health", { signal: AbortSignal.timeout(400) }).then(r => r.ok).catch(() => false);
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!healthy) throw new Error("Local GoTrue failed to start: " + execFileSync("docker", ["logs", "--tail", "12", container], { windowsHide: true }).toString());
    await db.unsafe(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE TYPE public.user_role AS ENUM('super_admin','admin','moderator','support','advertiser','rider','gov');
      CREATE TYPE public.user_status AS ENUM('active','suspended','pending','deleted');CREATE TYPE public.rider_status AS ENUM('active','inactive','suspended');
      CREATE TABLE public."user"(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,email text UNIQUE,name text,phone text,organization text,avatar_url text,role public.user_role DEFAULT 'rider',status public.user_status DEFAULT 'active',created_at timestamptz,updated_at timestamptz,language_preference text,is_verified boolean,email_verified boolean,verification_level text,account_notes text);
      CREATE TABLE public.rider(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES public."user"(id),created_at timestamptz,phone text,city text,country text,status public.rider_status DEFAULT 'active');
      CREATE TABLE public.advertiser(id uuid DEFAULT gen_random_uuid(),user_id uuid UNIQUE,company_name text,language text,timezone text,created_at timestamptz,company_email text,website text,logo_url text,industry text,budget numeric,email_notifications boolean,campaign_updates boolean);
      CREATE TABLE public.waitlist(id uuid PRIMARY KEY,email text,name text,city text,country_code text,status text DEFAULT 'pending',status_reason text,converted_to_user boolean DEFAULT false,updated_at timestamptz);
      CREATE TABLE public.admin_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES auth.users(id),email text,role text,created_by uuid REFERENCES auth.users(id),updated_at timestamptz);
      CREATE TABLE public.organisation_membership(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id));`);
    await db.unsafe(`CREATE TABLE public.platform_audit_record(actor_user_id uuid,principal_type text,capability text,target_entity_type text,target_entity_id text,previous_state jsonb,resulting_state jsonb,correlation_id text,reason text,created_at timestamptz DEFAULT now());`);
    await db.unsafe(readFileSync("scripts/fixtures/employee-provisioning/handle_new_user.sql", "utf8"));
    await db.unsafe("CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()");
    await db.unsafe(readFileSync("scripts/056_alignment_capabilities.sql", "utf8"));
    const created = await admin.createUser({ email: "operator@example.test", password: "local-operator-only-secure-password", email_confirm: true, user_metadata: { server_assigned_role: "admin" } });
    if (created.error) throw created.error;
    actor = created.data.user!.id;
    actions.actor = actor;
    await db`insert into admin_users(user_id,email,role) values(${actor},'operator@example.test','super_admin')`;
    const migration = await db.reserve();
    try { await migration.unsafe(readFileSync("scripts/068_employee_provisioning.sql", "utf8")); } finally { await migration.release(); }
    const invitationSchema = readFileSync("scripts/050_platform_invitations.sql", "utf8");
    await db.unsafe(invitationSchema.slice(0, invitationSchema.indexOf("CREATE INDEX")));
    const notificationSchema=readFileSync("scripts/057_alignment_operations.sql","utf8");
    await db.unsafe(notificationSchema.slice(notificationSchema.indexOf("CREATE TABLE public.ops_notification_send"),notificationSchema.indexOf("CREATE FUNCTION public.ops_notification_status")));
    await db.begin(tx => tx.unsafe(readFileSync("scripts/070_employee_rbac_authority.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    await db.unsafe(`CREATE TABLE public.organisation(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,type text,status text DEFAULT 'active');
      CREATE TABLE public.permission_bundle(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),key text UNIQUE,name text);
      CREATE TABLE public.bundle_capability(bundle_id uuid,capability text);
      INSERT INTO public.permission_bundle(key) VALUES('org.owner'),('org.manager'),('org.staff'),('org.viewer');
      ALTER TABLE public.advertiser ADD COLUMN organisation_id uuid REFERENCES public.organisation(id);
      ALTER TABLE public.organisation_membership ADD COLUMN organisation_id uuid REFERENCES public.organisation(id),ADD COLUMN role text,
        ADD COLUMN status text DEFAULT 'active',ADD COLUMN bundle_key text REFERENCES public.permission_bundle(key),
        ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now(),ADD UNIQUE(organisation_id,user_id);`);
    await db.begin(tx => tx.unsafe(readFileSync("scripts/071_external_account_domains.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    await db.begin(tx => tx.unsafe(readFileSync("scripts/072_organisation_invitations.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    await db.unsafe(`CREATE FUNCTION fail_external_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.fail_member',true)='on' THEN RAISE EXCEPTION 'Injected external membership failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_external_grant BEFORE INSERT ON organisation_membership FOR EACH ROW EXECUTE FUNCTION fail_external_grant();`);
    await db.begin(tx => tx.unsafe(readFileSync("scripts/073_account_status_and_staff_commands.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    await db.unsafe(`CREATE FUNCTION fail_employee_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.fail_member',true)='on' THEN RAISE EXCEPTION 'Injected real Auth grant failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_employee_grant BEFORE INSERT ON admin_users FOR EACH ROW EXECUTE FUNCTION fail_employee_grant();`);
  }, 45000);
  afterAll(async () => {
    if (started) execFileSync("docker", ["rm", "--force", container], { windowsHide: true, stdio: "pipe" });
    await db.end({ timeout: 5 });
    await root.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.end({ timeout: 5 });
  }, 15000);
  it("creates the exact employee through the actual Auth API and replays without a second identity", async () => {
    const payload = input(), result = await provisionEmployee(client, actor, payload);
    const identity = await admin.getUserById(result.id);
    expect(identity.error).toBeNull(); expect(identity.data.user?.email).toBe(payload.email);
    expect((await db`select u.role,u.status,a.role employee_role from public."user" u join admin_users a on a.user_id=u.id where u.id=${result.id}`)[0]).toMatchObject({ role: null, status: "active", employee_role: "partner_operations_manager" });
    expect(await db`select id from rider where user_id=${result.id}`).toHaveLength(0);
    expect((await provisionEmployee(client, actor, payload)).id).toBe(result.id);
    expect((await db`select count(*)::int n from auth.users where email=${payload.email}`)[0].n).toBe(1);
  });
  it("leaves actual Auth banned, public profile pending and no employee grant after persistence failure, then resumes", async () => {
    const payload = input(); failGrant = true;
    await expect(provisionEmployee(client, actor, payload)).rejects.toThrow("Injected real Auth grant failure");
    const row = (await db`select a.id,a.banned_until,u.status from auth.users a join public."user" u on u.id=a.id where a.email=${payload.email}`)[0];
    expect(row.banned_until).not.toBeNull(); expect(row.status).toBe("pending");
    expect(await db`select id from rider where user_id=${row.id}`).toHaveLength(0);
    expect(await db`select id from admin_users where user_id=${row.id}`).toHaveLength(0);
    failGrant = false;
    expect((await provisionEmployee(client, actor, payload)).id).toBe(row.id);
    expect((await db`select banned_until from auth.users where id=${row.id}`)[0].banned_until).toBeNull();
  });
  it("provisions an Admin Rider through actual Auth with durable product metadata and no employee role", async () => {
    const { sendWelcomeEmail: _unused, ...base } = input();
    const payload = { ...base, role: "rider" as const, city: "Amsterdam", country: "NL" };
    const result = await provisionProduct(client, actor, payload);
    expect((await db`select state from product_provisioning where user_id=${result.id}`)[0].state).toBe("complete");
    expect((await provisionProduct(client, actor, payload)).id).toBe(result.id);
    expect(await db`select id from rider where user_id=${result.id}`).toHaveLength(1);
    expect(await db`select id from admin_users where user_id=${result.id}`).toHaveLength(0);
  });
  it("creates an advertiser through real Auth with the complete advertiser profile and no Rider", async () => {
    const { sendWelcomeEmail: _unused, ...base } = input();
    const payload = { ...base, role: "advertiser" as const, advertiserProfile: {
      companyName: "Real Auth Advertiser", language: "nl", timezone: "Europe/Amsterdam",
      budget: 200, emailNotifications: true, campaignUpdates: true,
    } };
    const result = await provisionProduct(client, actor, payload);
    expect((await db`select company_name,budget,language from advertiser where user_id=${result.id}`)[0]).toMatchObject({ company_name: "Real Auth Advertiser", budget: "200", language: "nl" });
    expect(await db`select id from rider where user_id=${result.id}`).toHaveLength(0);
  });
  it("rejects explicit invalid or operational metadata at Auth insertion rather than falling back to Rider", async () => {
    for (const role of ["partner_operations_manager", "unknown", "admin"]) {
      const email = `${randomUUID()}@example.test`;
      const result = await admin.createUser({ email, password: "invalid-role-test-only-password", user_metadata: { server_assigned_role: role } });
      expect(result.error).not.toBeNull();
      expect(await db`select id from auth.users where email=${email}`).toHaveLength(0);
      expect(await db`select id from public."user" where email=${email}`).toHaveLength(0);
    }
  });
  it("preserves ordinary signup and password login through real Auth contracts", async () => {
    const signup = new GoTrueClient({ url: "http://127.0.0.1:55444", headers: { Authorization: `Bearer ${token}` }, autoRefreshToken: false, persistSession: false });
    const email = `${randomUUID()}@example.test`;
    const result = await signup.signUp({ email, password: "ordinary-rider-local-only-password", options: { data: { full_name: "Ordinary Rider", city: "Amsterdam", country: "NL" } } });
    expect(result.error).toBeNull();
    const id = result.data.user!.id;
    const login = await signup.signInWithPassword({ email, password: "ordinary-rider-local-only-password" });
    expect(login.error).toBeNull();
    expect(login.data.user?.id).toBe(id);
    expect(login.data.session?.access_token).toBeTruthy();
    expect((await db`select u.role,u.status,r.city,r.country from public."user" u join rider r on r.user_id=u.id where u.id=${id}`)[0]).toMatchObject({ role: "rider", status: "active", city: "Amsterdam", country: "NL" });
    expect(await db`select id from admin_users where user_id=${id}`).toHaveLength(0);
  });
  it("handles simultaneous real Auth provisioning requests without duplicate users or grants", async () => {
    const payload = input();
    const results = await Promise.all(Array.from({length:5},()=>provisionEmployee(client,actor,payload)));
    expect(new Set(results.map(x=>x.id)).size).toBe(1);
    expect((await db`select count(*)::int n from auth.users where email=${payload.email}`)[0].n).toBe(1);
    expect((await db`select count(*)::int n from admin_users where user_id=${results[0].id}`)[0].n).toBe(1);
  });
  it.each(["partner", "advertiser", "government"] as const)("creates %s through real GoTrue without a Rider or employee", async domain => {
    const org = (await db`insert into organisation(name,type) values('Real Auth external organisation',${domain === "partner" ? "reward_partner" : domain}) returning id`)[0].id;
    const payload = { email: `${randomUUID()}@example.test`, name: "External operator", domain, organisationId: org,
      role: domain === "government" ? "viewer" as const : domain === "partner" ? "partner_operations_manager" as const : "manager" as const, status: "active" as const, isVerified: true, languagePreference: "en" };
    const result = await provisionExternalAccount(client, actor, payload);
    expect((await admin.getUserById(result.id)).data.user?.email).toBe(payload.email);
    expect((await db`select role,status from organisation_membership where user_id=${result.id}`)[0]).toMatchObject({ role: payload.role, status: "active" });
    expect(await db`select id from rider where user_id=${result.id}`).toHaveLength(0);
    expect(await db`select id from admin_users where user_id=${result.id}`).toHaveLength(0);
    expect((await provisionExternalAccount(client, actor, payload)).id).toBe(result.id);
  });
  it("retains a banned real Auth identity after external membership failure, then safely resumes", async () => {
    const org = (await db`insert into organisation(name,type) values('Failure recovery','reward_partner') returning id`)[0].id;
    const payload = { email: `${randomUUID()}@example.test`, name: "External recovery", domain: "partner" as const, organisationId: org,
      role: "manager" as const, status: "active" as const, isVerified: true, languagePreference: "en" };
    failGrant = true;
    await expect(provisionExternalAccount(client, actor, payload)).rejects.toThrow(/Injected external/);
    failGrant = false;
    const pending = (await db`select id,banned_until from auth.users where email=${payload.email}`)[0];
    expect(pending.banned_until).not.toBeNull();
    expect(await db`select id from rider where user_id=${pending.id}`).toHaveLength(0);
    expect((await provisionExternalAccount(client, actor, payload)).id).toBe(pending.id);
  });
  it.each(["rider", "partner", "advertiser", "government", "staff"] as const)("actual %s actions: Create → Save → Reload → Edit → Save → Revoke", async domain => {
    const external = ["partner", "advertiser", "government"].includes(domain);
    const org = external ? (await db`insert into organisation(name,type) values('Actual handler organisation',${domain === "partner" ? "reward_partner" : domain}) returning id`)[0].id : undefined;
    const result = await createAccountAction({ domain, organisationId: org,
      role: domain === "staff" ? "partner_operations_manager" : domain === "rider" ? "rider" : domain === "government" ? "viewer" : domain === "partner" ? "partner_operations_manager" : "manager",
      email: `${randomUUID()}@example.test`, name: "Actual action account", status: "active", membershipStatus: "active",
      isVerified: true, languagePreference: "en", sendWelcomeEmail: false, city: "Amsterdam", country: "NL" });
    expect(result.success, result.error).toBe(true);
    const id = result.data!.id;
    expect((await admin.getUserById(id)).data.user?.id).toBe(id);
    expect((await db`select count(*)::int n from rider where user_id=${id}`)[0].n).toBe(domain === "rider" ? 1 : 0);
    expect((await db`select count(*)::int n from admin_users where user_id=${id}`)[0].n).toBe(domain === "staff" ? 1 : 0);
    if (external) expect((await db`select role from organisation_membership where user_id=${id}`)[0].role).toBe(domain === "government" ? "viewer" : domain === "partner" ? "partner_operations_manager" : "manager");
    const version = async () => (await db`select to_jsonb(u)->>'updated_at' value from public."user" u where id=${id}`)[0].value;
    const edited = await updateAccountAction({ id, name: "Edited and reloaded account", expectedUpdatedAt: await version() });
    expect(edited.success, edited.error).toBe(true);
    expect((await db`select name from public."user" where id=${id}`)[0].name).toBe("Edited and reloaded account");
    if (external) {
      const member = async () => (await db`select to_jsonb(m) value from organisation_membership m where user_id=${id}`)[0].value;
      let prior = await member();
      const originalRole = prior.role;
      await changeAccountMembership({ userId: id, organisationId: org, role: "viewer", status: "active", expectedUpdatedAt: prior.updated_at });
      prior = await member(); expect(prior.role).toBe("viewer");
      await changeAccountMembership({ userId: id, organisationId: org, role: originalRole, status: "active", expectedUpdatedAt: prior.updated_at });
      prior = await member(); expect(prior.role).toBe(originalRole);
      await changeAccountMembership({ userId: id, organisationId: org, role: originalRole, status: "revoked", expectedUpdatedAt: prior.updated_at });
      expect((await member()).status).toBe("revoked");
    } else if (domain === "staff") {
      const changed = await updateAccountAction({ id, employeeRole: "support_agent", expectedEmployeeRole: "partner_operations_manager", expectedUpdatedAt: await version() });
      expect(changed.success, changed.error).toBe(true);
      expect((await db`select role from admin_users where user_id=${id}`)[0].role).toBe("support_agent");
      const revoked = await updateAccountAction({ id, employeeRole: null, expectedEmployeeRole: "support_agent", expectedUpdatedAt: await version() });
      expect(revoked.success, revoked.error).toBe(true);
      expect((await db`select role from admin_users where user_id=${id}`)[0].role).toBeNull();
    } else {
      const revoked = await updateAccountAction({ id, status: "inactive", expectedUpdatedAt: await version() });
      expect(revoked.success, revoked.error).toBe(true);
      expect((await db`select account_identity_active(${id}) allowed`)[0].allowed).toBe(false);
      expect((await db`select banned_until>now() banned from auth.users where id=${id}`)[0].banned).toBe(true);
    }
  });

});
