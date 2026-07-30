/**
 * Authorization diagnostics — role simulator, capability inspection, conflict detection.
 */

import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import {
  CANONICAL_EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_TEMPLATES,
  capabilitiesForEmployeeRole,
  getEmployeeRoleTemplate,
  type CanonicalEmployeeRole,
} from "@/features/organisations/domain/employeeRoleTemplates";
import {
  canAccessPage,
  filterSurfacesByCapabilities,
  getNavigationSurfaces,
  DASHBOARD_CAPABILITY_SURFACES,
} from "@/features/authorization/dashboardRegistry";
import {
  filterGeneratedNavigation,
  generateNavigationFromCapabilities,
} from "@/features/authorization/navigation";
import { SOD_RULES } from "@/features/authorization/sod";
import { resolveDataScope } from "@/features/authorization/dataScope";

export type RoleSimulationResult = {
  role: CanonicalEmployeeRole;
  label: string;
  department: string;
  capabilities: KnownCapability[];
  navigationHrefs: string[];
  pages: string[];
  commands: string[];
  exportModules: string[];
  sodApprovals: string[];
  dataScope: string;
  conflicts: string[];
};

function detectCapabilityConflicts(capabilities: KnownCapability[]): string[] {
  const set = new Set(capabilities);
  const conflicts: string[] = [];

  for (const rule of SOD_RULES) {
    if (!rule.preventSameActor) continue;
    const { initiateCapability, approveCapability } = rule.approval;
    if (
      initiateCapability !== approveCapability &&
      set.has(initiateCapability) &&
      set.has(approveCapability)
    ) {
      conflicts.push(
        `${rule.id}: role holds both ${initiateCapability} and ${approveCapability} (SoD relies on same-actor checks)`,
      );
    }
  }

  if (set.has("users.role.assign") && set.has("users.role.approve")) {
    conflicts.push(
      "role_assignment: assign + approve both granted — privileged promotion must still use same-actor SoD",
    );
  }

  return conflicts;
}

export function simulateEmployeeRole(
  role: CanonicalEmployeeRole,
): RoleSimulationResult {
  const template = EMPLOYEE_ROLE_TEMPLATES[role];
  const capabilities = capabilitiesForEmployeeRole(role);
  const granted = new Set(capabilities);
  const surfaces = filterSurfacesByCapabilities(granted);
  const nav = filterGeneratedNavigation(
    generateNavigationFromCapabilities(),
    granted,
  );

  const navigationHrefs: string[] = [];
  for (const entry of nav) {
    if (entry.type === "group") {
      for (const child of entry.children) navigationHrefs.push(child.href);
    } else {
      navigationHrefs.push(entry.href);
    }
  }

  const pages = [
    ...new Set(surfaces.flatMap((s) => s.pages ?? [])),
  ].sort();
  const commands = [
    ...new Set(surfaces.flatMap((s) => s.commands ?? [])),
  ].sort();
  const exportModules = [
    ...new Set(surfaces.flatMap((s) => s.exportModules ?? [])),
  ].sort();
  const sodApprovals = SOD_RULES.filter((r) =>
    granted.has(r.approval.approveCapability),
  ).map((r) => r.id);

  return {
    role,
    label: template.label,
    department: template.department,
    capabilities,
    navigationHrefs,
    pages,
    commands,
    exportModules,
    sodApprovals,
    dataScope: resolveDataScope(role),
    conflicts: detectCapabilityConflicts(capabilities),
  };
}

export function simulateAllEmployeeRoles(): RoleSimulationResult[] {
  return CANONICAL_EMPLOYEE_ROLES.map(simulateEmployeeRole);
}

export function inspectCapabilitiesForRole(role: string | null | undefined) {
  const template = getEmployeeRoleTemplate(role);
  const capabilities = capabilitiesForEmployeeRole(role);
  return {
    role,
    template: template
      ? {
          id: template.id,
          label: template.label,
          department: template.department,
          readOnly: Boolean(template.readOnly),
          dataScope: template.dataScope,
        }
      : null,
    capabilities,
    navigation: filterGeneratedNavigation(
      generateNavigationFromCapabilities(),
      capabilities,
    ),
    surfaces: filterSurfacesByCapabilities(capabilities),
  };
}

export function verifyPageCapabilityAlignment(): {
  path: string;
  capabilities: string[];
  ok: boolean;
}[] {
  const paths = new Set<string>();
  for (const surface of DASHBOARD_CAPABILITY_SURFACES) {
    for (const page of surface.pages ?? []) paths.add(page);
  }
  for (const surface of getNavigationSurfaces()) {
    if (surface.navigation) paths.add(surface.navigation.href);
  }

  return [...paths].sort().map((path) => {
    const sampleRole = "operations_manager";
    const caps = capabilitiesForEmployeeRole(sampleRole);
    return {
      path,
      capabilities: caps.filter((c) => {
        const surface = DASHBOARD_CAPABILITY_SURFACES.find(
          (s) => s.capability === c && s.pages?.includes(path),
        );
        return Boolean(surface);
      }),
      ok: canAccessPage(path, caps),
    };
  });
}
