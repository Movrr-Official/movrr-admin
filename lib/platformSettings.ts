import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  ADMIN_EMAIL,
  ADMIN_EMAILS,
  APP_URL,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_MAP_STYLE_URL,
  NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET,
  ROUTE_OPTIMIZER_URL,
  SUPPORT_EMAIL,
} from "@/lib/env";
import {
  type AdminSettingsValues,
  type BillingSettings,
  billingSettingsSchema,
  campaignSettingsSchema,
  featureSettingsSchema,
  generalSettingsSchema,
  impactSettingsSchema,
  integrationsSettingsSchema,
  notificationSettingsSchema,
  onboardingSettingsSchema,
  organizationSettingsSchema,
  privacySettingsSchema,
  rewardsSettingsSchema,
  rideVerificationSettingsSchema,
  securitySettingsSchema,
  suggestedRoutesSettingsSchema,
  type SettingsSectionId,
} from "@/schemas/settings";

const LEGACY_KEYS = [
  "system",
  "points",
  "campaignDefaults",
  "featureFlags",
] as const;
const SETTINGS_KEYS = [
  "general",
  "onboarding",
  "rewards",
  "rideVerification",
  "impact",
  "campaigns",
  "suggestedRoutes",
  "features",
  "notifications",
  "security",
  "integrations",
  "organization",
  "privacy",
  "billing",
  ...LEGACY_KEYS,
] as const;

export type PersistedSettingsKey = (typeof SETTINGS_KEYS)[number];

export type SettingsRow = {
  key: PersistedSettingsKey;
  value: Record<string, unknown> | null;
  updated_at?: string | null;
};

const sectionSchemas = {
  general: generalSettingsSchema,
  onboarding: onboardingSettingsSchema,
  rewards: rewardsSettingsSchema,
  rideVerification: rideVerificationSettingsSchema,
  impact: impactSettingsSchema,
  campaigns: campaignSettingsSchema,
  suggestedRoutes: suggestedRoutesSettingsSchema,
  features: featureSettingsSchema,
  notifications: notificationSettingsSchema,
  security: securitySettingsSchema,
  integrations: integrationsSettingsSchema,
  organization: organizationSettingsSchema,
  privacy: privacySettingsSchema,
  billing: billingSettingsSchema,
} as const;

