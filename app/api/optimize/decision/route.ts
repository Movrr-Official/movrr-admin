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

const MAX_BODY_BYTES = 100_000;

const decisionSchema = z
  .object({
    action: z.enum(["accept", "reject"]),
    route: z.any().optional(),
    trace_id: z.string().max(200).optional(),
    metadata: z.any().optional(),
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

async function persistDecision(data: {
  traceId: string;
  authUserId: string;
  adminUserId?: string | null;
  action: "accept" | "reject";
  routePayload?: unknown;
  metadata?: unknown;
}) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("route_optimizer_decisions").insert({
      trace_id: data.traceId,
      auth_user_id: data.authUserId,
      admin_user_id: data.adminUserId,
      action: data.action,
      route_payload: data.routePayload ?? null,
      metadata: data.metadata ?? null,
    });
  } catch (err) {
    console.warn("route optimizer decision persistence failed");
  }
}

function sanitizeDecisionPayload(payload: any) {
  if (!payload) return null;
  const route = payload.route;
  const locationsCount = Array.isArray(route?.route)
    ? route.route.length
    : Array.isArray(route?.locations)
      ? route.locations.length
      : null;
  return {
    action: payload.action,
    trace_id: payload.trace_id,
    route_summary: {
      locations_count: locationsCount,
      metrics: route?.metrics ?? null,
      warnings: route?.warnings ?? null,
      model_version: route?.model_version ?? null,
      solver_version: route?.solver_version ?? null,
      route_trace_id: route?.trace_id ?? null,
    },
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
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const payloadBytes = new TextEncoder().encode(JSON.stringify(body)).length;
    if (payloadBytes > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }

    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Trace-Id": traceId,
    };
    if (SERVICE_TOKEN) {
      headers["authorization"] = `Bearer ${SERVICE_TOKEN}`;
    }

    const res = await fetch(`${TARGET}/decision`, {
      method: "POST",
      headers,
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") || "";
    let responsePayload: unknown = null;
    let responseText: string | null = null;
    if (contentType.includes("application/json")) {
      responsePayload = await res.json();
    } else {
      responseText = await res.text();
    }

    await persistDecision({
      traceId: parsed.data.trace_id || traceId,
      authUserId: admin.authUser.id,
      adminUserId: admin.adminUser?.id ?? null,
      action: parsed.data.action,
      routePayload: sanitizeDecisionPayload(parsed.data),
      metadata: parsed.data.metadata,
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
