import type { UserRole } from "@/schemas";

export const normalizeAdminRole = (
  role?: string | null,
): UserRole | undefined => {
  if (!role) return undefined;
  return role.replace("-", "_") as UserRole;
};

export const ADMIN_ONLY_ROLES = [
  "admin",
  "super_admin",
] as const satisfies readonly UserRole[];

export const DASHBOARD_ACCESS_ROLES = [
  "admin",
  "super_admin",
  "moderator",
  "support",
  "compliance_officer",
  "government",
] as const satisfies readonly UserRole[];

export const ADMIN_MODERATOR_ROLES = [
  "admin",
  "super_admin",
  "moderator",
] as const satisfies readonly UserRole[];

export const COMPLIANCE_ROLES = [
  "admin",
  "super_admin",
  "compliance_officer",
] as const satisfies readonly UserRole[];

export const READ_ONLY_DASHBOARD_ROLES = [
  "compliance_officer",
  "government",
] as const satisfies readonly UserRole[];

const READ_ONLY_ROLE_SET = new Set<string>(READ_ONLY_DASHBOARD_ROLES);

export const NOTIFICATION_READ_ROLES = DASHBOARD_ACCESS_ROLES;

export const NOTIFICATION_WRITE_ROLES = ADMIN_MODERATOR_ROLES;

export const isReadOnlyAdminRole = (role?: string | null) => {
  const normalized = normalizeAdminRole(role);
  return normalized ? READ_ONLY_ROLE_SET.has(normalized) : false;
};

export const ROLE_PERMISSIONS: Partial<Record<UserRole, string[]>> = {
  super_admin: ["*"],
  admin: [
    "dashboard:read",
    "users:read",
    "users:write",
    "routes:read",
    "routes:write",
    "campaigns:read",
    "campaigns:write",
    "rewards:read",
    "rewards:write",
    "settings:read",
    "settings:write",
    "notifications:read",
    "notifications:write",
    "exports:write",
    "privacy:erase",
  ],
  moderator: [
    "dashboard:read",
    "users:read",
    "routes:read",
    "campaigns:read",
    "rewards:read",
    "notifications:read",
  ],
  support: [
    "dashboard:read",
    "users:read",
    "routes:read",
    "campaigns:read",
    "rewards:read",
    "notifications:read",
  ],
  compliance_officer: [
    "dashboard:read",
    "users:read",
    "campaigns:read",
    "rewards:read",
    "notifications:read",
  ],
  government: [
    "dashboard:read",
    "users:read",
    "campaigns:read",
    "rewards:read",
    "notifications:read",
  ],
};

export function hasAdminPermission(
  role: string | null | undefined,
  permission: string,
): boolean {
  const normalized = normalizeAdminRole(role);
  if (!normalized) return false;
  const perms = ROLE_PERMISSIONS[normalized] ?? [];
  return perms.includes("*") || perms.includes(permission);
}