export const DEFAULT_SETTINGS: AdminSettingsValues = {
  general: {
    supportEmail: SUPPORT_EMAIL || "support@movrr.nl",
    publicSupportEmail: SUPPORT_EMAIL || "support@movrr.nl",
    publicSupportContactName: "MOVRR Support",
    defaultRegion: "NL",
    timezone: "Europe/Amsterdam",
    defaultLanguage: "en",
    defaultCurrency: "EUR",
    appVersion: "0.1.0",
    maintenanceMode: false,
    maintenanceScope: "global" as const,
    maintenanceMessage:
      "The platform is temporarily unavailable for maintenance. Please check back shortly.",
    distanceUnit: "km" as const,
    co2KgPerKm: 0.021,
  },
  onboarding: {
    riderOnboardingMode: "open",
    requireCity: true,
    requireCountry: true,
    autoApproveWaitlist: false,
    setupEmailEnabled: true,
    defaultRiderLanguage: "en",
    defaultRiderTimezone: "Europe/Amsterdam",
  },
  rewards: {
    basePointsPerMinute: 1,
    dailyCap: 1000,
    weeklyCap: 600,
    campaignMaxRewardCap: 1000,
    minVerifiedMinutes: 1,
    standardBikeMultiplier: 1,
    eBikeMultiplier: 0.9,
    fatBikeMultiplier: 0.75,
    boostedRideMultiplier: 1.5,
    maxAllowedAverageSpeedKmh: 35,
    maxAllowedPeakSpeedKmh: 45,
    minMovementDistanceMeters: 150,
    minMovementGpsPoints: 3,
  },
  rideVerification: {
    maxAllowedAverageSpeedKmh: 35,
    maxAllowedPeakSpeedKmh: 45,
    minMovementDistanceMeters: 150,
    minMovementGpsPoints: 3,
    minVerifiedMinutes: 1,
  },
  impact: {
    distanceUnit: "km" as const,
    co2KgPerKm: 0.021,
  },
  campaigns: {
    defaultMultiplier: 1,
    defaultDurationDays: 30,
    defaultSignupDeadlineDays: 7,
    defaultMaxRiders: 50,
    requireApproval: false,
  },
  suggestedRoutes: {
    standardRideEnabled: true,
    defaultMultiplier: 1.5,
    complianceThreshold: 0.7,
    maxDailyBonusPoints: 300,
    maxPerRouteBonusTotal: 10000,
  },
  features: {
    rewardsShopEnabled: true,
    routeTemplatesEnabled: true,
    autoAssignmentEnabled: false,
    realtimeTrackingEnabled: true,
    emailNotificationsEnabled: true,
    // LLM route intelligence — all off by default (shadow mode, never live)
    llmGlobalDisable: true,
    llmShadowModeEnabled: false,
    llmRouteSuggestionsEnabled: false,
    llmRouteExplanationsEnabled: false,
    llmPolicyTranslationEnabled: false,
  },
  notifications: {
    operationsEmailEnabled: true,
    maintenanceNotificationsEnabled: true,
    waitlistNotificationsEnabled: true,
    onboardingSetupNotificationsEnabled: true,
    digestFrequency: "daily",
    alertRouting: "support_and_admin",
    fraudAlertEmail: "",
  },
  security: {
    enforceAdminMfa: true,
    adminSessionTimeoutMinutes: 60,
    auditRetentionDays: 365,
    allowPasswordResetLinks: true,
    allowAccountSetupLinks: true,
    inviteDomainAllowlist: [],
  },
  integrations: {
    routeOptimizerDashboardUrl: "",
    mapsProviderLabel: "MapLibre",
    mediaCdnBaseUrl: "",
    webhookStatusPageUrl: "",
  },
  organization: {
    displayName: "MOVRR Media",
    legalCompanyName: "MOVRR Media",
    supportContactName: "MOVRR Support",
    billingContactEmail: "",
    vatId: "",
    businessAddress: "",
    brandPrimaryLogoUrl: "",
  },
  privacy: {
    waitlistRetentionDays: 180,
    auditRetentionVisibilityDays: 365,
    exportRequestResponseHours: 72,
    deletionPolicyText: "",
    privacyContactEmail: "",
    retentionLastRunAt: null,
  },
  billing: {
    connectionStatus: "not_connected",
    planName: "Not connected",
    planStatus: "inactive",
    invoiceContactEmail: "",
    billingPortalUrl: "",
    usageSummary: "Billing integration has not been connected yet.",
    entitlements: [],
  },
};

export const READ_ONLY_SECTIONS = new Set<SettingsSectionId>(["billing"]);

export const ENV_MANAGED_FIELDS: Record<SettingsSectionId, string[]> = {
  general: ["appVersion"],
  onboarding: [],
  rewards: [],
  rideVerification: [],
  impact: [],
  campaigns: [],
  suggestedRoutes: [],
  features: [],
  notifications: [],
  security: [],
  integrations: [],
  organization: [],
  privacy: [],
  billing: [
    "connectionStatus",
    "planName",
    "planStatus",
    "usageSummary",
    "entitlements",
  ],
};

const getSectionSchema = (section: SettingsSectionId) =>
  sectionSchemas[section];

const deriveBillingSection = (values: AdminSettingsValues): BillingSettings =>
  billingSettingsSchema.parse({
    connectionStatus: "not_connected",
    planName: "Not connected",
    planStatus: "inactive",
    invoiceContactEmail:
      values.organization.billingContactEmail || values.general.supportEmail,
    billingPortalUrl: "",
    usageSummary:
      "Billing provider has not been connected to MOVRR Admin yet. Use your billing provider portal or internal finance process.",
    entitlements: [],
  });

