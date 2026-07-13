import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getResolvedPlatformSettingsValues,
  loadSettingsRows,
  mergeSettingsRows,
} from "@/lib/platformSettings";

export type PrivacyRetentionJobResult = {
  success: true;
  data: {
    waitlistDeleted: number;
    auditDeleted: number;
    executedAt: string;
    waitlistCutoff: string;
    auditCutoff: string;
  };
};

/**
 * Internal privacy retention job — NOT a server action.
 * Invoke only from authenticated cron routes or admin-only tooling.
 */
export async function executePrivacyRetentionJob(): Promise<PrivacyRetentionJobResult> {
  const supabaseAdmin = createSupabaseAdminClient();
  const values = await getResolvedPlatformSettingsValues();

  const waitlistCutoff = new Date();
  waitlistCutoff.setDate(
    waitlistCutoff.getDate() - values.privacy.waitlistRetentionDays,
  );

  const auditCutoff = new Date();
  auditCutoff.setDate(
    auditCutoff.getDate() - values.security.auditRetentionDays,
  );

  const { data: staleWaitlistRows } = await supabaseAdmin
    .from("waitlist")
    .select("id", { count: "exact" })
    .lt("created_at", waitlistCutoff.toISOString())
    .eq("converted_to_user", false);

  const { error: deleteWaitlistError } = await supabaseAdmin
    .from("waitlist")
    .delete()
    .lt("created_at", waitlistCutoff.toISOString())
    .eq("converted_to_user", false);

  if (deleteWaitlistError) {
    throw new Error(deleteWaitlistError.message);
  }

  const { data: staleAuditRows } = await supabaseAdmin
    .from("audit_log")
    .select("id", { count: "exact" })
    .lt("timestamp", auditCutoff.toISOString())
    .neq("action", "System Settings Changed");

  const { error: deleteAuditError } = await supabaseAdmin
    .from("audit_log")
    .delete()
    .lt("timestamp", auditCutoff.toISOString())
    .neq("action", "System Settings Changed");

  if (deleteAuditError) {
    throw new Error(deleteAuditError.message);
  }

  const executedAt = new Date().toISOString();

  const currentRows = await loadSettingsRows();
  const currentValues = mergeSettingsRows(currentRows);
  const privacyRow = currentRows.find((r) => r.key === "privacy");
  const nextPrivacyValue = {
    ...(privacyRow?.value ?? currentValues.privacy),
    retentionLastRunAt: executedAt,
  };

  await supabaseAdmin
    .from("platform_settings")
    .upsert(
      { key: "privacy", value: nextPrivacyValue, updated_at: executedAt },
      { onConflict: "key" },
    );

  try {
    await supabaseAdmin.rpc("purge_stale_gps_points", {
      p_retention_days: values.privacy.gpsRetentionDays,
    });
  } catch {
    // RPC available after scripts/034_phase3_storage_gps_retention.sql
  }

  return {
    success: true,
    data: {
      waitlistDeleted: staleWaitlistRows?.length ?? 0,
      auditDeleted: staleAuditRows?.length ?? 0,
      executedAt,
      waitlistCutoff: waitlistCutoff.toISOString(),
      auditCutoff: auditCutoff.toISOString(),
    },
  };
}
