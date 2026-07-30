/**
 * Unified Dashboard Authorization Registry.
 *
 * Single source of truth linking capabilities to:
 * navigation, pages, search entities, commands, exports, approvals, audit, data scope.
 *
 * Consumers MUST derive visibility/authorization from this registry + employee bundles.
 * Do not maintain parallel role allow-lists.
 */

import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import type { DataScopePreset } from "@/features/organisations/domain/employeeRoleTemplates";

export type CapabilityCategory =
  | "dashboard"
  | "users"
  | "riders"
  | "campaigns"
  | "rewards"
  | "fulfilment"
  | "routes"
  | "fraud"
  | "incidents"
  | "programmes"
  | "platform"
  | "billing"
  | "notifications"
  | "settings"
  | "exports"
  | "security"
  | "analytics";

export type NavPlacement =
  | { kind: "root"; order: number; label: string; href: string; icon: string }
  | {
      kind: "ops";
      order: number;
      label: string;
      href: string;
      icon: string;
    };

export type ApprovalRequirement = {
  /** Capability required to approve (distinct from create when SoD applies). */
  approveCapability: KnownCapability;
  /** Capability used to initiate — creator must not also hold approve when sodStrict. */
  initiateCapability: KnownCapability;
  sodStrict: boolean;
};

export type DashboardCapabilitySurface = {
  capability: KnownCapability;
  description: string;
  category: CapabilityCategory;
  navigation?: NavPlacement;
  pages?: readonly string[];
  searchEntities?: readonly string[];
  commands?: readonly string[];
  actions?: readonly string[];
  exportModules?: readonly string[];
  auditRequired: boolean;
  approval?: ApprovalRequirement;
  dataScope: DataScopePreset;
};

/**
 * Canonical capability → surface map for the Operations Control Centre.
 * Adding a module: register surfaces here; nav/pages/search derive automatically.
 */
