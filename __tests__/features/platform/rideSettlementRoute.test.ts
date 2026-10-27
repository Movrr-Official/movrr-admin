import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  create: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@/lib/maintenanceAuth", () => ({
  isAuthorizedMaintenanceRequest: mocks.authorized,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
vi.mock("@/lib/env", () => ({
  NEXT_PUBLIC_SUPABASE_URL: "https://invalid.example",
  SUPABASE_SERVICE_ROLE_KEY: "test-only",
}));
vi.mock("@/lib/services/rideSettlementWorker", () => ({
  runRideSettlementWorker: mocks.run,
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import { POST } from "@/app/api/internal/ride-settlement/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RIDE_SETTLEMENT_WORKER_ENABLED", "false");
  vi.stubEnv("RIDE_SETTLEMENT_ALERTS_ENABLED", "false");
  mocks.authorized.mockReturnValue(true);
});

it("records an invocation heartbeat without changing the financial worker contract", async () => {
  vi.stubEnv("RIDE_SETTLEMENT_WORKER_ENABLED", "true");
  vi.stubEnv("RIDE_SETTLEMENT_ALERTS_ENABLED", "true");
  const rpc = vi.fn().mockResolvedValue({ data: { recorded: true }, error: null });
  mocks.create.mockReturnValue({ rpc });
  mocks.run.mockResolvedValue({ processing: [], delivery: 0, health: {} });
  expect((await POST(new Request("https://invalid.example"))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("record_ride_worker_heartbeat", { p_outcome: "succeeded", p_correlation: expect.any(String) });
  mocks.run.mockRejectedValue(Error("private SQL"));
  expect((await POST(new Request("https://invalid.example"))).status).toBe(503);
  expect(rpc).toHaveBeenLastCalledWith("record_ride_worker_heartbeat", { p_outcome: "failed", p_correlation: expect.any(String) });
});
it("rejects unauthorized calls before constructing a privileged client", async () => {
  mocks.authorized.mockReturnValue(false);
  expect((await POST(new Request("https://invalid.example"))).status).toBe(401);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("defaults to disabled without claiming jobs", async () => {
  const r = await POST(new Request("https://invalid.example"));
  expect(await r.json()).toEqual({ enabled: false });
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("contains operational errors without returning private SQL details", async () => {
  vi.stubEnv("RIDE_SETTLEMENT_WORKER_ENABLED", "true");
  mocks.run.mockRejectedValue(new Error("private SQL"));
  const r = await POST(new Request("https://invalid.example"));
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: "ride_processing_failed" });
});

it("contains privileged client configuration failures", async () => {
  vi.stubEnv("RIDE_SETTLEMENT_WORKER_ENABLED", "true");
  mocks.create.mockImplementationOnce(() => { throw Error("private configuration"); });
  const response = await POST(new Request("https://invalid.example"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "ride_processing_failed" });
});

it('signals evidence absence and diagnostic failures through the existing alert event', async () => {
  vi.stubEnv('RIDE_SETTLEMENT_WORKER_ENABLED','true');
  mocks.run.mockResolvedValue({processing:[],delivery:0,health:{delayed:0,evidenceAbsent:1,workerDiagnostics:1}});
  const r=await POST(new Request('https://invalid.example'));
  expect(r.status).toBe(200);
  const {logger}=await import('@/lib/logger');
  expect(logger.warn).toHaveBeenCalledWith('ride_settlement_operational_alert',{delayed:0,evidenceAbsent:1,workerDiagnostics:1});
});
