import type { AuditLog } from "@/schemas";

export const ADMIN_SESSION_ACTIVITY_ACTION = "dashboard_session_started";
export const ADMIN_DASHBOARD_SESSION_AUDIT_ACTION =
  "Admin dashboard session started";

const readMetadataString = (
  metadata: Record<string, unknown> | undefined,
  key: string,
) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export const isAdminDashboardSessionLog = (
  log: Pick<AuditLog, "action">,
): boolean => log.action === ADMIN_DASHBOARD_SESSION_AUDIT_ACTION;

export const formatRoleLabel = (role?: string) => {
  if (!role) return "Unknown role";

  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

export const getAuditLogEntryPath = (log: AuditLog) =>
  readMetadataString(log.metadata, "entry_path") ??
  log.affectedEntity?.name ??
  "System";

export const getAuditLogSourceIp = (log: AuditLog) =>
  log.sourceIp ?? readMetadataString(log.metadata, "source_ip");

export const getAuditLogUserAgent = (log: AuditLog) =>
  log.userAgent ?? readMetadataString(log.metadata, "user_agent");

export const getAuditLogResultLabel = (log: AuditLog) => {
  if (!log.result) return undefined;

  const normalized = log.result.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
