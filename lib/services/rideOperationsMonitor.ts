import type { RideWorkerRpc } from "./rideSettlementWorker";

// Database-derived counts only. Raw SQL diagnostics and arbitrary RPC fields never leave here.
export async function runRideOperationsMonitor(client: RideWorkerRpc) {
  const { data, error } = await client.rpc("monitor_ride_operations_v3");
  if (error || !data || typeof data !== "object") throw new Error("ride_operations_monitor_failed");
  const source = data as Record<string, unknown>;
  if (source.enabled === false) return { enabled: false };
  if (source.enabled !== true) throw new Error("ride_operations_monitor_contract");
  const counts: Record<string, number | boolean> = { enabled: true };
  for (const key of ["delivered", "failed", "pending", "deadLetters", "unacknowledged"]) {
    if (!Number.isSafeInteger(source[key]) || (source[key] as number) < 0)
      throw new Error("ride_operations_monitor_contract");
    counts[key] = source[key] as number;
  }
  return counts;
}

export async function recordWorkerHeartbeat(client: RideWorkerRpc, outcome: "succeeded" | "failed", correlation: string) {
  const { error } = await client.rpc("record_ride_worker_heartbeat", { p_outcome: outcome, p_correlation: correlation });
  if (error) throw new Error("ride_worker_heartbeat_failed");
}

export async function recordWatchdogHeartbeat(client: RideWorkerRpc, outcome: "succeeded" | "failed", correlation: string) {
  const { data, error } = await client.rpc("record_ride_watchdog_heartbeat", { p_outcome: outcome, p_correlation: correlation });
  if (error || !data || (data as Record<string, unknown>).recorded !== true) throw new Error("ride_watchdog_heartbeat_failed");
}
