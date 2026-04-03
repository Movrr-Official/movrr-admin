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
  integrationsSettingsSchema,
  notificationSettingsSchema,
  onboardingSettingsSchema,
  organizationSettingsSchema,
  privacySettingsSchema,
  rewardsSettingsSchema,
  securitySettingsSchema,
  type SettingsSectionId,
} from "@/schemas/settings";

const LEGACY_KEYS = ["system", "points", "campaignDefaults", "featureFlags"] as const;
const SETTINGS_KEYS = [
  "general",
  "onboarding",
  "rewards",
  "campaigns",
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
  campaigns: campaignSettingsSchema,
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
    publicSupportContactName: "Movrr Support",
    defaultRegion: "NL",
    timezone: "Europe/Amsterdam",
    defaultLanguage: "en",
    defaultCurrency: "EUR",
    appVersion: "0.1.0",
    maintenanceMode: false,
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
    campaignRideMultiplier: 1.5,
    maxAllowedAverageSpeedKmh: 35,
    maxAllowedPeakSpeedKmh: 45,
    minMovementDistanceMeters: 150,
    minMovementGpsPoints: 3,
  },
  campaigns: {
    defaultMultiplier: 1,
    defaultDurationDays: 30,
    defaultSignupDeadlineDays: 7,
    defaultMaxRiders: 50,
    requireApproval: false,
  },
  features: {
    rewardsShopEnabled: true,
    routeTemplatesEnabled: true,
    autoAssignmentEnabled: false,
    realtimeTrackingEnabled: true,
    emailNotificationsEnabled: true,
  },
  notifications: {
    operationsEmailEnabled: true,
    maintenanceNotificationsEnabled: true,
    waitlistNotificationsEnabled: true,
    onboardingSetupNotificationsEnabled: true,
    digestFrequency: "daily",
    alertRouting: "support_and_admin",
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
    displayName: "Movrr Media",
    legalCompanyName: "Movrr Media",
    supportContactName: "Movrr Support",
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
  campaigns: [],
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

const getSectionSchema = (section: SettingsSectionId) => sectionSchemas[section];

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

    (merged as Record<string, unknown>)[section] = getSectionSchema(section).parse({
      ...(merged[section] as Record<string, unknown>),
      ...row.value,
    });
  }

  mapLegacyRows(rows, merged);

  merged.general.appVersion = DEFAULT_SETTINGS.general.appVersion;
  merged.general.supportEmail =
    merged.general.supportEmail || SUPPORT_EMAIL || "support@movrr.nl";
  merged.general.publicSupportEmail =
    merged.general.publicSupportEmail ||
    merged.general.supportEmail ||
    SUPPORT_EMAIL ||
    "support@movrr.nl";
  merged.organization.billingContactEmail =
    merged.organization.billingContactEmail || merged.general.supportEmail || "";
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
    supportEmail: values.general.publicSupportEmail || values.general.supportEmail,
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

export async function getPublicRewardsConfig() {
  const values = await getResolvedPlatformSettingsValues();
  const r = values.rewards;
  return {
    basePointsPerMinute: r.basePointsPerMinute,
    dailyCap: r.dailyCap,
    weeklyCap: r.weeklyCap,
    campaignMaxRewardCap: r.campaignMaxRewardCap,
    minVerifiedMinutes: r.minVerifiedMinutes,
    standardBikeMultiplier: r.standardBikeMultiplier,
    eBikeMultiplier: r.eBikeMultiplier,
    fatBikeMultiplier: r.fatBikeMultiplier,
    campaignRideMultiplier: r.campaignRideMultiplier,
    maxAllowedAverageSpeedKmh: r.maxAllowedAverageSpeedKmh,
    maxAllowedPeakSpeedKmh: r.maxAllowedPeakSpeedKmh,
    minMovementDistanceMeters: r.minMovementDistanceMeters,
    minMovementGpsPoints: r.minMovementGpsPoints,
  };
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
