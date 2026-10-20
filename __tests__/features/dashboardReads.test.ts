import { beforeEach, expect, it, vi } from "vitest";
const readers = vi.hoisted(() => ({ users: vi.fn(), riders: vi.fn(), campaigns: vi.fn(), routes: vi.fn(), rewards: vi.fn(), distance: vi.fn(), rides: vi.fn(), analytics: vi.fn() }));
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
