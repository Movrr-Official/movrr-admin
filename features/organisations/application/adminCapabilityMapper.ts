/**
 * Maps internal admin_users / employee roles onto domain capability strings.
 * Consumes employee role templates — does not embed grants on the role enum alone.
 */

import { normalizeAdminRole } from "@/lib/authPermissions";
import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import { capabilitiesForEmployeeRole } from "@/features/organisations/domain/employeeRoleTemplates";

export function mapAdminRoleToCapabilities(
  role: string | undefined | null,
): KnownCapability[] {
  const normalized = normalizeAdminRole(role);
  if (!normalized) return [];
  return capabilitiesForEmployeeRole(normalized);
}
