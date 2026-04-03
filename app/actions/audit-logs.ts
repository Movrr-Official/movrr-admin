"use server";

import { DASHBOARD_ACCESS_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { AuditFilters, AuditLog } from "@/schemas";

const normalizeAuditLog = (row: Record<string, unknown>): AuditLog => {
  const performedBy = (row.performedBy as AuditLog["performedBy"]) ||
    (row.performed_by as AuditLog["performedBy"]) || {
      id: String(row.performed_by_id ?? row.performedById ?? ""),
      name: String(row.performed_by_name ?? row.performedByName ?? "System"),
      email: String(row.performed_by_email ?? row.performedByEmail ?? ""),
      role: String(row.performed_by_role ?? row.performedByRole ?? ""),
    };

  const affectedEntity =
    (row.affectedEntity as AuditLog["affectedEntity"]) ||
    (row.affected_entity as AuditLog["affectedEntity"]) ||
    (row.entity as AuditLog["affectedEntity"]) ||
    undefined;

  const timestamp =
    (row.timestamp as string) ||
    (row.created_at as string) ||
    (row.createdAt as string) ||
    new Date().toISOString();

  return {
    id: String(row.id ?? crypto.randomUUID()),
    action: row.action as AuditLog["action"],
    result:
      typeof row.result === "string"
        ? ((row.result.charAt(0).toUpperCase() +
            row.result.slice(1).toLowerCase()) as AuditLog["result"])
        : undefined,
    performedBy,
    affectedEntity,
    timestamp,
    sourceIp: (row.sourceIp ?? row.source_ip) as string | undefined,
    geoLocation: (row.geoLocation ??
      row.geo_location) as AuditLog["geoLocation"],
    userAgent: (row.userAgent ?? row.user_agent) as string | undefined,
    resourceId: (row.resourceId ?? row.resource_id) as string | undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
  };
};

const filterAuditLogs = (logs: AuditLog[], filters?: AuditFilters) => {
  let result = [...logs];

  if (filters?.actionType && filters.actionType !== "all") {
    result = result.filter((log) => log.action === filters.actionType);
  }

  if (filters?.performedBy) {
    const query = filters.performedBy.toLowerCase();
    result = result.filter(
      (log) =>
        log.performedBy.name.toLowerCase().includes(query) ||
        log.performedBy.email.toLowerCase().includes(query),
    );
  }

  if (filters?.searchQuery?.trim()) {
    const query = filters.searchQuery.toLowerCase();
    result = result.filter((log) => {
      const actionMatch = log.action?.toLowerCase().includes(query);
      const entityMatch = log.affectedEntity?.name
        ?.toLowerCase()
        .includes(query);
      const actorMatch =
        log.performedBy.name.toLowerCase().includes(query) ||
        log.performedBy.email.toLowerCase().includes(query);
      const ipMatch = log.sourceIp?.toLowerCase().includes(query);
      const userAgentMatch = log.userAgent?.toLowerCase().includes(query);
      const entryPath =
        typeof log.metadata?.entry_path === "string"
          ? log.metadata.entry_path.toLowerCase()
          : undefined;

      return Boolean(
        actionMatch ||
          entityMatch ||
          actorMatch ||
          ipMatch ||
          userAgentMatch ||
          entryPath?.includes(query),
      );
    });
  }

  if (filters?.dateRange?.from || filters?.dateRange?.to) {
    const startDate = filters.dateRange?.from;
    const endDate = filters.dateRange?.to;
    result = result.filter((log) => {
      const logDate = new Date(log.timestamp);
      if (startDate && logDate < startDate) return false;
      if (endDate && logDate > endDate) return false;
      return true;
    });
  }

  return result;
};

export async function getAuditLogs(
  filters?: AuditFilters,
): Promise<{ success: boolean; data?: AuditLog[]; error?: string }> {
  try {
    await requireAdminRoles(DASHBOARD_ACCESS_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    const tryFetch = async (tableName: string) => {
      const { data, error } = await supabaseAdmin
        .from(tableName)
        .select("*")
        .order("timestamp", { ascending: false });
      return { data, error };
    };

    const primary = await tryFetch("audit_log");
    if (!primary.error && primary.data) {
      const logs = primary.data.map((row) => normalizeAuditLog(row));
      return { success: true, data: filterAuditLogs(logs, filters) };
    }

    const fallback = await tryFetch("audit_logs");
    if (!fallback.error && fallback.data) {
      const logs = fallback.data.map((row) => normalizeAuditLog(row));
      return { success: true, data: filterAuditLogs(logs, filters) };
    }

    const errorMessage = primary.error?.message || fallback.error?.message;
    return {
      success: false,
      error: errorMessage || "Failed to fetch audit logs",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch audit logs",
    };
  }
}