const mapLegacyRows = (rows: SettingsRow[], merged: AdminSettingsValues) => {
  for (const row of rows) {
    if (!row?.key || !row.value) continue;

    switch (row.key) {
      case "system": {
        const system = row.value as Record<string, unknown>;
        merged.general = generalSettingsSchema.parse({
          ...merged.general,
          supportEmail: system.supportEmail ?? merged.general.supportEmail,
          publicSupportEmail:
            system.supportEmail ?? merged.general.publicSupportEmail,
          defaultRegion: system.defaultRegion ?? merged.general.defaultRegion,
          timezone: system.timezone ?? merged.general.timezone,
          appVersion: system.appVersion ?? merged.general.appVersion,
          maintenanceMode:
            system.maintenanceMode ?? merged.general.maintenanceMode,
        });
        merged.onboarding = onboardingSettingsSchema.parse({
          ...merged.onboarding,
          riderOnboardingMode:
            system.allowSelfSignup === false
              ? "waitlist_only"
              : merged.onboarding.riderOnboardingMode,
        });
        break;
      }
      case "points":
        merged.rewards = rewardsSettingsSchema.parse({
          ...merged.rewards,
          ...(row.value ?? {}),
        });
        break;
      case "campaignDefaults":
        merged.campaigns = campaignSettingsSchema.parse({
          ...merged.campaigns,
          ...(row.value ?? {}),
        });
        break;
      case "featureFlags": {
        const next = featureSettingsSchema.parse({
          ...merged.features,
          ...(row.value ?? {}),
        });
        merged.features = next;
        merged.notifications = notificationSettingsSchema.parse({
          ...merged.notifications,
          operationsEmailEnabled: next.emailNotificationsEnabled,
        });
        break;
      }
      default:
        break;
    }
  }
};

