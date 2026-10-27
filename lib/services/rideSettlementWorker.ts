export type RideWorkerRpc = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};
export async function runRideSettlementWorker(client: RideWorkerRpc) {
  const result = await client.rpc("claim_ride_processing_v3", { p_limit: 5 });
  if (result.error) throw new Error("ride_processing_rpc_failed");
  if (!Array.isArray(result.data) || result.data.length > 5)
    throw new Error("ride_processing_claim_contract");
  const processing: unknown[] = [];
  for (const claim of result.data as Array<{
    sessionId: string;
    leaseToken: string;
  }>) {
    if (
      !/^[a-f0-9-]{36}$/.test(claim.sessionId) ||
      !/^[a-f0-9-]{36}$/.test(claim.leaseToken)
    )
      throw new Error("ride_processing_claim_contract");
    const execution = await client.rpc("execute_ride_processing_claim_v3", {
      p_session: claim.sessionId,
      p_token: claim.leaseToken,
    });
    if (execution.error) throw new Error("ride_processing_execution_failed");
    processing.push(execution.data);
  }
  const delivery = await client.rpc("deliver_ride_outcomes_v3", {
    p_limit: 20,
  });
  if (delivery.error) throw new Error("ride_outcome_delivery_failed");
  const health = await client.rpc("ride_settlement_health_v3");
  if (health.error) throw new Error("ride_processing_health_failed");
  // Allowlisted counts only; never forward arbitrary RPC payloads to alert logs.
  const safeHealth: Record<string, number> = {};
  if (!health.data || typeof health.data !== 'object') throw new Error('ride_processing_health_contract');
  for (const key of ['delayed','overdueReviews','retryExhausted','historicalHolds','evidenceAbsent','workerDiagnostics']) {
    const value = (health.data as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('ride_processing_health_contract');
    safeHealth[key] = value as number;
  }
  return { processing, delivery: delivery.data, health: safeHealth };
}
