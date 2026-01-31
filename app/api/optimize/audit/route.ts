import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

const TARGET = process.env.ROUTE_OPTIMIZER_URL || "http://localhost:5000";
const SERVICE_TOKEN =
  process.env.ROUTE_OPTIMIZER_TOKEN || process.env.ROUTE_OPTIMIZER_KEY || "";

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

async function forwardResponse(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": contentType || "application/json" },
  });
}

async function requireAdminOrDeny() {
  try {
    return await requireAdmin();
  } catch (err) {
    return null;
  }
}

export async function GET(req: Request) {
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
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit") || "50";
    const limit = Number(limitParam);
    if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
      return NextResponse.json({ error: "invalid_limit" }, { status: 400 });
    }
    const headers: Record<string, string> = { "X-Trace-Id": traceId };
    if (SERVICE_TOKEN) headers["authorization"] = `Bearer ${SERVICE_TOKEN}`;

    const res = await fetch(
      `${TARGET}/audit/previous-token-usage?limit=${encodeURIComponent(
        String(limit),
      )}`,
      {
        method: "GET",
        headers,
        signal: controller.signal,
      },
    );

    return await forwardResponse(res);
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
    headers: { Allow: "GET, OPTIONS" },
  });
}
