import type { AuditLog } from "@/schemas";

export const ADMIN_SESSION_ACTIVITY_ACTION = "dashboard_session_started";
export const ADMIN_DASHBOARD_SESSION_AUDIT_ACTION =
  "Admin dashboard session started";
export const ADMIN_MFA_ENROLLED_AUDIT_ACTION = "Admin MFA enrolled";
export const ADMIN_MFA_CHALLENGE_AUDIT_ACTION = "Admin MFA challenged";
export const ADMIN_MFA_FACTOR_REMOVED_AUDIT_ACTION = "Admin MFA factor removed";
export const ADMIN_MFA_RECOVERY_RESET_AUDIT_ACTION = "Admin MFA recovery reset";
export const ADMIN_MFA_ENROLLED_ACTIVITY_ACTION = "mfa_enrolled";
export const ADMIN_MFA_CHALLENGE_ACTIVITY_ACTION = "mfa_challenged";
export const ADMIN_MFA_FACTOR_REMOVED_ACTIVITY_ACTION = "mfa_factor_removed";
export const ADMIN_MFA_RECOVERY_RESET_ACTIVITY_ACTION = "mfa_recovery_reset";

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
