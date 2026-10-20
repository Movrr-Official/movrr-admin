import { beforeEach, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ policy: vi.fn(), assurance: vi.fn(), trusted: vi.fn(), user: vi.fn(), upsert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({headers: async () => new Headers({'x-pathname':'/'})}));
vi.mock("@/lib/supabase-server", () => ({createSupabaseServerClient: async () => ({auth:{getUser:deps.user}})}));
vi.mock("@/lib/supabase-admin", () => ({createSupabaseAdminClient: () => ({from:(table:string) => {
  const query = {select:()=>query,eq:()=>query, single:async()=>({data:{id:'employee',user_id:'a',role:'super_admin',email:'employee@isolated.test'},error:null}),maybeSingle:deps.trusted,upsert:deps.upsert};
  if (!['admin_users','admin_dashboard_sessions'].includes(table)) throw new Error('Unexpected data access');
  return query;
}})}));
vi.mock("@/lib/adminMfa", () => ({getServerAdminAuthenticatorAssurance:deps.assurance}));
vi.mock("@/lib/platformSettings", () => ({getPlatformSecurityPolicy:deps.policy}));
vi.mock("@/lib/userActivity", () => ({writeUserActivity:vi.fn()}));
vi.mock("@/lib/logger", () => ({logger:{warn:vi.fn(),info:vi.fn(),error:vi.fn()}}));
import { getAuthenticatedUser } from "@/lib/admin";
beforeEach(() => {
  vi.resetAllMocks();
  const now = new Date().toISOString();
  deps.user.mockResolvedValue({data:{user:{id:'a',last_sign_in_at:now}},error:null});
  deps.trusted.mockResolvedValue({data:{auth_last_sign_in_at:now,session_started_at:now,last_seen_at:now,session_expires_at:new Date(Date.now()+3600000).toISOString()},error:null});
  deps.policy.mockResolvedValue({enforceAdminMfa:true,adminSessionTimeoutMinutes:60});
  deps.assurance.mockResolvedValue({currentLevel:'aal2'});
});
it('starts policy, trusted-session and MFA checks together and waits for all before authorizing', async () => {
  let release!: (value: unknown) => void;
  deps.policy.mockImplementation(() => new Promise(resolve => {release=resolve;}));
  let authorized = false;
  const pending = getAuthenticatedUser().then(user=>{authorized=true;return user;});
  await vi.waitFor(()=>expect(deps.assurance).toHaveBeenCalledOnce());
  expect(deps.trusted).toHaveBeenCalledOnce();
  expect(authorized).toBe(false);
  release({enforceAdminMfa:true,adminSessionTimeoutMinutes:60});
  expect((await pending)?.authUser.id).toBe('a');
});
it('retains MFA denial and never touches the session on denial', async () => {
  deps.assurance.mockResolvedValue({currentLevel:'aal1'});
  await expect(getAuthenticatedUser()).rejects.toMatchObject({code:'MFA_REQUIRED'});
  expect(deps.upsert).not.toHaveBeenCalled();
});
it('fails closed when either policy or trusted-session storage is unavailable', async () => {
  deps.trusted.mockResolvedValue({data:null,error:{message:'offline'}});
  await expect(getAuthenticatedUser()).rejects.toMatchObject({code:'AUTH_INTERNAL_ERROR'});
  deps.trusted.mockResolvedValue({data:null,error:null});
  deps.policy.mockRejectedValue(new Error('offline'));
  await expect(getAuthenticatedUser()).rejects.toMatchObject({code:'AUTH_INTERNAL_ERROR'});
  expect(deps.upsert).not.toHaveBeenCalled();
});
