/**
 * Separation of Duties rules for privileged operational workflows.
 * Creator and approver capabilities must differ when sodStrict is true.
 */

import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import {
  DASHBOARD_CAPABILITY_SURFACES,
  type ApprovalRequirement,
} from "@/features/authorization/dashboardRegistry";
import {
  PRIVILEGED_ASSIGNABLE_ROLES,
  NON_PRIVILEGED_ASSIGNABLE_ROLES,
  type CanonicalEmployeeRole,
} from "@/features/organisations/domain/employeeRoleTemplates";

export type SodWorkflowId =
  | "campaign_approval"
  | "reward_approval"
  | "partner_approval"
  | "route_approval"
  | "role_assignment"
  | "export_audit";

export type SodRule = {
  id: SodWorkflowId;
  label: string;
  approval: ApprovalRequirement;
  /** When true, same actor may not both initiate and approve. */
  preventSameActor: boolean;
};

export const SOD_RULES: readonly SodRule[] = [
  {
    id: "campaign_approval",
    label: "Campaign creation vs approval",
    approval: {
      initiateCapability: "campaigns.write",
      approveCapability: "campaigns.approve",
      sodStrict: true,
    },
    preventSameActor: true,
  },
  {
    id: "reward_approval",
    label: "Reward creation vs approval",
    approval: {
      initiateCapability: "rewards.manage",
      approveCapability: "rewards.approve",
      sodStrict: true,
    },
    preventSameActor: true,
  },
  {
    id: "partner_approval",
    label: "Partner onboarding vs approval",
    approval: {
      initiateCapability: "resources.manage",
      approveCapability: "partners.approve",
      sodStrict: true,
    },
    preventSameActor: true,
  },
  {
    id: "route_approval",
    label: "Route creation vs approval",
    approval: {
      initiateCapability: "routes.write",
      approveCapability: "routes.approve",
      sodStrict: true,
    },
    preventSameActor: true,
  },
  {
    id: "role_assignment",
    label: "Privileged role assignment vs security approval",
    approval: {
      initiateCapability: "users.role.assign",
      approveCapability: "users.role.approve",
      sodStrict: true,
    },
    preventSameActor: true,
  },
  {
    id: "export_audit",
    label: "Exports require audit capability",
    approval: {
      initiateCapability: "exports.execute",
      approveCapability: "exports.execute",
      sodStrict: false,
    },
    preventSameActor: false,
  },
];

export function getSodRule(id: SodWorkflowId): SodRule | undefined {
  return SOD_RULES.find((r) => r.id === id);
}

/**
 * Whether an actor with `granted` capabilities may perform the approve step.
 * For sodStrict workflows, holding initiate alone is insufficient.
 */
export function canApproveWorkflow(
  workflowId: SodWorkflowId,
  granted: ReadonlySet<string> | readonly string[],
): boolean {
  const rule = getSodRule(workflowId);
  if (!rule) return false;
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(rule.approval.approveCapability);
}

export function canInitiateWorkflow(
  workflowId: SodWorkflowId,
  granted: ReadonlySet<string> | readonly string[],
): boolean {
  const rule = getSodRule(workflowId);
  if (!rule) return false;
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(rule.approval.initiateCapability);
}

/**
 * Same-actor SoD check: returns false when the same userId both created and is approving.
 */
export function assertSameActorSod(input: {
  workflowId: SodWorkflowId;
  initiatorUserId: string | null | undefined;
  approverUserId: string | null | undefined;
}): { ok: true } | { ok: false; reason: string } {
  const rule = getSodRule(input.workflowId);
  if (!rule || !rule.preventSameActor) return { ok: true };
  if (!input.initiatorUserId || !input.approverUserId) return { ok: true };
  if (input.initiatorUserId === input.approverUserId) {
    return {
      ok: false,
      reason: `Separation of Duties: initiator cannot approve (${rule.label}).`,
    };
  }
  return { ok: true };
}

export function roleAssignmentRequiresSecurityApproval(
  targetRole: CanonicalEmployeeRole | string,
): boolean {
  return (PRIVILEGED_ASSIGNABLE_ROLES as readonly string[]).includes(targetRole);
}

export function isNonPrivilegedAssignableRole(
  targetRole: CanonicalEmployeeRole | string,
): boolean {
  return (NON_PRIVILEGED_ASSIGNABLE_ROLES as readonly string[]).includes(
    targetRole,
  );
}

/** Capability required to assign a given employee role. */
export function capabilityRequiredToAssignRole(
  targetRole: CanonicalEmployeeRole | string,
): KnownCapability {
  if (roleAssignmentRequiresSecurityApproval(targetRole)) {
    return "users.role.approve";
  }
  return "users.role.assign";
}

export function listSodSurfacesFromRegistry(): ApprovalRequirement[] {
  return DASHBOARD_CAPABILITY_SURFACES.filter((s) => s.approval).map(
    (s) => s.approval!,
  );
}
