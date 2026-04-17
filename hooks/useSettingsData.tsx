"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminSettings } from "@/app/actions/settings";
import {
  type AdminSettingsResponse,
  type AdminSettingsValues,
  adminSettingsValuesSchema,
} from "@/schemas/settings";
import { shouldUseMockData } from "@/lib/dataSource";

export const PLATFORM_SETTINGS_QUERY_KEY = ["adminSettings"] as const;

const fallbackValues: AdminSettingsValues = adminSettingsValuesSchema.parse({
  general: {
    supportEmail: "support@movrr.nl",
    publicSupportEmail: "support@movrr.nl",
    publicSupportContactName: "MOVRR Support",
    defaultRegion: "NL",
    timezone: "Europe/Amsterdam",
    defaultLanguage: "en",
    defaultCurrency: "EUR",
    appVersion: "0.1.0",
    maintenanceMode: false,
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
  },
  rideVerification: {
    maxAllowedAverageSpeedKmh: 35,
    maxAllowedPeakSpeedKmh: 45,
    minMovementDistanceMeters: 150,
    minMovementGpsPoints: 3,
    minVerifiedMinutes: 1,
  },
  impact: {
    distanceUnit: "km",
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
});

const fallbackSettings: AdminSettingsResponse = {
  values: fallbackValues,
  missingSections: [],
  metadata: {
    general: { source: "database", managedBy: "admin", readOnly: false },
    onboarding: { source: "database", managedBy: "admin", readOnly: false },
    rewards: { source: "database", managedBy: "admin", readOnly: false },
    rideVerification: {
      source: "database",
      managedBy: "admin",
      readOnly: false,
    },
    impact: { source: "database", managedBy: "admin", readOnly: false },
    campaigns: { source: "database", managedBy: "admin", readOnly: false },
    suggestedRoutes: {
      source: "database",
      managedBy: "admin",
      readOnly: false,
    },
    features: { source: "database", managedBy: "admin", readOnly: false },
    notifications: { source: "database", managedBy: "admin", readOnly: false },
    security: { source: "database", managedBy: "admin", readOnly: false },
    integrations: { source: "hybrid", managedBy: "hybrid", readOnly: false },
    organization: { source: "database", managedBy: "admin", readOnly: false },
    privacy: { source: "database", managedBy: "admin", readOnly: false },
    billing: { source: "derived", managedBy: "system", readOnly: true },
  },
  runtime: {
    integrationStatus: [],
    adminNotificationRecipients: ["admin@movrr.nl"],
    envManagedFields: {
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
    },
    billing: {
      available: false,
      message:
        "Billing is not connected in MOVRR Admin yet. Use your billing provider portal or internal finance process.",
    },
  },
};

export const useSettingsData = (options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) =>
  useQuery<AdminSettingsResponse>({
    queryKey: PLATFORM_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      if (shouldUseMockData()) {
        return fallbackSettings;
      }

      const result = await getAdminSettings();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to load admin settings");
      }

      return result.data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60,
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true,
  });
