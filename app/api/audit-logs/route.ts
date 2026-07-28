import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs } from "@/app/actions/audit-logs";
import {
  auditActionSchema,
  type AuditAction,
  type AuditFilters,
} from "@/schemas";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const actionRaw = searchParams.get("actionType");
    const searchQuery = searchParams.get("searchQuery")?.trim() || undefined;
    const performedBy = searchParams.get("performedBy")?.trim() || undefined;
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");

    const actionParsed = actionRaw
      ? auditActionSchema.safeParse(actionRaw)
      : null;
    if (actionRaw && !actionParsed?.success) {
      return NextResponse.json(
        { error: "Invalid actionType filter" },
        { status: 400 },
      );
    }

    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return NextResponse.json(
        { error: "Invalid date range filter" },
        { status: 400 },
      );
    }

    const filters: AuditFilters = {
      actionType: (actionParsed?.data ?? undefined) as AuditAction | undefined,
      searchQuery,
      performedBy,
      dateRange: from && to ? { from, to } : undefined,
    };

    const result = await getAuditLogs(filters);
    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || "Failed to fetch audit logs" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch audit logs",
      },
      { status: 500 },
    );
  }
}
