/**
 * Employee role templates for MOVRR Admin Operations Control Centre.
 *
 * Roles are curated capability bundles — never authorize against role names
 * in pages, actions, search, or APIs. Always resolve:
 *   Identity → Employee Role → Capability Bundle → Authorization Service → Assertion
 */

import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import { CAPABILITIES } from "@/features/organisations/domain/CapabilityCatalog";

/**
 * Canonical employee operating roles.
 * Legacy roles (admin, moderator, support, compliance_officer, government)
 * remain valid DB values and map through LEGACY_EMPLOYEE_ROLE_ALIASES.
 */
export const EMPLOYEE_ROLES = [
  "super_admin",
  "security_admin",
  "operations_manager",
  "platform_operator",
  "campaign_manager",
  "partner_operations_manager",
  "fraud_analyst",
  "trust_safety_analyst",
  "support_agent",
  "support_lead",
  "finance_operator",
  "compliance_analyst",
  "programme_operations_manager",
  "executive_viewer",
  "product_operations",
  "engineering_operations",
  // Legacy aliases retained for DB / migration compatibility
  "admin",
  "moderator",
  "support",
  "compliance_officer",
  "government",
] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

/** Roles that grant dashboard login (admin_users). */
export const DASHBOARD_EMPLOYEE_ROLES = EMPLOYEE_ROLES;

/** Canonical (non-legacy) role ids used in role management UI. */
export const CANONICAL_EMPLOYEE_ROLES = [
  "super_admin",
  "security_admin",
  "operations_manager",
  "platform_operator",
  "campaign_manager",
  "partner_operations_manager",
  "fraud_analyst",
  "trust_safety_analyst",
  "support_agent",
  "support_lead",
  "finance_operator",
  "compliance_analyst",
  "programme_operations_manager",
  "executive_viewer",
  "product_operations",
  "engineering_operations",
] as const satisfies readonly EmployeeRole[];

export type CanonicalEmployeeRole = (typeof CANONICAL_EMPLOYEE_ROLES)[number];

export const LEGACY_EMPLOYEE_ROLE_ALIASES: Record<string, CanonicalEmployeeRole> = {
  admin: "operations_manager",
  moderator: "product_operations",
  support: "support_agent",
  compliance_officer: "compliance_analyst",
  government: "programme_operations_manager",
};

export type DataScopePreset =
  | "global"
  | "department"
  | "programme"
  | "assignment"
  | "region"
  | "organisation";

export type EmployeeRoleTemplate = {
  id: CanonicalEmployeeRole | "super_admin";
  label: string;
  description: string;
  department: string;
  /** Bundle key in EMPLOYEE_BUNDLE_CAPABILITIES */
  bundleKey: string;
  dataScope: DataScopePreset;
  responsibilities: string[];
  /** When true, mutations that require write capabilities are denied even if read caps exist */
  readOnly?: boolean;
};

const uniqueCaps = (...groups: readonly KnownCapability[][]): KnownCapability[] => {
  const set = new Set<KnownCapability>();
  for (const group of groups) {
    for (const cap of group) set.add(cap);
  }
  return [...set];
};

const VIEWER_BASE: KnownCapability[] = [
  "dashboard.read",
  "notifications.read",
  "analytics.read",
  "analytics.view",
];

const SUPPORT_BASE: KnownCapability[] = [
  ...VIEWER_BASE,
  "users.read",
  "riders.read",
  "rides.read",
  "incidents.create",
  "incidents.read",
  "notifications.send",
];

const CAMPAIGN_OPS: KnownCapability[] = [
  "campaigns.read",
  "campaigns.write",
  "campaigns.launch",
  "campaigns.pause",
  "campaigns.publish",
  "campaigns.archive",
  "advertisers.manage",
  "community.manage",
];

const CAMPAIGN_APPROVE: KnownCapability[] = ["campaigns.approve"];

const PARTNER_OPS: KnownCapability[] = [
  "rewards.catalog.read",
  "rewards.manage",
  "fulfilment.read",
  "fulfilment.validate",
  "fulfilment.confirm",
  "fulfilment.cancel",
  "fulfilment.refund",
  "resources.manage",
  "wallet.read",
];

const PARTNER_APPROVE: KnownCapability[] = [
  "partners.approve",
  "rewards.approve",
];

const FRAUD_OPS: KnownCapability[] = [
  "fraud.review",
  "fraud.resolve",
  "rides.read",
  "rides.verify",
  "riders.read",
  "incidents.read",
  "incidents.create",
];

const PLATFORM_OPS: KnownCapability[] = [
  "platform.health.read",
  "platform.jobs.manage",
  "featureflags.manage",
  "incidents.read",
  "incidents.manage",
];

