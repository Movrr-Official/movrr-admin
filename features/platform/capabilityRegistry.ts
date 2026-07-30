/**
 * Platform Capability Registry — governing architecture for cross-app parity.
 * Every backend capability declares its API route(s) and UI consumers.
 */

import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";

export type ConsumerCoverage = "full" | "partial" | "none" | "n/a";

export type PlatformActor =
  | "rider"
  | "advertiser"
  | "partner"
  | "government"
  | "administrator"
  | "moderator"
  | "support"
  | "compliance_officer";

export type CapabilityRegistryEntry = {
  id: string;
  name: string;
  backendModule: string;
  apiRoutes: string[];
  adminConsumer: ConsumerCoverage;
  webConsumer: ConsumerCoverage;
  mobileConsumer: ConsumerCoverage;
  primaryActor: PlatformActor;
  secondaryActors: PlatformActor[];
  lifecycleOwner: PlatformActor | "platform";
  permissions: KnownCapability[];
  analyticsHook?: string;
  notificationsHook?: string;
};

export const PLATFORM_CAPABILITY_REGISTRY: CapabilityRegistryEntry[] = [
  {
    id: "campaigns.crud",
    name: "Campaign management",
    backendModule: "features/campaigns",
    apiRoutes: ["/api/v1/campaigns", "/api/v1/campaigns/:id"],
    adminConsumer: "full",
    webConsumer: "full",
    mobileConsumer: "partial",
    primaryActor: "advertiser",
    secondaryActors: ["administrator", "government"],
    lifecycleOwner: "advertiser",
    permissions: ["campaigns.read", "campaigns.write", "campaigns.launch", "campaigns.pause"],
    analyticsHook: "campaign.analytics",
    notificationsHook: "campaign.lifecycle",
  },
  {
    id: "campaigns.join",
    name: "Campaign rider signup",
    backendModule: "features/campaigns",
    apiRoutes: [
      "/api/v1/riders/me/campaigns/opt-in",
      "/api/v1/riders/me/campaigns/withdraw",
      "/api/v1/riders/me/campaigns/confirm",
    ],
    adminConsumer: "full",
    webConsumer: "full",
    mobileConsumer: "full",
    primaryActor: "rider",
    secondaryActors: ["administrator"],
    lifecycleOwner: "rider",
    permissions: ["rewards.catalog.read"],
    notificationsHook: "campaign.signup",
  },
  {
    id: "rewards.redeem",
    name: "Reward redemption",
    backendModule: "features/rewards",
    apiRoutes: ["/api/v1/rewards/redeem", "/api/v1/rewards/redemptions"],
    adminConsumer: "full",
    webConsumer: "full",
    mobileConsumer: "full",
    primaryActor: "rider",
    secondaryActors: ["administrator", "partner"],
    lifecycleOwner: "platform",
    permissions: ["rewards.redeem", "rewards.catalog.read"],
    analyticsHook: "rewards.redemption",
    notificationsHook: "rewards.fulfilment",
  },
  {
    id: "wallet.ledger",
    name: "Wallet balance and transactions",
    backendModule: "features/wallet",
    apiRoutes: ["/api/v1/wallet/balance", "/api/v1/wallet/transactions"],
    adminConsumer: "full",
    webConsumer: "full",
    mobileConsumer: "full",
    primaryActor: "rider",
    secondaryActors: ["administrator"],
    lifecycleOwner: "platform",
    permissions: ["wallet.read"],
    analyticsHook: "wallet.transactions",
  },
  {
    id: "fulfilment.ops",
    name: "Fulfilment operations",
    backendModule: "features/fulfilment",
    apiRoutes: [
      "/api/v1/fulfilment",
      "/api/v1/fulfilment/:id",
      "/api/v1/partners/validate",
      "/api/v1/partners/collections/confirm",
    ],
    adminConsumer: "full",
    webConsumer: "partial",
    mobileConsumer: "partial",
    primaryActor: "partner",
    secondaryActors: ["administrator", "rider"],
    lifecycleOwner: "platform",
    permissions: [
      "fulfilment.read",
      "fulfilment.validate",
      "fulfilment.confirm",
      "fulfilment.cancel",
      "fulfilment.refund",
    ],
    notificationsHook: "fulfilment.progress",
  },
  {
    id: "rides.sessions",
    name: "Ride sessions and GPS ingest",
    backendModule: "app/api/sessions",
    apiRoutes: ["/api/sessions/:id/gps-batch", "/api/sessions/:id/heartbeat"],
    adminConsumer: "full",
    webConsumer: "partial",
    mobileConsumer: "full",
    primaryActor: "rider",
    secondaryActors: ["administrator"],
    lifecycleOwner: "rider",
    permissions: [],
    analyticsHook: "rides.session",
  },
  {
    id: "community.rides",
    name: "Community rides",
    backendModule: "features/community",
    apiRoutes: ["/api/v1/community-rides", "/api/v1/community-rides/:id/join"],
    adminConsumer: "full",
    webConsumer: "full",
    mobileConsumer: "full",
    primaryActor: "rider",
    secondaryActors: ["administrator"],
    lifecycleOwner: "rider",
    permissions: [],
    notificationsHook: "community.ride",
  },
  {
    id: "partner.rewards.catalog",
    name: "Partner reward catalog management",
    backendModule: "features/rewards",
    apiRoutes: ["/api/v1/partners/rewards"],
    adminConsumer: "full",
    webConsumer: "full",
    mobileConsumer: "n/a",
    primaryActor: "partner",
    secondaryActors: ["administrator"],
    lifecycleOwner: "partner",
    permissions: ["rewards.manage", "rewards.catalog.read"],
  },
  {
    id: "government.programmes",
    name: "Government programme visibility",
    backendModule: "features/government",
    apiRoutes: ["/api/v1/government/me", "/api/v1/government/programmes"],
    adminConsumer: "partial",
    webConsumer: "full",
    mobileConsumer: "n/a",
    primaryActor: "government",
    secondaryActors: ["administrator", "compliance_officer"],
    lifecycleOwner: "government",
    permissions: ["programmes.read", "compliance.read", "impact.read"],
    analyticsHook: "government.impact",
  },
  {
    id: "fraud.risk",
    name: "Fraud and risk policy",
    backendModule: "features/fraud",
    apiRoutes: [],
    adminConsumer: "partial",
    webConsumer: "none",
    mobileConsumer: "partial",
    primaryActor: "administrator",
    secondaryActors: ["moderator"],
    lifecycleOwner: "platform",
    permissions: [],
  },
  {
    id: "incidents.ops",
    name: "Incident management",
    backendModule: "features/incidents",
    apiRoutes: ["/api/v1/internal/incidents"],
    adminConsumer: "full",
    webConsumer: "none",
    mobileConsumer: "none",
    primaryActor: "administrator",
    secondaryActors: ["support", "moderator"],
    lifecycleOwner: "platform",
    permissions: [],
    notificationsHook: "incidents.assigned",
  },
  {
    id: "platform.jobs",
    name: "Background jobs and schedulers",
    backendModule: "app/api/v1/internal/jobs",
    apiRoutes: [
      "/api/v1/internal/jobs/fulfilment-expire",
      "/api/v1/internal/jobs/fulfilment-release",
      "/api/v1/internal/jobs/fulfilment-retry",
      "/api/internal/privacy-retention",
    ],
    adminConsumer: "partial",
    webConsumer: "none",
    mobileConsumer: "none",
    primaryActor: "administrator",
    secondaryActors: [],
    lifecycleOwner: "platform",
    permissions: [],
  },
  {
    id: "platform.health",
    name: "System health diagnostics",
    backendModule: "app/api/health",
    apiRoutes: ["/api/health", "/api/optimize/health"],
    adminConsumer: "partial",
    webConsumer: "none",
    mobileConsumer: "none",
    primaryActor: "administrator",
    secondaryActors: [],
    lifecycleOwner: "platform",
    permissions: [],
  },
  {
    id: "billing.ops",
    name: "Billing operations",
    backendModule: "schemas/settings",
    apiRoutes: [],
    adminConsumer: "partial",
    webConsumer: "partial",
    mobileConsumer: "none",
    primaryActor: "advertiser",
    secondaryActors: ["administrator"],
    lifecycleOwner: "platform",
    permissions: ["billing.read"],
  },
  {
    id: "feature.flags",
    name: "Platform feature flags",
    backendModule: "lib/platformSettings",
    apiRoutes: ["/api/public/settings/onboarding", "/api/public/settings/rewards"],
    adminConsumer: "full",
    webConsumer: "partial",
    mobileConsumer: "partial",
    primaryActor: "administrator",
    secondaryActors: [],
    lifecycleOwner: "platform",
    permissions: [],
  },
  {
    id: "notifications.broadcast",
    name: "Notifications",
    backendModule: "features/notifications",
    apiRoutes: [],
    adminConsumer: "full",
    webConsumer: "partial",
    mobileConsumer: "full",
    primaryActor: "administrator",
    secondaryActors: ["rider", "advertiser", "partner", "government"],
    lifecycleOwner: "platform",
    permissions: [],
  },
  {
    id: "search.global",
    name: "Global search",
    backendModule: "lib/search",
    apiRoutes: [],
    adminConsumer: "full",
    webConsumer: "none",
    mobileConsumer: "none",
    primaryActor: "administrator",
    secondaryActors: ["moderator", "support", "compliance_officer", "government"],
    lifecycleOwner: "platform",
    permissions: [],
  },
];

export function getCapabilityById(id: string): CapabilityRegistryEntry | undefined {
  return PLATFORM_CAPABILITY_REGISTRY.find((entry) => entry.id === id);
}

export function getCapabilitiesForActor(actor: PlatformActor): CapabilityRegistryEntry[] {
  return PLATFORM_CAPABILITY_REGISTRY.filter(
    (entry) =>
      entry.primaryActor === actor || entry.secondaryActors.includes(actor),
  );
}

export function exportRegistryJson(): string {
  return JSON.stringify(PLATFORM_CAPABILITY_REGISTRY, null, 2);
}
