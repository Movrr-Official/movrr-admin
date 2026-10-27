import { expect, it, vi } from "vitest";
import { runRideSettlementWorker } from "@/lib/services/rideSettlementWorker";
it("uses bounded existing settlement processing and identifier-free health", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: 0, error: null })
    .mockResolvedValueOnce({ data: { delayed: 0 }, error: null });
  expect(await runRideSettlementWorker({ rpc })).toEqual({
    processing: [],
    delivery: 0,
    health: { delayed: 0 },
  });
  expect(rpc.mock.calls).toEqual([
    ["claim_ride_processing_v3", { p_limit: 5 }],
    ["deliver_ride_outcomes_v3", { p_limit: 20 }],
    ["ride_settlement_health_v3"],
  ]);
});
it("does not conceal processing failures", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: null, error: { message: "private error" } });
  await expect(runRideSettlementWorker({ rpc })).rejects.toThrow(
    "ride_processing_rpc_failed",
  );
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('only returns allowlisted aggregate health counts', async () => {
  const rpc=vi.fn().mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:0,error:null}).mockResolvedValueOnce({data:{delayed:1,evidenceAbsent:2,workerDiagnostics:3,privateSql:'never expose'},error:null});
  expect((await runRideSettlementWorker({rpc})).health).toEqual({delayed:1,evidenceAbsent:2,workerDiagnostics:3});
});
it('rejects malformed health instead of hiding an operational fault', async () => {
  const rpc=vi.fn().mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:0,error:null}).mockResolvedValueOnce({data:{delayed:'secret'},error:null});
  await expect(runRideSettlementWorker({rpc})).rejects.toThrow('ride_processing_health_contract');
});
