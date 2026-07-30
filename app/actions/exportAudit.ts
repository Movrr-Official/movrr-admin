"use server";

import { randomUUID } from "crypto";
import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";
import { getExportRequiredCapability } from "@/features/authorization/dashboardRegistry";

export type AuditedExportInput = {
  module: string;
  format: string;
  rowCount: number;
  filename?: string;
  reason?: string;
  /** CSV / JSON payload produced server-side — never from unaudited clients. */
  content: string;
  contentType?: string;
};

export type AuditedExportResult =
  | {
      success: true;
      correlationId: string;
      filename: string;
      content: string;
      contentType: string;
    }
  | { success: false; error: string };

const EXPORT_RATE_WINDOW_MS = 60_000;
const EXPORT_RATE_LIMIT = 20;
const exportRateBucket = new Map<string, { count: number; windowStart: number }>();

function checkExportRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = exportRateBucket.get(userId);
  if (!entry || now - entry.windowStart > EXPORT_RATE_WINDOW_MS) {
    exportRateBucket.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= EXPORT_RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

/**
 * Capability-gated, audited export. All dashboard exports must go through this.
 */
export async function executeAuditedExport(
  input: AuditedExportInput,
): Promise<AuditedExportResult> {
  const correlationId = randomUUID();
  try {
    const required =
      getExportRequiredCapability(input.module) ?? "exports.execute";
    const auth = await requireCapability(required, { mutation: true });

    if (!checkExportRateLimit(auth.authUser.id)) {
      return {
        success: false,
        error: "Export rate limit exceeded. Try again shortly.",
      };
    }

    if (!input.content || input.rowCount < 0) {
      return { success: false, error: "Invalid export payload." };
    }

    const filename =
      input.filename ??
      `movrr-${input.module}-export-${new Date().toISOString().slice(0, 10)}.${input.format}`;
    const contentType =
      input.contentType ??
      (input.format === "json"
        ? "application/json"
        : "text/csv;charset=utf-8;");

    const supabaseAdmin = createSupabaseAdminClient();
    await supabaseAdmin.from("audit_log").insert({
      action: "Data Export",
      result: "success",
      performed_by: {
        id: auth.authUser.id,
        email: auth.authUser.email,
        role: auth.adminUser.role,
      },
      affected_entity: {
        type: "export",
        module: input.module,
        format: input.format,
        row_count: input.rowCount,
        filename,
      },
      metadata: {
        module: input.module,
        format: input.format,
        rowCount: input.rowCount,
        reason: input.reason ?? null,
        correlationId,
      },
    });

    return {
      success: true,
      correlationId,
      filename,
      content: input.content,
      contentType,
    };
  } catch (error) {
    logger.warn("Audited export failed", {
      error: error instanceof Error ? error.message : String(error),
      module: input.module,
      correlationId,
    });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Export authorization failed",
    };
  }
}

/**
 * Record-only path for callers that already produced content client-side
 * during migration. Prefer executeAuditedExport.
 * @deprecated
 */
export async function recordDataExport(input: {
  module: string;
  format: string;
  rowCount: number;
  filename?: string;
  reason?: string;
}) {
  try {
    const required =
      getExportRequiredCapability(input.module) ?? "exports.execute";
    const auth = await requireCapability(required, { mutation: true });
    const correlationId = randomUUID();

    const supabaseAdmin = createSupabaseAdminClient();
    await supabaseAdmin.from("audit_log").insert({
      action: "Data Export",
      result: "success",
      performed_by: {
        id: auth.authUser.id,
        email: auth.authUser.email,
        role: auth.adminUser.role,
      },
      affected_entity: {
        type: "export",
        module: input.module,
        format: input.format,
        row_count: input.rowCount,
        filename: input.filename ?? null,
      },
      metadata: {
        module: input.module,
        format: input.format,
        rowCount: input.rowCount,
        reason: input.reason ?? null,
        correlationId,
        legacyClientExport: true,
      },
    });

    return { success: true as const, correlationId };
  } catch (error) {
    logger.warn("Failed to record data export audit event", {
      error: error instanceof Error ? error.message : String(error),
      module: input.module,
    });
    return { success: false as const };
  }
}
