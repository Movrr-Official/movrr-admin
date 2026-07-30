export {
  DASHBOARD_CAPABILITY_SURFACES,
  getSurfaceForCapability,
  getPageRequiredCapabilities,
  canAccessPage,
  getSearchEntityCapability,
  getCommandRequiredCapability,
  getActionRequiredCapability,
  getExportRequiredCapability,
  filterSurfacesByCapabilities,
} from "@/features/authorization/dashboardRegistry";

export {
  generateNavigationFromCapabilities,
  filterGeneratedNavigation,
  canSeeNavHref,
} from "@/features/authorization/navigation";

export {
  SOD_RULES,
  canApproveWorkflow,
  canInitiateWorkflow,
  assertSameActorSod,
  capabilityRequiredToAssignRole,
  roleAssignmentRequiresSecurityApproval,
} from "@/features/authorization/sod";

export {
  resolveDataScope,
  canAccessRecord,
  describeDataScope,
} from "@/features/authorization/dataScope";

export {
  simulateEmployeeRole,
  simulateAllEmployeeRoles,
  inspectCapabilitiesForRole,
  verifyPageCapabilityAlignment,
} from "@/features/authorization/diagnostics";
