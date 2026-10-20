import { beforeEach, expect, it, vi } from "vitest";
const readers = vi.hoisted(() => ({ users: vi.fn(), riders: vi.fn(), campaigns: vi.fn(), routes: vi.fn(), rewards: vi.fn(), distance: vi.fn(), rides: vi.fn(), analytics: vi.fn(), counts: vi.fn(), adminUser: vi.fn(), settings: vi.fn(), incidents: vi.fn(), monitor: vi.fn(), intake: vi.fn(), permission: vi.fn(), settingsRows: vi.fn() }));
vi.mock("@/app/actions/count", () => ({getDashboardCounts: readers.counts}));
vi.mock("@/app/actions/admin", () => ({getCurrentAdminUser: readers.adminUser}));
vi.mock("@/app/actions/settings", () => ({getAdminSettings: readers.settings}));
vi.mock("@/app/actions/incidents", () => ({getOpenIncidentCount: readers.incidents}));
vi.mock("@/app/actions/accountDeletion", () => ({getAccountDeletionMonitor: readers.monitor}));
vi.mock("@/app/actions/accountDeletionIntake", () => ({getDeletionIntakeControl: readers.intake}));
vi.mock("@/lib/admin", () => ({requireCapability: readers.permission}));
vi.mock("@/lib/platformSettings", () => ({loadSettingsRows: readers.settingsRows, mergeSettingsRows: (rows: unknown) => rows}));
vi.mock("@/app/actions/users", () => ({ getUsers: readers.users }));
vi.mock("@/app/actions/riders", () => ({ getRiders: readers.riders }));
vi.mock("@/app/actions/campaigns", () => ({ getCampaigns: readers.campaigns }));
vi.mock("@/app/actions/routes", () => ({ getRoutes: readers.routes }));
vi.mock("@/app/actions/rewards", () => ({ getRewardStats: readers.rewards }));
vi.mock("@/app/actions/rideSessions", () => ({ getDistanceStats: readers.distance, getRideSessions: readers.rides }));
vi.mock("@/app/actions/sessionAnalytics", () => ({ getSessionAnalytics: readers.analytics }));
import { GET } from "@/app/api/dashboard/reads/[resource]/route";
const read = (resource: string, args: unknown[] = []) => GET(new Request(`https://admin.test/api/dashboard/reads/${resource}?${new URLSearchParams({args: JSON.stringify(args)})}`), { params: Promise.resolve({resource}) });
beforeEach(() => { for (const reader of Object.values(readers)) reader.mockReset().mockResolvedValue({success: true, data: []}); });
it("preserves reader authorization failures and never caches private responses", async () => {
  readers.users.mockResolvedValue({success: false, error: "Not authorized"});
  const response = await read("users");
  expect(await response.json()).toEqual({success: false, error: "Not authorized"});
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
});
it("validates filter dates and passes selected-account filters to the existing reader", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  await read("users", [{dateRange:{from:"2026-10-01T00:00:00Z"}}, [id]]);
  expect(readers.users).toHaveBeenCalledWith({dateRange:{from:new Date("2026-10-01T00:00:00Z")}}, [id]);
  readers.users.mockClear();
  expect((await read("users", [{dateRange:{from:"invalid"}}])).status).toBe(400);
  expect(readers.users).not.toHaveBeenCalled();
});
it("rejects invalid pagination and non-read resources before invoking readers", async () => {
  expect((await read("rideSessions", [{pageSize:201}])).status).toBe(400);
  expect((await read("adjustPoints")).status).toBe(404);
  expect(readers.rides).not.toHaveBeenCalled();
});
it("independent GET readers can finish while another section is waiting", async () => {
  let release!: (value: unknown) => void;
  readers.users.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const pending = read("users");
  const independent = await read("routes");
  expect(independent.status).toBe(200);
  release({success:true,data:[]});
  expect((await pending).status).toBe(200);
});
it("does not fabricate data on unexpected backend failure", async () => {
  readers.rewards.mockRejectedValue(new Error("private internal error"));
  const response = await read("rewardStats");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:"Dashboard data unavailable"});
});
it.each([['counts','counts'],['adminUser','adminUser'],['settings','settings'],['openIncidents','incidents'],['deletionMonitor','monitor'],['deletionIntake','intake']] as const)("dispatches %s to its existing guarded reader without a Server Action", async (resource, reader) => {
  expect((await read(resource)).status).toBe(200);
  expect(readers[reader]).toHaveBeenCalledOnce();
});
it("loads only maintenance fields, preserves the settings permission, and avoids external probes", async () => {
  readers.settingsRows.mockResolvedValue({general:{maintenanceMode:true,maintenanceScope:'global',maintenanceMessage:'Scheduled work',appVersion:'0.1.0',supportEmail:'private'}});
  const result = await read('maintenance');
  expect(await result.json()).toEqual({maintenanceMode:true,maintenanceScope:'global',maintenanceMessage:'Scheduled work',appVersion:'0.1.0'});
  expect(readers.permission).toHaveBeenCalledWith('settings.manage');
  expect(readers.settings).not.toHaveBeenCalled();
  readers.permission.mockRejectedValue(new Error('restricted'));
  readers.settingsRows.mockClear();
  expect((await read('maintenance')).status).toBe(503);
  expect(readers.settingsRows).not.toHaveBeenCalled();
});
