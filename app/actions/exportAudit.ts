"use server";

import { requireMutatingAdminRoles } from "@/lib/admin";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";

export async function recordDataExport(input: {
  module: string;
  format: string;
  rowCount: number;
  filename?: string;
}) {
  try {
    const auth = await requireMutatingAdminRoles(ADMIN_ONLY_ROLES);

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
      },
    });

    return { success: true as const };
  } catch (error) {
    logger.warn("Failed to record data export audit event", {
      error: error instanceof Error ? error.message : String(error),
      module: input.module,
    });
    return { success: false as const };
  }
}
