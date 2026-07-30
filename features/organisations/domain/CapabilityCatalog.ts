/**
 * Domain-oriented capability strings for Platform AuthZ.
 * Unresolved / ungranted capability ⇒ deny (default-deny).
 *
 * This catalog is the canonical capability vocabulary for:
 * - Platform API (org / rider / advertiser / government principals)
 * - MOVRR Admin employee dashboard (via employee role templates)
 *
 * Roles are implementation constructs. Capabilities are the platform contract.
 */

/** Product / organisation capabilities (existing Platform API contract). */
export const PRODUCT_CAPABILITIES = [
  "rewards.redeem",
  "rewards.catalog.read",
  "rewards.manage",
  "fulfilment.read",
  "fulfilment.cancel",
  "fulfilment.refund",
  "fulfilment.override",
  "fulfilment.validate",
  "fulfilment.confirm",
  "resources.manage",
  "wallet.read",
  "staff.manage",
  "analytics.view",
  "campaigns.read",
  "campaigns.write",
  "campaigns.launch",
  "campaigns.pause",
  "billing.read",
  "programmes.read",
  "compliance.read",
  "impact.read",
  "org.settings",
] as const;

/**
 * Employee / Operations Control Centre capabilities.
 * Dashboard navigation, pages, actions, search, exports and SoD derive from these.
 */
export const EMPLOYEE_CAPABILITIES = [
  "dashboard.read",
  "users.read",
  "users.manage",
  "users.role.assign",
  "users.role.approve",
  "waitlist.manage",
  "riders.read",
  "riders.manage",
  "rides.read",
  "rides.verify",
  "routes.read",
  "routes.write",
  "routes.approve",
  "campaigns.approve",
  "campaigns.publish",
  "campaigns.archive",
  "rewards.approve",
  "partners.approve",
  "fraud.review",
  "fraud.resolve",
  "incidents.read",
  "incidents.create",
  "incidents.manage",
  "notifications.read",
  "notifications.send",
  "settings.manage",
  "settings.security",
  "exports.execute",
  "privacy.erase",
  "platform.health.read",
  "platform.jobs.manage",
  "featureflags.manage",
  "billing.manage",
  "workboard.access",
  "analytics.read",
  "reports.read",
  "protips.manage",
  "community.manage",
  "advertisers.manage",
  "authz.inspect",
  "authz.manage",
  "break_glass.use",
  "delegation.manage",
] as const;

export const CAPABILITIES = [
  ...PRODUCT_CAPABILITIES,
  ...EMPLOYEE_CAPABILITIES,
] as const;

export type KnownCapability = (typeof CAPABILITIES)[number];
export type ProductCapability = (typeof PRODUCT_CAPABILITIES)[number];
export type EmployeeCapability = (typeof EMPLOYEE_CAPABILITIES)[number];

export type MembershipRole = "owner" | "manager" | "staff" | "viewer";

/** Role → permission bundle key (permissions live on bundles, not the role enum). */
export const ORG_ROLE_BUNDLE_KEYS = {
  owner: "org.owner",
  manager: "org.manager",
  staff: "org.staff",
  viewer: "org.viewer",
} as const satisfies Record<MembershipRole, string>;

export const RIDER_BUNDLE_KEY = "rider.default";
export const ADVERTISER_BUNDLE_KEY = "advertiser.default";
export const GOVERNMENT_BUNDLE_KEY = "government.default";

export const BUNDLE_CAPABILITIES: Record<string, readonly KnownCapability[]> = {
  [ORG_ROLE_BUNDLE_KEYS.owner]: [
    "staff.manage",
    "resources.manage",
    "rewards.manage",
    "rewards.catalog.read",
    "fulfilment.validate",
    "fulfilment.confirm",
    "fulfilment.read",
    "fulfilment.cancel",
    "fulfilment.refund",
    "analytics.view",
  ],
  [ORG_ROLE_BUNDLE_KEYS.manager]: [
    "resources.manage",
    "rewards.manage",
    "rewards.catalog.read",
    "fulfilment.validate",
    "fulfilment.confirm",
    "fulfilment.read",
    "fulfilment.cancel",
    "fulfilment.refund",
    "analytics.view",
  ],
  [ORG_ROLE_BUNDLE_KEYS.staff]: [
    "fulfilment.validate",
    "fulfilment.confirm",
    "fulfilment.read",
    "analytics.view",
    "rewards.catalog.read",
  ],
  [ORG_ROLE_BUNDLE_KEYS.viewer]: [
    "fulfilment.read",
    "analytics.view",
    "rewards.catalog.read",
  ],
  [RIDER_BUNDLE_KEY]: [
    "rewards.redeem",
    "rewards.catalog.read",
    "fulfilment.read",
    "wallet.read",
  ],
  [ADVERTISER_BUNDLE_KEY]: [
    "campaigns.read",
    "campaigns.write",
    "campaigns.launch",
    "campaigns.pause",
    "analytics.view",
    "billing.read",
  ],
  [GOVERNMENT_BUNDLE_KEY]: [
    "programmes.read",
    "compliance.read",
    "impact.read",
    "org.settings",
    "analytics.view",
  ],
};

export function isMembershipRole(value: string | undefined): value is MembershipRole {
  return (
    value === "owner" ||
    value === "manager" ||
    value === "staff" ||
    value === "viewer"
  );
}

export function capabilitiesForOrgRole(role: MembershipRole): KnownCapability[] {
  const key = ORG_ROLE_BUNDLE_KEYS[role];
  return [...BUNDLE_CAPABILITIES[key]];
}

export function capabilitiesForRider(): KnownCapability[] {
  return [...BUNDLE_CAPABILITIES[RIDER_BUNDLE_KEY]];
}

export function capabilitiesForAdvertiser(): KnownCapability[] {
  return [...BUNDLE_CAPABILITIES[ADVERTISER_BUNDLE_KEY]];
}

export function capabilitiesForGovernment(): KnownCapability[] {
  return [...BUNDLE_CAPABILITIES[GOVERNMENT_BUNDLE_KEY]];
}

export function isKnownCapability(value: string): value is KnownCapability {
  return (CAPABILITIES as readonly string[]).includes(value);
}