export const parseAdminRecipients = (raw: string | undefined) => {
  const list = (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (list.length > 0) {
    return Array.from(new Set(list));
  }

  return ADMIN_EMAIL ? [ADMIN_EMAIL.toLowerCase()] : [];
};

export const isInviteDomainAllowed = (
  email: string,
  allowlist: string[],
): boolean => {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return false;
  if (allowlist.length === 0) return true;
  return allowlist.map((item) => item.toLowerCase()).includes(domain);
};

export const mergeSettingsRows = (rows: SettingsRow[]): AdminSettingsValues => {
  const merged = structuredClone(DEFAULT_SETTINGS) as AdminSettingsValues;

  for (const section of Object.keys(sectionSchemas) as SettingsSectionId[]) {
    const row = rows.find((candidate) => candidate.key === section);
    if (!row?.value) continue;

    (merged as Record<string, unknown>)[section] = getSectionSchema(
      section,
    ).parse({
      ...(merged[section] as Record<string, unknown>),
      ...row.value,
    });
  }

  mapLegacyRows(rows, merged);

  // Migration seeding: if no dedicated rideVerification row exists yet, seed from
  // the rewards row so admins don't see a blank section on first visit.
  const hasRideVerificationRow = rows.some(
    (r) => r.key === "rideVerification" && r.value,
  );
  if (!hasRideVerificationRow) {
    merged.rideVerification = rideVerificationSettingsSchema.parse({
      maxAllowedAverageSpeedKmh: merged.rewards.maxAllowedAverageSpeedKmh,
      maxAllowedPeakSpeedKmh: merged.rewards.maxAllowedPeakSpeedKmh,
      minMovementDistanceMeters: merged.rewards.minMovementDistanceMeters,
      minMovementGpsPoints: merged.rewards.minMovementGpsPoints,
      minVerifiedMinutes: merged.rewards.minVerifiedMinutes,
    });
  }

  // Migration seeding: if no dedicated impact row exists, seed from general.
  const hasImpactRow = rows.some((r) => r.key === "impact" && r.value);
  if (!hasImpactRow) {
    merged.impact = impactSettingsSchema.parse({
      distanceUnit: merged.general.distanceUnit,
      co2KgPerKm: merged.general.co2KgPerKm,
    });
  }

  merged.general.appVersion = DEFAULT_SETTINGS.general.appVersion;
  merged.general.supportEmail =
    merged.general.supportEmail || SUPPORT_EMAIL || "support@movrr.nl";
  merged.general.publicSupportEmail =
    merged.general.publicSupportEmail ||
    merged.general.supportEmail ||
    SUPPORT_EMAIL ||
    "support@movrr.nl";
  merged.organization.billingContactEmail =
    merged.organization.billingContactEmail ||
    merged.general.supportEmail ||
    "";
  merged.privacy.privacyContactEmail =
    merged.privacy.privacyContactEmail ||
    merged.general.publicSupportEmail ||
    "";
  merged.notifications.operationsEmailEnabled =
    merged.features.emailNotificationsEnabled;
  merged.billing = deriveBillingSection(merged);

  return merged;
};

export async function loadSettingsRows() {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("admin_settings")
    .select("key, value, updated_at")
    .in("key", SETTINGS_KEYS);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SettingsRow[];
}

export async function getResolvedPlatformSettingsValues() {
  const rows = await loadSettingsRows();
  return mergeSettingsRows(rows);
}

export async function getPublicOnboardingPolicyValues() {
  const values = await getResolvedPlatformSettingsValues();
  return {
    riderOnboardingMode: values.onboarding.riderOnboardingMode,
    requireCity: values.onboarding.requireCity,
    requireCountry: values.onboarding.requireCountry,
    autoApproveWaitlist: values.onboarding.autoApproveWaitlist,
    setupEmailEnabled: values.onboarding.setupEmailEnabled,
    supportEmail:
      values.general.publicSupportEmail || values.general.supportEmail,
    defaultLanguage: values.onboarding.defaultRiderLanguage,
    defaultTimezone: values.onboarding.defaultRiderTimezone,
    maintenanceMode: values.general.maintenanceMode,
    appUrl: APP_URL,
  };
}

export async function getPlatformSecurityPolicy() {
  const values = await getResolvedPlatformSettingsValues();
  return values.security;
}

export async function getPlatformNotificationPolicy() {
  const values = await getResolvedPlatformSettingsValues();
  return values.notifications;
}

export async function getPlatformPrivacyPolicy() {
  const values = await getResolvedPlatformSettingsValues();
  return values.privacy;
}

export async function getPlatformOperationalPolicies() {
  const values = await getResolvedPlatformSettingsValues();
  return {
    onboarding: values.onboarding,
    notifications: values.notifications,
    privacy: values.privacy,
    security: values.security,
    general: values.general,
    organization: values.organization,
  };
}

export async function getPublicPlatformConfig() {
  const values = await getResolvedPlatformSettingsValues();
  const r = values.rewards;
  const rv = values.rideVerification;
  const imp = values.impact;
  const g = values.general;
  const f = values.features;
  const sr = values.suggestedRoutes;
  return {
    // Reward engine config — ride earning params come from rewards; verification
    // thresholds come from rideVerification (canonical after IA restructure).
    config: {
      basePointsPerMinute: r.basePointsPerMinute,
      dailyCap: r.dailyCap,
      weeklyCap: r.weeklyCap,
      campaignMaxRewardCap: r.campaignMaxRewardCap,
      minVerifiedMinutes: rv.minVerifiedMinutes,
      standardBikeMultiplier: r.standardBikeMultiplier,
      eBikeMultiplier: r.eBikeMultiplier,
      fatBikeMultiplier: r.fatBikeMultiplier,
      boostedRideMultiplier: r.boostedRideMultiplier,
      maxAllowedAverageSpeedKmh: rv.maxAllowedAverageSpeedKmh,
      maxAllowedPeakSpeedKmh: rv.maxAllowedPeakSpeedKmh,
      minMovementDistanceMeters: rv.minMovementDistanceMeters,
      minMovementGpsPoints: rv.minMovementGpsPoints,
    },
    // Impact & reporting
    impact: {
      distanceUnit: imp.distanceUnit,
      co2KgPerKm: imp.co2KgPerKm,
    },
    // Operational state — mobile must check before starting any session
    operational: {
      maintenanceMode: g.maintenanceMode,
      maintenanceScope: g.maintenanceScope,
      maintenanceMessage: g.maintenanceMessage,
    },
    // Feature flags
    features: {
      rewardsShopEnabled: f.rewardsShopEnabled,
      routeTemplatesEnabled: f.routeTemplatesEnabled,
      autoAssignmentEnabled: f.autoAssignmentEnabled,
      realtimeTrackingEnabled: f.realtimeTrackingEnabled,
    },
    // Standard Ride Mode config — synced to mobile for compliance scoring and bonus UI.
    standardRide: {
      standardRideEnabled: sr.standardRideEnabled,
      defaultMultiplier: sr.defaultMultiplier,
      complianceThreshold: sr.complianceThreshold,
      maxDailyBonusPoints: sr.maxDailyBonusPoints,
      maxPerRouteBonusTotal: sr.maxPerRouteBonusTotal,
    },
  };
}

/** @deprecated Use getPublicPlatformConfig */
export async function getPublicRewardsConfig() {
  const platform = await getPublicPlatformConfig();
  return platform.config;
}

export async function getPlatformIntegrationRuntimeDefaults() {
  const values = await getResolvedPlatformSettingsValues();
  return {
    adminNotificationRecipients: parseAdminRecipients(ADMIN_EMAILS),
    optimizerConfigured: Boolean(ROUTE_OPTIMIZER_URL),
    mapConfigured: Boolean(NEXT_PUBLIC_MAP_STYLE_URL),
    mediaConfigured: Boolean(
      NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET ||
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    ),
    values,
  };
}
