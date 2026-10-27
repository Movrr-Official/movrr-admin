import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedMaintenanceRequest } from "@/lib/maintenanceAuth";
import { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";
import { runRideSettlementWorker } from "@/lib/services/rideSettlementWorker";
import { logger } from "@/lib/logger";
import { recordWorkerHeartbeat } from "@/lib/services/rideOperationsMonitor";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const respond = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "cache-control": "no-store" },
    });
  if (!isAuthorizedMaintenanceRequest(request))
    return respond({ error: "unauthorized" }, 401);
  // Prepared schedules stay inactive until deployment and both gate layers are approved.
  if (process.env.RIDE_SETTLEMENT_WORKER_ENABLED !== "true")
    return respond({ enabled: false });
  const correlation = randomUUID();
  let client: ReturnType<typeof createClient> | undefined;
  try {
    client = createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const result = await runRideSettlementWorker(client);
    if (process.env.RIDE_SETTLEMENT_ALERTS_ENABLED === "true")
      await recordWorkerHeartbeat(client, "succeeded", correlation);
    const health = result.health as {
      delayed?: number;
      overdueReviews?: number;
      retryExhausted?: number;
      evidenceAbsent?: number;
      workerDiagnostics?: number;
    };
    if (health.delayed || health.overdueReviews || health.retryExhausted || health.evidenceAbsent || health.workerDiagnostics)
      logger.warn("ride_settlement_operational_alert", health);
    return respond(result);
  } catch {
    if (client && process.env.RIDE_SETTLEMENT_ALERTS_ENABLED === "true") {
      try { await recordWorkerHeartbeat(client, "failed", correlation); }
      catch { logger.warn("ride_worker_heartbeat_unavailable", { correlationId: correlation }); }
    }
    logger.error(
      "ride_settlement_worker_failed",
      new Error("ride_processing_failed"),
    );
    return respond({ error: "ride_processing_failed" }, 503);
  }
}