const COMPLIANCE_BASE: KnownCapability[] = [
  ...VIEWER_BASE,
  "programmes.read",
  "compliance.read",
  "impact.read",
  "campaigns.read",
  "rewards.catalog.read",
  "fulfilment.read",
  "users.read",
  "riders.read",
  "rides.read",
  "billing.read",
  "reports.read",
  "authz.inspect",
];

export const EMPLOYEE_BUNDLE_KEYS = {
  super_admin: "employee.super_admin",
  security_admin: "employee.security_admin",
  operations_manager: "employee.operations_manager",
  platform_operator: "employee.platform_operator",
  campaign_manager: "employee.campaign_manager",
  partner_operations_manager: "employee.partner_operations_manager",
  fraud_analyst: "employee.fraud_analyst",
  trust_safety_analyst: "employee.trust_safety_analyst",
  support_agent: "employee.support_agent",
  support_lead: "employee.support_lead",
  finance_operator: "employee.finance_operator",
  compliance_analyst: "employee.compliance_analyst",
  programme_operations_manager: "employee.programme_operations_manager",
  executive_viewer: "employee.executive_viewer",
  product_operations: "employee.product_operations",
  engineering_operations: "employee.engineering_operations",
} as const;

export const EMPLOYEE_BUNDLE_CAPABILITIES: Record<
  string,
  readonly KnownCapability[]
