import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

const TARGET = process.env.ROUTE_OPTIMIZER_URL || "http://localhost:5000";
const SERVICE_TOKEN =
  process.env.ROUTE_OPTIMIZER_TOKEN || process.env.ROUTE_OPTIMIZER_KEY || "";

async function requireAdminOrDeny() {
  try {
    return await requireAdmin();
  } catch (err) {
    return null;
  }
}

export async function GET() {
  try {
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
    const headers: Record<string, string> = {};
    if (SERVICE_TOKEN) headers["authorization"] = `Bearer ${SERVICE_TOKEN}`;

    const res = await fetch(`${TARGET}/health`, {
      method: "GET",
      headers,
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "request_failed" }, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, OPTIONS" },
  });
}
