/**
 * Capability-first authorization helpers for the MOVRR Admin dashboard.
 *
 * Prefer these over role allow-lists. Role constants are retained only as
 * legacy migration shims and for identity validation (admin_users.role).
 */

import type { UserRole } from "@/schemas";
import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import {
  capabilitiesForEmployeeRole,
  employeeHasCapability,
  employeeHasAnyCapability,
  isEmployeeRole,
  isReadOnlyEmployeeRole,
  normalizeEmployeeRole,
  DASHBOARD_EMPLOYEE_ROLES,
  type EmployeeRole,
} from "@/features/organisations/domain/employeeRoleTemplates";

export const normalizeAdminRole = (
  role?: string | null,
): UserRole | undefined => {
  const normalized = normalizeEmployeeRole(role);
  return normalized as UserRole | undefined;
};

/** All roles permitted to access the admin dashboard (login gate). */
export const DASHBOARD_ACCESS_ROLES = DASHBOARD_EMPLOYEE_ROLES as unknown as readonly UserRole[];

/**
 * @deprecated Prefer requireCapability / capability checks.
 * Kept for gradual migration of call sites that still pass role arrays.
 */
export const ADMIN_ONLY_ROLES = [
  "admin",
  "super_admin",
  "operations_manager",
  "security_admin",
] as const satisfies readonly UserRole[];

/**
 * @deprecated Prefer capability checks (routes.read / workboard.access).
 */
export const ADMIN_MODERATOR_ROLES = [
  "admin",
  "super_admin",
  "operations_manager",
  "moderator",
  "product_operations",
] as const satisfies readonly UserRole[];

/**
 * @deprecated Prefer programmes.read / compliance.read capabilities.
 */
export const COMPLIANCE_ROLES = [
  "admin",
  "super_admin",
  "operations_manager",
  "compliance_officer",
  "compliance_analyst",
] as const satisfies readonly UserRole[];

export const READ_ONLY_DASHBOARD_ROLES = [
  "compliance_officer",
  "compliance_analyst",
  "government",
  "programme_operations_manager",
  "executive_viewer",
] as const satisfies readonly UserRole[];

const READ_ONLY_ROLE_SET = new Set<string>(READ_ONLY_DASHBOARD_ROLES);

export const NOTIFICATION_READ_ROLES = DASHBOARD_ACCESS_ROLES;

/**
 * @deprecated Prefer notifications.send capability.
 */
export const NOTIFICATION_WRITE_ROLES = [
  "admin",
  "super_admin",
  "operations_manager",
  "moderator",
  "product_operations",
  "support_lead",
  "trust_safety_analyst",
  "support_agent",
] as const satisfies readonly UserRole[];

export const isReadOnlyAdminRole = (role?: string | null) => {
  if (isReadOnlyEmployeeRole(role)) return true;
  const normalized = normalizeAdminRole(role);
  return normalized ? READ_ONLY_ROLE_SET.has(normalized) : false;
};

/**
 * Legacy permission-string bridge.
 * Maps old `module:action` strings onto KnownCapability for gradual migration.
 */
export const LEGACY_PERMISSION_TO_CAPABILITY: Record<string, KnownCapability> = {
  "dashboard:read": "dashboard.read",
  "users:read": "users.read",
  "users:write": "users.manage",
  "routes:read": "routes.read",
  "routes:write": "routes.write",
  "campaigns:read": "campaigns.read",
  "campaigns:write": "campaigns.write",
  "rewards:read": "rewards.catalog.read",
  "rewards:write": "rewards.manage",
  "settings:read": "settings.manage",
  "settings:write": "settings.manage",
  "notifications:read": "notifications.read",
  "notifications:write": "notifications.send",
  "exports:write": "exports.execute",
  "privacy:erase": "privacy.erase",
};

/**
 * @deprecated Use capabilitiesForEmployeeRole — retained for search/legacy callers.
 */
export const ROLE_PERMISSIONS: Partial<Record<UserRole, string[]>> = {
  // Populated dynamically via hasAdminPermission → capability check
};

export function hasAdminPermission(
  role: string | null | undefined,
  permission: string,
): boolean {
  const normalized = normalizeAdminRole(role);
  if (!normalized) return false;

  if (permission === "*") {
    return employeeHasCapability(normalized, "authz.manage") ||
      normalized === "super_admin";
  }

  const capability =
    LEGACY_PERMISSION_TO_CAPABILITY[permission] ??
    (permission.includes(".") ? permission : undefined);

  if (!capability) {
    // Unknown legacy string — deny
    return false;
  }

  return employeeHasCapability(normalized, capability);
}

export function hasCapability(
  role: string | null | undefined,
  capability: KnownCapability | string,
): boolean {
  return employeeHasCapability(role, capability);
}

export function hasAnyCapability(
  role: string | null | undefined,
  capabilities: readonly (KnownCapability | string)[],
): boolean {
  return employeeHasAnyCapability(role, capabilities);
}

export function getCapabilitiesForRole(
  role: string | null | undefined,
): KnownCapability[] {
  return capabilitiesForEmployeeRole(role);
}

export function isDashboardRole(role: string | null | undefined): boolean {
  return isEmployeeRole(role);
}

export type { EmployeeRole, KnownCapability };
