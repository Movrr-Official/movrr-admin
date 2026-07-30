import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";

export type PlatformInvitationsReadiness = {
  ready: boolean;
  tableOk: boolean;
  acceptRpcOk: boolean;
  expireRpcOk: boolean;
  pendingUniqueOk: boolean;
  legacyTableAbsent: boolean;
  detail: string;
};

type ReadyRow = {
  ready: boolean;
  table_ok: boolean;
  accept_rpc_ok: boolean;
  expire_rpc_ok: boolean;
  pending_unique_ok: boolean;
  legacy_table_absent: boolean;
  detail: string;
};

/**
 * Fail-closed probe for Migration 050.
 * Missing schema / RPCs / leftover legacy table => not ready.
 */
export async function assertPlatformInvitationsReady(
  client: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<ApplicationResult<PlatformInvitationsReadiness>> {
  const { data, error } = await client.rpc("platform_invitations_ready");

  if (error) {
    return fail(
      "migration_missing",
      `Platform invitations are not deployed (Migration 050 required). Diagnostics: ${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as ReadyRow | null;
  if (!row) {
    return fail(
      "migration_missing",
      "Platform invitations readiness probe returned empty. Apply scripts/050_platform_invitations.sql.",
    );
  }

  const readiness: PlatformInvitationsReadiness = {
    ready: Boolean(row.ready),
    tableOk: Boolean(row.table_ok),
    acceptRpcOk: Boolean(row.accept_rpc_ok),
    expireRpcOk: Boolean(row.expire_rpc_ok),
    pendingUniqueOk: Boolean(row.pending_unique_ok),
    legacyTableAbsent: Boolean(row.legacy_table_absent),
    detail: row.detail || "unknown",
  };

  if (!readiness.ready) {
    return fail(
      "migration_incomplete",
      `Platform invitations incomplete: ${readiness.detail}`,
    );
  }

  return ok(readiness);
}
