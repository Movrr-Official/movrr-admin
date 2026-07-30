/**
 * Shared employee role options for admin user management UI.
 * Labels come from EMPLOYEE_ROLE_TEMPLATES — no duplicated permission logic.
 */

import {
  CANONICAL_EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_TEMPLATES,
  type CanonicalEmployeeRole,
} from "@/features/organisations/domain/employeeRoleTemplates";

export type EmployeeRoleOption = {
  value: CanonicalEmployeeRole;
  label: string;
  description: string;
  department: string;
};

export const EMPLOYEE_ROLE_OPTIONS: EmployeeRoleOption[] =
  CANONICAL_EMPLOYEE_ROLES.map((id) => {
    const template = EMPLOYEE_ROLE_TEMPLATES[id];
    return {
      value: id,
      label: template.label,
      description: template.description,
      department: template.department,
    };
  });

/** Product roles assignable alongside employee roles in user management. */
export const PRODUCT_ROLE_OPTIONS = [
  { value: "rider" as const, label: "Rider", description: "End-user rider account" },
  {
    value: "advertiser" as const,
    label: "Advertiser",
    description: "Advertiser product account",
  },
];

export function getEmployeeRoleLabel(role: string | null | undefined): string {
  if (!role) return "Unknown";
  const template =
    EMPLOYEE_ROLE_TEMPLATES[role as CanonicalEmployeeRole] ??
    Object.values(EMPLOYEE_ROLE_TEMPLATES).find((t) => t.id === role);
  if (template) return template.label;
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
