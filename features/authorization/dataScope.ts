/**
 * Data authorization foundations for future ABAC.
 * Current dashboard remains globally visible for granted capabilities;
 * scopes are declared so modules can adopt them without redesigning AuthZ.
 */

import type { DataScopePreset } from "@/features/organisations/domain/employeeRoleTemplates";
import { getEmployeeRoleTemplate } from "@/features/organisations/domain/employeeRoleTemplates";
import { getSurfaceForCapability } from "@/features/authorization/dashboardRegistry";
import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";

export type DataScopeAttributes = {
  department?: string | null;
  programmeId?: string | null;
  assignmentId?: string | null;
  region?: string | null;
  country?: string | null;
  businessUnit?: string | null;
  organisationId?: string | null;
};

export type DataAccessContext = {
  role: string | null | undefined;
  capability: KnownCapability | string;
  attributes?: DataScopeAttributes;
  /** Record-level attributes to evaluate (future ABAC). */
  record?: DataScopeAttributes;
};

/**
 * Phase 9 foundation: always allows when capability is granted.
 * Returns the declared scope preset so callers can begin filtering when ready.
 */
export function resolveDataScope(
  role: string | null | undefined,
  capability?: KnownCapability | string,
): DataScopePreset {
  if (capability) {
    const surface = getSurfaceForCapability(capability);
    if (surface) return surface.dataScope;
  }
  return getEmployeeRoleTemplate(role)?.dataScope ?? "global";
}

/**
 * Future ABAC gate. Today: capability grant ⇒ allow (global visibility preserved).
 * When record attributes are provided and scope !== global, returns whether
 * a future matcher would apply — currently always true to avoid behaviour change.
 */
export function canAccessRecord(ctx: DataAccessContext): boolean {
  void ctx;
  // Preserve existing global visibility. Wire attribute matchers in a later phase.
  return true;
}

export function describeDataScope(preset: DataScopePreset): string {
  switch (preset) {
    case "global":
      return "All platform records visible to the capability holder";
    case "department":
      return "Scoped to the operator department (future)";
    case "programme":
      return "Scoped to assigned government programmes (future)";
    case "assignment":
      return "Scoped to assigned work queue items (future)";
    case "region":
      return "Scoped to geographic region / country (future)";
    case "organisation":
      return "Scoped to partner / advertiser organisation (future)";
    default:
      return "Unknown scope";
  }
}
