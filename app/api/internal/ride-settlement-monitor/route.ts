import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeEqualBearerToken } from "@/lib/secureCompare";
import { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";
import { runRideOperationsMonitor } from "@/lib/services/rideOperationsMonitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
  const token = process.env.RIDE_SETTLEMENT_MONITOR_TOKEN;
  if (!token || token.length < 32 || !safeEqualBearerToken(request.headers.get("authorization") || "", token))
    return respond({ error: "unauthorized" }, 401);
  if (process.env.RIDE_SETTLEMENT_ALERTS_ENABLED !== "true") return respond({ enabled: false });
  try {
    const client = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await runRideOperationsMonitor(client);
    // Non-success tells the independent scheduler that delivery needs operational attention.
    return respond(result, result.deadLetters || result.failed ? 503 : 200);
  } catch {
    return respond({ error: "ride_operations_monitor_failed" }, 503);
  }
}
