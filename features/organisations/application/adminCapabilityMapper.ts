import { normalizeAdminRole } from "@/lib/authPermissions";
import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import { CAPABILITIES } from "@/features/organisations/domain/CapabilityCatalog";

/**
 * Maps internal admin_users roles onto the same domain capability strings
 * used by Organisation / Rider AuthZ. Independent of org permission_bundles store.
 */
const ADMIN_WRITE_CAPABILITIES: readonly KnownCapability[] = [
  "rewards.manage",
  "rewards.catalog.read",
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
];

const ADMIN_OPS_CAPABILITIES: readonly KnownCapability[] = [
  "rewards.manage",
  "rewards.catalog.read",
  "fulfilment.read",
  "fulfilment.cancel",
  "fulfilment.refund",
  "fulfilment.validate",
  "fulfilment.confirm",
  "resources.manage",
  "wallet.read",
  "analytics.view",
];

const ADMIN_READ_CAPABILITIES: readonly KnownCapability[] = [
  "rewards.catalog.read",
  "fulfilment.read",
  "wallet.read",
  "analytics.view",
  "campaigns.read",
  "programmes.read",
  "compliance.read",
  "impact.read",
  "billing.read",
];

export function mapAdminRoleToCapabilities(
  role: string | undefined | null,
): KnownCapability[] {
  const normalized = normalizeAdminRole(role);
  if (!normalized) return [];

  switch (normalized) {
    case "super_admin":
      return [...CAPABILITIES];
    case "admin":
      return [...ADMIN_WRITE_CAPABILITIES];
    case "moderator":
    case "support":
      return [...ADMIN_OPS_CAPABILITIES];
    case "compliance_officer":
    case "government":
      return [...ADMIN_READ_CAPABILITIES];
    default:
      return [];
  }
}
