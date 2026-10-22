import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Opt-in, localhost only. Installs the actual capability source and rider status command.
describe.skipIf(process.env.MOVRR_EMPLOYEE_POSTGRES !== "1")("rider status command: actual PostgreSQL", () => {
  const opts = { host: "127.0.0.1", port: 55442, username: "postgres", password: "isolated-local-test-only", max: 4, onnotice: () => {} };
  const root = postgres({ ...opts, database: "postgres" });
  const name = `rider_status_${process.pid}`;
  const db = postgres({ ...opts, database: name });
  let created = false;
  const manager = randomUUID(), finance = randomUUID(), suspendedManager = randomUUID(), riderUser = randomUUID(), rider = randomUUID();
  const command = (tx: postgres.Sql, args: { actor?: string; active: boolean; expected: boolean | null; rider?: string; role?: string }) =>
    tx.begin(async (t) => {
      await t`select set_config('request.jwt.claim.role',${args.role ?? "service_role"},true)`;
      return (await t`select public.admin_set_rider_status(${args.actor ?? manager}::uuid,${args.rider ?? rider}::uuid,${args.active},${args.expected},'corr-1',false) result`)[0].result;
    });
  const state = async () => ({
    status: (await db`select status::text from public.rider where id=${rider}`)[0].status,
    audits: (await db`select count(*)::int n from public.platform_audit_record`)[0].n,
    activity: (await db`select count(*)::int n from public.user_activity`)[0].n,
  });

  beforeAll(async () => {
    await root.unsafe(`create database "${name}"`);
    created = true;
    await db.unsafe(`create schema auth;
      create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
      create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
      do $r$ begin
        if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
        if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      end $r$;
      create table public."user"(id uuid primary key,status text not null default 'active');
      create type public.rider_status as enum('active','inactive','suspended');
      create table public.rider(id uuid primary key,user_id uuid references public."user"(id),status public.rider_status not null default 'active',city text);
      create table public.admin_users(id uuid default gen_random_uuid(),user_id uuid unique,role text);
      ${readFileSync("scripts/041_platform_audit_idempotency.sql", "utf8").match(/CREATE TABLE IF NOT EXISTS public\.platform_audit_record \([\s\S]*?\);/)![0]}
      ${readFileSync("scripts/021_user_activity.sql", "utf8").match(/create table if not exists public\.user_activity \([\s\S]*?\);/)![0]}`);
    await db.unsafe(readFileSync("scripts/070_employee_rbac_authority.sql", "utf8").match(/CREATE OR REPLACE FUNCTION public\.ops_employee_capabilities[\s\S]*?\$cap\$;/)![0]);
    await db.begin((tx) => tx.unsafe(readFileSync("scripts/081_rider_status_command.sql", "utf8").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
    for (const id of [manager, finance, suspendedManager, riderUser]) await db`insert into auth.users(id) values(${id})`;
    await db`insert into public."user"(id,status) values(${manager},'active'),(${finance},'active'),(${suspendedManager},'suspended'),(${riderUser},'active')`;
    await db`insert into public.admin_users(user_id,role) values(${manager},'operations_manager'),(${finance},'finance_operator'),(${suspendedManager},'operations_manager')`;
    await db`insert into public.rider(id,user_id,status) values(${rider},${riderUser},'active')`;
  });
  beforeEach(async () => {
    await db`update public.rider set status='active' where id=${rider}`;
    await db`delete from public.platform_audit_record`;
    await db`delete from public.user_activity`;
  });
  afterAll(async () => {
    await db.end();
    if (created) await root.unsafe(`drop database "${name}" with(force)`);
    await root.end();
  });

  it("suspends and reactivates with the audit and activity committed in the same transaction", async () => {
    expect(await command(db, { active: false, expected: true })).toMatchObject({ changed: true, status: "suspended", previous: "active" });
    expect(await state()).toEqual({ status: "suspended", audits: 1, activity: 1 });
    const audit = (await db`select actor_user_id,principal_type,capability,target_entity_type,target_entity_id,previous_state,resulting_state,correlation_id,reason from public.platform_audit_record`)[0];
    expect(audit).toEqual({ actor_user_id: manager, principal_type: "admin", capability: "riders.manage", target_entity_type: "rider", target_entity_id: rider,
      previous_state: { status: "active" }, resulting_state: { status: "suspended" }, correlation_id: "corr-1", reason: "rider_status.change" });
    expect((await db`select user_id,actor_user_id,action,related_entity_id from public.user_activity`)[0]).toEqual({ user_id: riderUser, actor_user_id: manager, action: "Rider suspended", related_entity_id: rider });
    expect(await command(db, { active: true, expected: false })).toMatchObject({ changed: true, status: "active", previous: "suspended" });
    expect(await state()).toEqual({ status: "active", audits: 2, activity: 2 });
  });

  it("treats an already-applied status as a no-op without an audit", async () => {
    expect(await command(db, { active: true, expected: true })).toMatchObject({ changed: false, status: "active" });
    await db`update public.rider set status='inactive' where id=${rider}`;
    // Deactivating a non-active profile never rewrites its stored state.
    expect(await command(db, { active: false, expected: false })).toMatchObject({ changed: false, status: "inactive" });
    expect(await state()).toEqual({ status: "inactive", audits: 0, activity: 0 });
  });

  it("denies actors without riders.manage, inactive actors and non-service callers", async () => {
    await expect(command(db, { actor: finance, active: false, expected: true })).rejects.toMatchObject({ code: "42501" });
    await expect(command(db, { actor: suspendedManager, active: false, expected: true })).rejects.toMatchObject({ code: "42501" });
    await expect(command(db, { actor: riderUser, active: false, expected: true })).rejects.toMatchObject({ code: "42501" });
    await expect(command(db, { role: "authenticated", active: false, expected: true })).rejects.toMatchObject({ code: "42501" });
    expect(await state()).toEqual({ status: "active", audits: 0, activity: 0 });
  });

  it("rejects stale expectations and unknown riders without changes", async () => {
    // The caller believed the profile was already non-active; it is active, so the change is stale.
    await expect(command(db, { active: false, expected: false })).rejects.toMatchObject({ code: "40001" });
    await expect(command(db, { active: false, expected: true, rider: randomUUID() })).rejects.toMatchObject({ code: "P0002" });
    expect(await state()).toEqual({ status: "active", audits: 0, activity: 0 });
  });

  it("rolls back the status change when the audit cannot be written", async () => {
    await db.unsafe("alter table public.platform_audit_record add constraint reject_all check (false) not valid");
    try {
      await expect(command(db, { active: false, expected: true })).rejects.toMatchObject({ code: "23514" });
    } finally {
      await db.unsafe("alter table public.platform_audit_record drop constraint reject_all");
    }
    expect(await state()).toEqual({ status: "active", audits: 0, activity: 0 });
  });

  it("serializes concurrent changes: a duplicate becomes a no-op and an outdated change is rejected", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const first = db.begin(async (t) => {
      await t`select set_config('request.jwt.claim.role','service_role',true)`;
      await t`select public.admin_set_rider_status(${manager}::uuid,${rider}::uuid,false,true,'first',false)`;
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const second = command(db, { active: false, expected: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    release();
    await first;
    // Blocked on the row lock, then sees the committed suspension: no-op, not a double change.
    expect(await second).toMatchObject({ changed: false, status: "suspended" });
    // A reactivation prepared before the suspension committed is stale.
    await expect(command(db, { active: true, expected: true })).rejects.toMatchObject({ code: "40001" });
    expect(await state()).toEqual({ status: "suspended", audits: 1, activity: 1 });
  });
});
