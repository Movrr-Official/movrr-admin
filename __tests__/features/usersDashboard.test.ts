import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), rpc: vi.fn(), activity: vi.fn(), rows: {} as Record<string, any[]>, fail: "", cap: 500, searches: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin", () => ({ requireCapability: state.authorize }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ from: state.from, rpc: state.rpc }) }));
vi.mock("@/lib/activitySignals", () => ({ fetchLatestUserActivitySignalMap: state.activity, resolveLatestIsoTimestamp: (...values: string[]) => values.find(Boolean) }));
vi.mock("@/lib/accountActivity", () => ({ fetchAccountActivityMap: state.activity }));
vi.mock("@/lib/env", () => ({ APP_URL: "https://example.test", FROM_EMAIL: "test@example.test", RESEND_API_KEY: "test-only" }));
vi.mock("@/lib/platformSettings", () => ({}));
import { getUsers } from "@/app/actions/users";
import { readAllRows } from "@/lib/supabase/readAllRows";

const account = (id: string, status = "active") => ({ id, name: id, email: `${id}@example.test`, status, created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z" });
const membership = (id: string, type: string, role = "viewer", status = "active") => ({ id: `${id}-${type}`, user_id: id, organisation_id: type, role, status, organisation: {name: type, type}, updated_at: "2026-10-21T00:00:00Z" });
beforeEach(() => {
  vi.clearAllMocks(); state.fail = ""; state.cap = 500; state.searches = [];
  state.rows = { user: [], rider: [], admin_users: [], organisation_membership: [] };
  state.authorize.mockResolvedValue({ authUser: {id: "operator"} });
  state.activity.mockResolvedValue(new Map());
  state.rpc.mockImplementation(async (name, args) => {
    expect(name).toBe("read_user_auth_sync_pending"); expect(args.p_actor).toBe("operator"); expect(args.p_users.length).toBeLessThanOrEqual(500);
    return {data: args.p_users.includes("multi") ? [{user_id: "multi"}] : [], error: null};
  });
  state.from.mockImplementation((table: string) => {
    if (table === "account_auth_sync") throw new Error("Private receipt access forbidden");
    let from = 0, to = 499, rows = [...(state.rows[table] ?? [])];
    const q: any = { select: () => q, order: () => q, range: (a: number, b: number) => {from=a;to=b;return q;},
      eq: (key: string, value: unknown) => {rows=rows.filter(row => row[key]===value);return q;},
      or: (value: string) => {state.searches.push(value);return q;},
      gte: (key: string, value: string) => {rows=rows.filter(row => row[key]>=value);return q;},
      lte: (key: string, value: string) => {rows=rows.filter(row => row[key]<=value);return q;},
      then: (resolve: (value: unknown) => void) => Promise.resolve(state.fail===table ? {data:null,error:{message:`permission denied: ${table}`}} : {data:rows.slice(from,Math.min(to+1,from+state.cap)),error:null}).then(resolve) };
    return q;
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Users dashboard authoritative handler", () => {
  it("keeps every independent account, actual relationships, statuses and distinct users", async () => {
    state.rows.user = ["only", "rider", "partner", "advertiser", "government", "staff", "multi"].map(id=>account(id));
    state.rows.user.push(account("suspended", "suspended"), account("pending", "pending"));
    state.rows.rider = [{user_id:"rider",status:"active"},{user_id:"multi",status:"inactive"},{user_id:"multi",status:"inactive"}];
    state.rows.admin_users = [{user_id:"staff",role:"support_agent"},{user_id:"multi",role:"super_admin"}];
    state.rows.organisation_membership = [membership("partner","reward_partner"),membership("advertiser","advertiser"),membership("government","government"),membership("multi","reward_partner"),membership("multi","advertiser"),membership("only","government","viewer","revoked")];
    const result = await getUsers(); expect(result.success).toBe(true); expect(result.data).toHaveLength(9);
    expect(result.data?.find(u=>u.id==="only")?.domains).toEqual([]);
    expect(result.data?.find(u=>u.id==="rider")?.memberships).toEqual([]);
    expect(result.data?.find(u=>u.id==="multi")).toMatchObject({domains:["rider","staff","partner","advertiser"],authSyncPending:true});
    expect(result.data?.find(u=>u.id==="suspended")?.status).toBe("inactive");
    expect((await getUsers({role:"unassigned"})).data?.map(u=>u.id)).toEqual(["only","suspended","pending"]);
    expect((await getUsers({role:"partner"})).data?.map(u=>u.id)).toEqual(["partner","multi"]);
    expect((await getUsers({role:"rider",status:"active"})).data).toHaveLength(2);
    expect((await getUsers(undefined,["advertiser"])).data?.map(u=>u.id)).not.toContain("multi");
  });
  it("fetches all users and relationships beyond the API cap, even a reduced cap", async () => {
    state.cap=37; state.rows.user=Array.from({length:1207},(_,i)=>account(`u${i}`));
    state.rows.rider=state.rows.user.map(u=>({user_id:u.id,status:"active"}));
    state.rows.admin_users=state.rows.user.map(u=>({user_id:u.id,role:"support_agent"}));
    state.rows.organisation_membership=state.rows.user.map(u=>membership(u.id,"government"));
    const result=await getUsers(); expect(result.data).toHaveLength(1207);
    expect(result.data?.every(u=>u.domains?.length===3)).toBe(true); expect(state.rpc).toHaveBeenCalledTimes(3);
  });
  it("distinguishes a genuine empty database from table, RPC and timeout failures", async () => {
    expect(await getUsers()).toMatchObject({success:true,data:[]});
    state.rows.user=[account("only")]; state.fail="organisation_membership";
    expect(await getUsers()).toMatchObject({success:false,error:"permission denied: organisation_membership"});
    state.fail=""; state.rpc.mockResolvedValue({data:null,error:{message:"permission denied"}});
    expect(await getUsers()).toMatchObject({success:false,error:"permission denied"});
    state.rpc.mockRejectedValue(new Error("request timed out"));
    expect(await getUsers()).toMatchObject({success:false,error:"request timed out"});
  });
  it("denies unauthorized employees and external tenants before any data read", async () => {
    state.authorize.mockRejectedValue(new Error("Missing capability: users.read"));
    expect((await getUsers()).success).toBe(false); expect(state.from).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("marks partial activity failure without discarding real users or inventing activity", async () => {
    state.rows.user=[account("only")]; state.activity.mockRejectedValue(new Error("Auth offline"));
    const result=await getUsers(); expect(result.success).toBe(true); expect(result.data).toHaveLength(1); expect(result.data?.[0].lastActive).toBeUndefined(); expect(result.warnings).toHaveLength(1);
  });
  it("ignores legacy activity timestamps and a stale coarse Rider classification", async () => {
    state.rows.user=[{...account("partner"),role:"rider",last_active_at:"2026-10-21T00:00:00Z",last_login:"2026-10-21T00:00:00Z"}];
    state.rows.organisation_membership=[membership("partner","reward_partner","owner")];
    const result=await getUsers();
    expect(result.data?.[0]).toMatchObject({domains:["partner"],activityAvailable:true});
    expect(result.data?.[0].lastActive).toBeUndefined();
    expect((await getUsers({role:"rider"})).data).toEqual([]);
    expect((await getUsers({role:"partner"})).data).toHaveLength(1);
    state.activity.mockRejectedValue(new Error("unavailable"));
    expect((await getUsers()).data?.[0]).toMatchObject({activityAvailable:false});
  });
  it("quotes literal search input instead of allowing PostgREST filter injection", async () => {
    await getUsers({searchQuery:'a,b%_"\\'});
    expect(state.searches).toEqual([String.raw`name.ilike."%a,b\\%\\_\"\\\\%",email.ilike."%a,b\\%\\_\"\\\\%"`]);
  });
  it("never returns partial pages as complete after a later page fails", async () => {
    await expect(readAllRows(async from=>from ? {data:null,error:{message:"offline"}} : {data:[1],error:null})).rejects.toThrow("offline");
  });
});
