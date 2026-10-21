/** Capability checks resolve canonical employee memberships only. */
import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import { capabilitiesForEmployeeRole, employeeHasCapability, employeeHasAnyCapability, isEmployeeRole,
  isReadOnlyEmployeeRole, type EmployeeRole } from "@/features/organisations/domain/employeeRoleTemplates";
export const isReadOnlyAdminRole = isReadOnlyEmployeeRole;
export const hasCapability = employeeHasCapability;
export const hasAnyCapability = employeeHasAnyCapability;
export const getCapabilitiesForRole = capabilitiesForEmployeeRole;
export const isDashboardRole = isEmployeeRole;
export type { EmployeeRole, KnownCapability };
