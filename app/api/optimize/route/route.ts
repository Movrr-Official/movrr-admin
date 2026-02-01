import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  ROUTE_OPTIMIZER_KEY,
  ROUTE_OPTIMIZER_TOKEN,
  ROUTE_OPTIMIZER_URL,
} from "@/lib/env";

const TARGET = ROUTE_OPTIMIZER_URL || "http://localhost:5000";
const SERVICE_TOKEN = ROUTE_OPTIMIZER_TOKEN || ROUTE_OPTIMIZER_KEY || "";

const MAX_LOCATIONS = 80;
const MAX_BODY_BYTES = 200_000;

const locationSchema = z.object({
  id: z.string().optional(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  name: z.string().optional(),
});

const preferencesSchema = z
  .object({
    max_duration_minutes: z.number().int().min(5).max(720).optional(),
    avoid_traffic: z.boolean().optional(),
    include_rest_stops: z.boolean().optional(),
    weather_consideration: z.boolean().optional(),
    time_of_day: z.string().max(32).optional(),
    priority: z.string().max(32).optional(),
  })
  .partial();

const optimizeRequestSchema = z
  .object({
    start_index: z.number().int().min(0).optional(),
    locations: z.array(locationSchema).min(2).max(MAX_LOCATIONS),
    edge_penalties: z.array(z.array(z.number().finite().min(0))).optional(),
    preferences: preferencesSchema.optional(),
    context: z.any().optional(),
  })
  .passthrough();

function makeTraceId(req: Request) {
  try {
    const incoming =
      req.headers.get("x-trace-id") || req.headers.get("x-request-id");
    return (
      incoming ||
      (typeof crypto !== "undefined" && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : String(Date.now()))
    );
  } catch (e) {
    return String(Date.now());
  }
}

async function requireAdminOrDeny() {
  try {
    return await requireAdmin();
  } catch (err) {
    return null;
  }
}

async function persistRun(data: {
  traceId: string;
  authUserId: string;
  adminUserId?: string | null;
  status: "success" | "error";
  requestPayload: unknown;
  responsePayload?: unknown;
  error?: string | null;
  durationMs: number;
  locationsCount: number;
  startIndex?: number | null;
}) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("route_optimizer_runs").insert({
      trace_id: data.traceId,
      auth_user_id: data.authUserId,
      admin_user_id: data.adminUserId,
      status: data.status,
      request_payload: data.requestPayload,
      response_payload: data.responsePayload ?? null,
      error: data.error ?? null,
      duration_ms: data.durationMs,
      locations_count: data.locationsCount,
      start_index: data.startIndex ?? null,
    });
  } catch (err) {
    console.warn("route optimizer run persistence failed");
  }
}

function sanitizeOptimizeRequest(payload: {
  start_index?: number;
  locations: Array<{ id?: string; lat: number; lng: number }>;
  preferences?: Record<string, unknown>;
  context?: unknown;
}) {
  const campaign = (payload.context as any)?.campaign;
  return {
    locations_count: payload.locations.length,
    start_index: payload.start_index ?? null,
    preferences: payload.preferences ?? null,
    campaign: campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          campaignType: campaign.campaignType,
        }
      : null,
  };
}

function sanitizeOptimizeResponse(payload: any) {
  if (!payload) return null;
  return {
    metrics: payload.metrics ?? null,
    score: payload.score ?? null,
    warnings: payload.warnings ?? null,
    model_version: payload.model_version ?? null,
    solver_version: payload.solver_version ?? null,
    trace_id: payload.trace_id ?? null,
  };
}

export async function POST(req: Request) {
  const admin = await requireAdminOrDeny();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!SERVICE_TOKEN) {
    return NextResponse.json(
      { error: "optimizer_unavailable" },
      { status: 503 },
    );
  }

  const traceId = makeTraceId(req);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const startedAt = Date.now();
  let requestPayload: unknown = null;
  try {
    try {
      requestPayload = await req.json();
    } catch (err) {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const payloadBytes = new TextEncoder().encode(
      JSON.stringify(requestPayload),
    ).length;
    if (payloadBytes > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }

    const parsed = optimizeRequestSchema.safeParse(requestPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { locations, start_index, edge_penalties } = parsed.data;
    if (typeof start_index === "number" && start_index >= locations.length) {
      return NextResponse.json(
        { error: "invalid_start_index" },
        { status: 400 },
      );
    }

    if (edge_penalties) {
      const sizeOk =
        edge_penalties.length === locations.length &&
        edge_penalties.every((row) => row.length === locations.length);
      if (!sizeOk) {
        return NextResponse.json(
          { error: "invalid_edge_penalties" },
          { status: 400 },
        );
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Trace-Id": traceId,
    };
    if (SERVICE_TOKEN) {
      headers["authorization"] = `Bearer ${SERVICE_TOKEN}`;
    }

    const res = await fetch(`${TARGET}/optimize`, {
      method: "POST",
      headers,
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    const contentType = res.headers.get("content-type") || "";
    let responsePayload: unknown = null;
    let responseText: string | null = null;
    if (contentType.includes("application/json")) {
      responsePayload = await res.json();
    } else {
      responseText = await res.text();
    }

    await persistRun({
      traceId,
      authUserId: admin.authUser.id,
      adminUserId: admin.adminUser?.id ?? null,
      status: res.ok ? "success" : "error",
      requestPayload: sanitizeOptimizeRequest(parsed.data),
      responsePayload: sanitizeOptimizeResponse(responsePayload),
      error: res.ok ? null : `upstream_${res.status}`,
      durationMs,
      locationsCount: locations.length,
      startIndex: typeof start_index === "number" ? start_index : null,
    });

    if (contentType.includes("application/json")) {
      return NextResponse.json(responsePayload, { status: res.status });
    }

    return new NextResponse(responseText ?? "", {
      status: res.status,
      headers: { "content-type": contentType || "application/json" },
    });
  } catch (err: any) {
    const isAbort = err && err.name === "AbortError";
    const durationMs = Date.now() - startedAt;
    await persistRun({
      traceId,
      authUserId: admin.authUser.id,
      adminUserId: admin.adminUser?.id ?? null,
      status: "error",
      requestPayload:
        requestPayload && (requestPayload as any)?.locations
          ? sanitizeOptimizeRequest(requestPayload as any)
          : requestPayload,
      error: isAbort ? "upstream_timeout" : "request_failed",
      durationMs,
      locationsCount: Array.isArray((requestPayload as any)?.locations)
        ? (requestPayload as any).locations.length
        : 0,
      startIndex:
        typeof (requestPayload as any)?.start_index === "number"
          ? (requestPayload as any).start_index
          : null,
    });
    return NextResponse.json(
      { error: isAbort ? "upstream_timeout" : "request_failed" },
      { status: isAbort ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS" },
  });
}
