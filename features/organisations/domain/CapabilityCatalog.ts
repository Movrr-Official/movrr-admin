/**
 * Domain-oriented capability strings for Platform AuthZ.
 * Unresolved / ungranted capability ⇒ deny (default-deny).
 */
export const CAPABILITIES = [
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
] as const;

export type KnownCapability = (typeof CAPABILITIES)[number];

export type MembershipRole = "owner" | "manager" | "staff" | "viewer";

/** Role → permission bundle key (permissions live on bundles, not the role enum). */
export const ORG_ROLE_BUNDLE_KEYS = {
  owner: "org.owner",
  manager: "org.manager",
  staff: "org.staff",
  viewer: "org.viewer",
} as const satisfies Record<MembershipRole, string>;

export const RIDER_BUNDLE_KEY = "rider.default";

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