> = {
  [EMPLOYEE_BUNDLE_KEYS.super_admin]: [...CAPABILITIES],

  [EMPLOYEE_BUNDLE_KEYS.security_admin]: uniqueCaps(VIEWER_BASE, [
    "users.read",
    "users.role.approve",
    "settings.manage",
    "settings.security",
    "authz.inspect",
    "authz.manage",
    "break_glass.use",
    "delegation.manage",
    "exports.execute",
    "privacy.erase",
    "incidents.read",
    "incidents.manage",
    "fraud.review",
    "reports.read",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.operations_manager]: uniqueCaps(
    VIEWER_BASE,
    CAMPAIGN_OPS,
    CAMPAIGN_APPROVE,
    PARTNER_OPS,
    PARTNER_APPROVE,
    [
      "users.read",
      "users.manage",
      "users.role.assign",
      "waitlist.manage",
      "riders.read",
      "riders.manage",
      "rides.read",
      "rides.verify",
      "routes.read",
      "routes.write",
      "routes.approve",
      "fraud.review",
      "fraud.resolve",
      "incidents.read",
      "incidents.create",
      "incidents.manage",
      "notifications.send",
      "settings.manage",
      "exports.execute",
      "platform.health.read",
      "platform.jobs.manage",
      "billing.read",
      "billing.manage",
      "workboard.access",
      "programmes.read",
      "compliance.read",
      "impact.read",
      "protips.manage",
      "reports.read",
      "authz.inspect",
      "fulfilment.override",
      "staff.manage",
      "analytics.view",
    ],
  ),

  [EMPLOYEE_BUNDLE_KEYS.platform_operator]: uniqueCaps(VIEWER_BASE, PLATFORM_OPS, [
    "workboard.access",
    "authz.inspect",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.campaign_manager]: uniqueCaps(VIEWER_BASE, CAMPAIGN_OPS, [
    "routes.read",
    "riders.read",
    "rides.read",
    "exports.execute",
    "workboard.access",
    "reports.read",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.partner_operations_manager]: uniqueCaps(
    VIEWER_BASE,
    PARTNER_OPS,
    PARTNER_APPROVE,
    [
      "exports.execute",
      "workboard.access",
      "reports.read",
    ],
  ),

  [EMPLOYEE_BUNDLE_KEYS.fraud_analyst]: uniqueCaps(VIEWER_BASE, FRAUD_OPS, [
    "users.read",
    "exports.execute",
    "workboard.access",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.trust_safety_analyst]: uniqueCaps(VIEWER_BASE, [
    "users.read",
    "riders.read",
    "rides.read",
    "fraud.review",
    "incidents.read",
    "incidents.create",
    "incidents.manage",
    "notifications.send",
    "workboard.access",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.support_agent]: uniqueCaps(SUPPORT_BASE, [
    "rewards.catalog.read",
    "fulfilment.read",
    "wallet.read",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.support_lead]: uniqueCaps(SUPPORT_BASE, [
    "waitlist.manage",
    "incidents.manage",
    "riders.manage",
    "rewards.catalog.read",
    "fulfilment.read",
    "wallet.read",
    "exports.execute",
    "workboard.access",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.finance_operator]: uniqueCaps(VIEWER_BASE, [
    "billing.read",
    "billing.manage",
    "exports.execute",
    "campaigns.read",
    "reports.read",
    "authz.inspect",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.compliance_analyst]: uniqueCaps(COMPLIANCE_BASE, [
    "exports.execute",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.programme_operations_manager]: uniqueCaps(VIEWER_BASE, [
    "programmes.read",
    "compliance.read",
    "impact.read",
    "campaigns.read",
    "riders.read",
    "rides.read",
    "reports.read",
    "analytics.view",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.executive_viewer]: uniqueCaps(VIEWER_BASE, [
    "reports.read",
    "programmes.read",
    "impact.read",
    "campaigns.read",
    "billing.read",
    "compliance.read",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.product_operations]: uniqueCaps(VIEWER_BASE, [
    "routes.read",
    "routes.write",
    "routes.approve",
    "campaigns.read",
    "workboard.access",
    "community.manage",
    "protips.manage",
    "riders.read",
    "rides.read",
  ]),

  [EMPLOYEE_BUNDLE_KEYS.engineering_operations]: uniqueCaps(
    VIEWER_BASE,
    PLATFORM_OPS,
    ["workboard.access", "settings.manage", "authz.inspect", "featureflags.manage"],
  ),
};

export const EMPLOYEE_ROLE_TEMPLATES: Record<
  CanonicalEmployeeRole,
  EmployeeRoleTemplate
> = {
  super_admin: {
    id: "super_admin",
    label: "Super Administrator",
    description: "Unrestricted platform authority including security break-glass.",
    department: "Security",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.super_admin,
    dataScope: "global",
    responsibilities: [
      "Emergency access",
      "Security recovery",
      "Full operational override",
    ],
  },
  security_admin: {
    id: "security_admin",
    label: "Security Administrator",
    description: "Privileged role approval, security settings, and authz diagnostics.",
    department: "Security",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.security_admin,
    dataScope: "global",
    responsibilities: [
      "Approve privileged role assignments",
      "Security policy",
      "Break-glass oversight",
    ],
  },
  operations_manager: {
    id: "operations_manager",
    label: "Operations Manager",
    description: "Broad operational ownership without security administrator powers.",
    department: "Platform Operations",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.operations_manager,
    dataScope: "global",
    responsibilities: [
      "Day-to-day ops",
      "Cross-module coordination",
      "Staff user management (non-privileged)",
    ],
  },
  platform_operator: {
    id: "platform_operator",
    label: "Platform Operator",
    description: "Jobs, health, incidents and platform reliability.",
    department: "Engineering Operations",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.platform_operator,
    dataScope: "global",
    responsibilities: ["Jobs", "Health", "Incident triage"],
  },
  campaign_manager: {
    id: "campaign_manager",
    label: "Campaign Manager",
    description: "Campaign lifecycle without user admin or security powers.",
    department: "Campaign Operations",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.campaign_manager,
    dataScope: "global",
    responsibilities: ["Campaign create/edit/publish", "Advertiser management"],
  },
  partner_operations_manager: {
    id: "partner_operations_manager",
    label: "Partner Operations Manager",
    description: "Fulfilment queues, rewards catalog and partner approvals.",
    department: "Partner Operations",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.partner_operations_manager,
    dataScope: "organisation",
    responsibilities: ["Fulfilment", "Partner onboarding", "Reward catalog"],
  },
  fraud_analyst: {
    id: "fraud_analyst",
    label: "Fraud Analyst",
    description: "Fraud review and ride verification disposition.",
    department: "Fraud",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.fraud_analyst,
    dataScope: "assignment",
    responsibilities: ["Fraud queue", "Ride verification", "Risk disposition"],
  },
  trust_safety_analyst: {
    id: "trust_safety_analyst",
    label: "Trust & Safety Analyst",
    description: "Incident handling and safety investigations.",
    department: "Trust & Safety",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.trust_safety_analyst,
    dataScope: "assignment",
    responsibilities: ["Incidents", "Safety review"],
  },
  support_agent: {
    id: "support_agent",
    label: "Support Agent",
    description: "Customer support read access and incident creation.",
    department: "Support",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.support_agent,
    dataScope: "assignment",
    responsibilities: ["User lookup", "Notifications", "Incident intake"],
  },
  support_lead: {
    id: "support_lead",
    label: "Support Lead",
    description: "Support leadership including waitlist and escalations.",
    department: "Support",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.support_lead,
    dataScope: "department",
    responsibilities: ["Waitlist", "Escalations", "Agent oversight"],
  },
  finance_operator: {
    id: "finance_operator",
    label: "Finance Operator",
    description: "Billing operations and audited financial exports.",
    department: "Finance",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.finance_operator,
    dataScope: "global",
    responsibilities: ["Billing ops", "Financial exports"],
  },
  compliance_analyst: {
    id: "compliance_analyst",
    label: "Compliance Analyst",
    description: "Read-heavy compliance and programme oversight with audited export.",
    department: "Compliance",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.compliance_analyst,
    dataScope: "programme",
    responsibilities: ["Compliance review", "Programme audit", "Exports"],
    readOnly: true,
  },
  programme_operations_manager: {
    id: "programme_operations_manager",
    label: "Programme Operations Manager",
    description: "Government programme visibility and impact reporting.",
    department: "Government Programmes",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.programme_operations_manager,
    dataScope: "programme",
    responsibilities: ["Programme oversight", "Impact reporting"],
    readOnly: true,
  },
  executive_viewer: {
    id: "executive_viewer",
    label: "Executive Viewer",
    description: "Executive read-only analytics and reports.",
    department: "Executive",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.executive_viewer,
    dataScope: "global",
    responsibilities: ["Executive dashboards", "Reports"],
    readOnly: true,
  },
  product_operations: {
    id: "product_operations",
    label: "Product Operations",
    description: "Routes, workboard and product operational workflows.",
    department: "Product Operations",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.product_operations,
    dataScope: "global",
    responsibilities: ["Routes", "Workboard", "Community rides"],
  },
  engineering_operations: {
    id: "engineering_operations",
    label: "Engineering Operations",
    description: "Platform reliability and feature flag operations.",
    department: "Engineering Operations",
    bundleKey: EMPLOYEE_BUNDLE_KEYS.engineering_operations,
    dataScope: "global",
    responsibilities: ["Jobs", "Health", "Feature flags"],
  },
};

export function isEmployeeRole(value: string | null | undefined): value is EmployeeRole {
  if (!value) return false;
  return (EMPLOYEE_ROLES as readonly string[]).includes(value);
}

export function normalizeEmployeeRole(
  role: string | null | undefined,
): EmployeeRole | undefined {
  if (!role) return undefined;
  const normalized = role.trim().toLowerCase().replace(/-/g, "_");
  if (!isEmployeeRole(normalized)) return undefined;
  return normalized;
}

/** Resolve legacy aliases to canonical template ids. */
export function resolveCanonicalEmployeeRole(
  role: string | null | undefined,
): CanonicalEmployeeRole | undefined {
  const normalized = normalizeEmployeeRole(role);
  if (!normalized) return undefined;
  if (normalized in EMPLOYEE_ROLE_TEMPLATES) {
    return normalized as CanonicalEmployeeRole;
  }
  return LEGACY_EMPLOYEE_ROLE_ALIASES[normalized];
}

export function getEmployeeRoleTemplate(
  role: string | null | undefined,
): EmployeeRoleTemplate | undefined {
  const canonical = resolveCanonicalEmployeeRole(role);
  if (!canonical) return undefined;
  return EMPLOYEE_ROLE_TEMPLATES[canonical];
}

export function capabilitiesForEmployeeRole(
  role: string | null | undefined,
): KnownCapability[] {
  const template = getEmployeeRoleTemplate(role);
  if (!template) return [];
  const caps = EMPLOYEE_BUNDLE_CAPABILITIES[template.bundleKey];
  return caps ? [...caps] : [];
}

export function employeeHasCapability(
  role: string | null | undefined,
  capability: KnownCapability | string,
): boolean {
  const caps = capabilitiesForEmployeeRole(role);
  return caps.includes(capability as KnownCapability);
}

export function employeeHasAnyCapability(
  role: string | null | undefined,
  required: readonly (KnownCapability | string)[],
): boolean {
  if (required.length === 0) return true;
  const caps = new Set(capabilitiesForEmployeeRole(role));
  return required.some((cap) => caps.has(cap as KnownCapability));
}

export function employeeHasAllCapabilities(
  role: string | null | undefined,
  required: readonly (KnownCapability | string)[],
): boolean {
  const caps = new Set(capabilitiesForEmployeeRole(role));
  return required.every((cap) => caps.has(cap as KnownCapability));
}

export function isReadOnlyEmployeeRole(role: string | null | undefined): boolean {
  return Boolean(getEmployeeRoleTemplate(role)?.readOnly);
}

/** Roles that may be assigned without security_admin SoD approval. */
export const NON_PRIVILEGED_ASSIGNABLE_ROLES: readonly CanonicalEmployeeRole[] = [
  "support_agent",
  "support_lead",
  "fraud_analyst",
  "trust_safety_analyst",
  "campaign_manager",
  "partner_operations_manager",
  "platform_operator",
  "finance_operator",
  "compliance_analyst",
  "programme_operations_manager",
  "executive_viewer",
  "product_operations",
  "engineering_operations",
  "operations_manager",
];

/** Roles requiring security approval (users.role.approve) to assign. */
export const PRIVILEGED_ASSIGNABLE_ROLES: readonly CanonicalEmployeeRole[] = [
  "super_admin",
  "security_admin",
];