export const DASHBOARD_CAPABILITY_SURFACES: readonly DashboardCapabilitySurface[] = [
  {
    capability: "dashboard.read",
    description: "View operations overview",
    category: "dashboard",
    navigation: { kind: "root", order: 10, label: "Overview", href: "/", icon: "LayoutDashboard" },
    pages: ["/", "/recent-activity"],
    commands: ["quick.overview"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "workboard.access",
    description: "Access internal workboard",
    category: "dashboard",
    navigation: { kind: "root", order: 20, label: "Workboard", href: "/workboard", icon: "KanbanSquare" },
    pages: ["/workboard", "/workboard/invite"],
    commands: ["quick.workboard"],
    auditRequired: false,
    dataScope: "department",
  },
  {
    capability: "fraud.review",
    description: "View fraud monitoring queue",
    category: "fraud",
    navigation: { kind: "ops", order: 10, label: "Fraud", href: "/fraud", icon: "Shield" },
    pages: ["/fraud"],
    commands: ["quick.fraud"],
    auditRequired: true,
    dataScope: "assignment",
  },
  {
    capability: "fraud.resolve",
    description: "Resolve fraud cases and verify rides",
    category: "fraud",
    pages: ["/fraud", "/ride-sessions"],
    actions: ["rideSessions.verify", "rideSessions.reject"],
    auditRequired: true,
    dataScope: "assignment",
  },
  {
    capability: "incidents.read",
    description: "View incidents",
    category: "incidents",
    navigation: { kind: "ops", order: 20, label: "Incidents", href: "/incidents", icon: "AlertTriangle" },
    pages: ["/incidents"],
    auditRequired: true,
    dataScope: "assignment",
  },
  {
    capability: "incidents.manage",
    description: "Create and update incidents",
    category: "incidents",
    pages: ["/incidents"],
    actions: ["incidents.create", "incidents.update"],
    auditRequired: true,
    dataScope: "assignment",
  },
  {
    capability: "incidents.create",
    description: "Create incidents",
    category: "incidents",
    actions: ["incidents.create"],
    auditRequired: true,
    dataScope: "assignment",
  },
  {
    capability: "programmes.read",
    description: "View government programmes",
    category: "programmes",
    navigation: { kind: "ops", order: 30, label: "Programmes", href: "/programmes", icon: "Landmark" },
    pages: ["/programmes"],
    auditRequired: false,
    dataScope: "programme",
  },
  {
    capability: "platform.jobs.manage",
    description: "Manage background jobs",
    category: "platform",
    navigation: { kind: "ops", order: 40, label: "Jobs", href: "/ops/jobs", icon: "Clock3" },
    pages: ["/ops/jobs"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "platform.health.read",
    description: "View platform health",
    category: "platform",
    navigation: { kind: "ops", order: 50, label: "Health", href: "/ops/health", icon: "Activity" },
    pages: ["/ops/health"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "billing.read",
    description: "View billing operations",
    category: "billing",
    navigation: { kind: "ops", order: 60, label: "Billing", href: "/ops/billing", icon: "CreditCard" },
    pages: ["/ops/billing"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "billing.manage",
    description: "Manage billing operations",
    category: "billing",
    pages: ["/ops/billing"],
    actions: ["billing.update"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "waitlist.manage",
    description: "Manage waitlist approvals",
    category: "users",
    navigation: { kind: "root", order: 30, label: "Waitlist", href: "/waitlist", icon: "List" },
    pages: ["/waitlist"],
    commands: ["quick.waitlist"],
    actions: ["waitlist.approve", "waitlist.reject"],
    auditRequired: true,
    approval: {
      initiateCapability: "waitlist.manage",
      approveCapability: "waitlist.manage",
      sodStrict: false,
    },
    dataScope: "global",
  },
  {
    capability: "users.read",
    description: "View users",
    category: "users",
    navigation: { kind: "root", order: 40, label: "Users", href: "/users", icon: "Users" },
    pages: ["/users"],
    searchEntities: ["user"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "users.manage",
    description: "Create and update users",
    category: "users",
    pages: ["/users", "/users/create"],
    actions: ["users.create", "users.update", "users.toggleStatus"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "users.role.assign",
    description: "Assign non-privileged employee roles",
    category: "users",
    actions: ["users.role.assign"],
    auditRequired: true,
    approval: {
      initiateCapability: "users.role.assign",
      approveCapability: "users.role.approve",
      sodStrict: true,
    },
    dataScope: "global",
  },
  {
    capability: "users.role.approve",
    description: "Approve privileged role assignments (SoD)",
    category: "security",
    actions: ["users.role.approve"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "riders.read",
    description: "View riders",
    category: "riders",
    navigation: { kind: "root", order: 50, label: "Riders", href: "/riders", icon: "Bike" },
    pages: ["/riders"],
    searchEntities: ["rider"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "riders.manage",
    description: "Manage riders",
    category: "riders",
    pages: ["/riders"],
    actions: ["riders.update"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "rides.read",
    description: "View ride sessions",
    category: "riders",
    navigation: { kind: "root", order: 60, label: "Ride Sessions", href: "/ride-sessions", icon: "Timer" },
    pages: ["/ride-sessions"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "rides.verify",
    description: "Verify or reject ride sessions",
    category: "fraud",
    actions: ["rideSessions.verify", "rideSessions.reject"],
    auditRequired: true,
    dataScope: "assignment",
  },
  {
    capability: "routes.read",
    description: "View routes",
    category: "routes",
    navigation: { kind: "root", order: 70, label: "Suggested Routes", href: "/suggested-routes", icon: "Route" },
    pages: ["/suggested-routes", "/routes", "/routes/audit", "/routes/optimization-results"],
    searchEntities: ["route"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "routes.write",
    description: "Create and edit routes",
    category: "routes",
    navigation: { kind: "root", order: 110, label: "Planned Routes", href: "/routes", icon: "FaRoute" },
    pages: ["/routes", "/routes/create"],
    actions: ["routes.create", "routes.update"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "routes.approve",
    description: "Approve or reject planned routes",
    category: "routes",
    actions: ["routes.approve", "routes.reject"],
    auditRequired: true,
    approval: {
      initiateCapability: "routes.write",
      approveCapability: "routes.approve",
      sodStrict: true,
    },
    dataScope: "global",
  },
  {
    capability: "rewards.catalog.read",
    description: "View rewards catalog",
    category: "rewards",
    navigation: { kind: "root", order: 80, label: "Rewards", href: "/rewards", icon: "Coins" },
    pages: ["/rewards"],
    searchEntities: ["reward_catalog"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "rewards.manage",
    description: "Manage rewards catalog",
    category: "rewards",
    pages: ["/rewards", "/rewards/catalog/create"],
    actions: ["rewards.create", "rewards.update", "rewards.delete"],
    auditRequired: true,
    approval: {
      initiateCapability: "rewards.manage",
      approveCapability: "rewards.approve",
      sodStrict: true,
    },
    dataScope: "organisation",
  },
  {
    capability: "rewards.approve",
    description: "Approve reward catalog changes",
    category: "rewards",
    actions: ["rewards.approve"],
    auditRequired: true,
    dataScope: "organisation",
  },
  {
    capability: "fulfilment.read",
    description: "View fulfilment queue",
    category: "fulfilment",
    navigation: { kind: "root", order: 90, label: "Fulfilment", href: "/fulfilment", icon: "Package" },
    pages: ["/fulfilment"],
    searchEntities: ["fulfilment_item", "partner", "organisation"],
    auditRequired: false,
    dataScope: "organisation",
  },
  {
    capability: "fulfilment.cancel",
    description: "Cancel fulfilment",
    category: "fulfilment",
    actions: ["fulfilment.cancel"],
    auditRequired: true,
    dataScope: "organisation",
  },
  {
    capability: "advertisers.manage",
    description: "Manage advertisers",
    category: "campaigns",
    navigation: { kind: "root", order: 100, label: "Advertisers", href: "/advertisers", icon: "Building2" },
    pages: ["/advertisers", "/advertisers/create"],
    searchEntities: ["advertiser"],
    actions: ["advertisers.create", "advertisers.update"],
    auditRequired: true,
    dataScope: "organisation",
  },
  {
    capability: "campaigns.read",
    description: "View campaigns",
    category: "campaigns",
    navigation: { kind: "root", order: 105, label: "Campaigns", href: "/campaigns", icon: "Megaphone" },
    pages: ["/campaigns"],
    searchEntities: ["campaign"],
    commands: ["quick.campaigns"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "campaigns.write",
    description: "Create and edit campaigns",
    category: "campaigns",
    pages: ["/campaigns", "/campaigns/create"],
    actions: ["campaigns.create", "campaigns.update"],
    commands: ["quick.campaign.create"],
    auditRequired: true,
    approval: {
      initiateCapability: "campaigns.write",
      approveCapability: "campaigns.approve",
      sodStrict: true,
    },
    dataScope: "global",
  },
  {
    capability: "campaigns.approve",
    description: "Approve campaigns (SoD from create)",
    category: "campaigns",
    actions: ["campaigns.approve"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "campaigns.publish",
    description: "Publish / launch campaigns",
    category: "campaigns",
    actions: ["campaigns.launch", "campaigns.publish"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "campaigns.launch",
    description: "Launch campaigns",
    category: "campaigns",
    actions: ["campaigns.launch"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "campaigns.pause",
    description: "Pause campaigns",
    category: "campaigns",
    actions: ["campaigns.pause"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "campaigns.archive",
    description: "Archive campaigns",
    category: "campaigns",
    actions: ["campaigns.archive"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "partners.approve",
    description: "Approve partner onboarding",
    category: "fulfilment",
    actions: ["partners.approve"],
    auditRequired: true,
    approval: {
      initiateCapability: "resources.manage",
      approveCapability: "partners.approve",
      sodStrict: true,
    },
    dataScope: "organisation",
  },
  {
    capability: "community.manage",
    description: "Manage community rides",
    category: "campaigns",
    navigation: { kind: "root", order: 120, label: "Community Rides", href: "/community-rides", icon: "CalendarClock" },
    pages: ["/community-rides"],
    actions: ["communityRides.manage"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "protips.manage",
    description: "Manage pro tips",
    category: "dashboard",
    navigation: { kind: "root", order: 130, label: "Pro Tips", href: "/pro-tips", icon: "Lightbulb" },
    pages: ["/pro-tips"],
    actions: ["proTips.manage"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "notifications.read",
    description: "View notifications",
    category: "notifications",
    navigation: { kind: "root", order: 140, label: "Notifications", href: "/notifications", icon: "Bell" },
    pages: ["/notifications"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "notifications.send",
    description: "Send notifications",
    category: "notifications",
    actions: ["notifications.send"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "settings.manage",
    description: "Manage platform settings",
    category: "settings",
    navigation: { kind: "root", order: 150, label: "Settings", href: "/settings", icon: "Settings" },
    pages: ["/settings", "/account/security"],
    actions: ["settings.update"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "settings.security",
    description: "Manage security settings and MFA recovery",
    category: "security",
    pages: ["/settings", "/account/security"],
    actions: ["settings.security", "adminMfa.recover"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "exports.execute",
    description: "Execute audited data exports",
    category: "exports",
    exportModules: ["dashboard", "riders", "campaigns", "users", "billing", "fulfilment"],
    commands: ["quick.export"],
    actions: ["exports.execute"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "privacy.erase",
    description: "GDPR erasure",
    category: "security",
    actions: ["privacy.erase"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "featureflags.manage",
    description: "Manage feature flags",
    category: "platform",
    actions: ["featureflags.manage"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "analytics.read",
    description: "View analytics",
    category: "analytics",
    pages: ["/"],
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "reports.read",
    description: "View reports",
    category: "analytics",
    auditRequired: false,
    dataScope: "global",
  },
  {
    capability: "authz.inspect",
    description: "Inspect authorization diagnostics",
    category: "security",
    navigation: {
      kind: "root",
      order: 155,
      label: "Authorization",
      href: "/settings/authorization",
      icon: "Shield",
    },
    pages: ["/settings/authorization"],
    actions: ["authz.inspect"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "authz.manage",
    description: "Manage authorization configuration",
    category: "security",
    pages: ["/settings/authorization"],
    actions: ["authz.manage"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "break_glass.use",
    description: "Emergency break-glass access",
    category: "security",
    actions: ["break_glass.use"],
    auditRequired: true,
    dataScope: "global",
  },
  {
    capability: "delegation.manage",
    description: "Manage temporary access delegation",
    category: "security",
    actions: ["delegation.manage"],
    auditRequired: true,
    dataScope: "global",
  },
];

const byCapability = new Map(
  DASHBOARD_CAPABILITY_SURFACES.map((s) => [s.capability, s]),
);

export function getSurfaceForCapability(
  capability: KnownCapability | string,
): DashboardCapabilitySurface | undefined {
  return byCapability.get(capability as KnownCapability);
}

export function getPageRequiredCapabilities(pathname: string): KnownCapability[] {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  const caps: KnownCapability[] = [];
  for (const surface of DASHBOARD_CAPABILITY_SURFACES) {
    if (!surface.pages) continue;
    for (const page of surface.pages) {
      if (
        normalized === page ||
        (page !== "/" && normalized.startsWith(`${page}/`))
      ) {
        caps.push(surface.capability);
      }
    }
  }
  return [...new Set(caps)];
}

/** Page is allowed if the actor holds ANY capability that lists the page. */
export function canAccessPage(
  pathname: string,
  granted: ReadonlySet<string> | readonly string[],
): boolean {
  const required = getPageRequiredCapabilities(pathname);
  if (required.length === 0) {
    // Unregistered pages require dashboard.read as baseline
    const set = granted instanceof Set ? granted : new Set(granted);
    return set.has("dashboard.read");
  }
  const set = granted instanceof Set ? granted : new Set(granted);
  return required.some((cap) => set.has(cap));
}

export function getSearchEntityCapability(
  entityType: string,
): KnownCapability | undefined {
  for (const surface of DASHBOARD_CAPABILITY_SURFACES) {
    if (surface.searchEntities?.includes(entityType)) {
      return surface.capability;
    }
  }
  return undefined;
}

export function getCommandRequiredCapability(
  commandId: string,
): KnownCapability | undefined {
  for (const surface of DASHBOARD_CAPABILITY_SURFACES) {
    if (surface.commands?.includes(commandId)) {
      return surface.capability;
    }
  }
  return undefined;
}

export function getActionRequiredCapability(
  actionId: string,
): KnownCapability | undefined {
  for (const surface of DASHBOARD_CAPABILITY_SURFACES) {
    if (surface.actions?.includes(actionId)) {
      return surface.capability;
    }
  }
  return undefined;
}

export function getExportRequiredCapability(
  module: string,
): KnownCapability | undefined {
  for (const surface of DASHBOARD_CAPABILITY_SURFACES) {
    if (surface.exportModules?.includes(module)) {
      return surface.capability;
    }
  }
  return "exports.execute";
}

export function getNavigationSurfaces(): DashboardCapabilitySurface[] {
  return DASHBOARD_CAPABILITY_SURFACES.filter((s) => s.navigation).sort(
    (a, b) => (a.navigation?.order ?? 0) - (b.navigation?.order ?? 0),
  );
}

export function filterSurfacesByCapabilities(
  granted: ReadonlySet<string> | readonly string[],
): DashboardCapabilitySurface[] {
  const set = granted instanceof Set ? granted : new Set(granted);
  return DASHBOARD_CAPABILITY_SURFACES.filter((s) => set.has(s.capability));
}
