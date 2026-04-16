import { z } from "zod";

const optionalEmailSchema = z
  .union([z.literal(""), z.string().email()])
  .transform((value) => value || "");
const urlOrEmptySchema = z
  .union([z.literal(""), z.string().url()])
  .transform((value) => value || "");
const nonEmptyTrimmedString = z.string().trim().min(1);
const integer = z.coerce.number().int();
const positiveInteger = integer.min(1);
const nonNegativeInteger = integer.min(0);
const nonNegativeNumber = z.coerce.number().min(0);
const stringArraySchema = z
  .array(z.string().trim().min(1))
  .transform((values) =>
    Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))),
  );

export const settingsSectionIdSchema = z.enum([
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
]);

export type SettingsSectionId = z.infer<typeof settingsSectionIdSchema>;

export const distanceUnitSchema = z.enum(["km", "mi"]);
export const maintenanceScopeSchema = z.enum([
  "global",
  "rewards_only",
  "onboarding_only",
  "sessions_only",
]);

export const generalSettingsSchema = z.object({
  supportEmail: optionalEmailSchema.default("support@movrr.nl"),
  publicSupportEmail: optionalEmailSchema.default("support@movrr.nl"),
  publicSupportContactName: z.string().trim().max(120).default("MOVRR Support"),
  defaultRegion: nonEmptyTrimmedString.default("NL"),
  timezone: nonEmptyTrimmedString.default("Europe/Amsterdam"),
  defaultLanguage: nonEmptyTrimmedString.default("en"),
  defaultCurrency: nonEmptyTrimmedString.default("EUR"),
  appVersion: nonEmptyTrimmedString.default("0.1.0"),
  maintenanceMode: z.boolean().default(false),
  maintenanceScope: maintenanceScopeSchema.default("global"),
  maintenanceMessage: z
    .string()
    .trim()
    .max(500)
    .default(
      "The platform is temporarily unavailable for maintenance. Please check back shortly.",
    ),
  // Impact metrics
  distanceUnit: distanceUnitSchema.default("km"),
  co2KgPerKm: nonNegativeNumber.default(0.021),
});

export type MaintenanceScope = z.infer<typeof maintenanceScopeSchema>;

export const onboardingModeSchema = z.enum(["open", "waitlist_only", "closed"]);

export const onboardingSettingsSchema = z.object({
  riderOnboardingMode: onboardingModeSchema.default("open"),
  requireCity: z.boolean().default(true),
  requireCountry: z.boolean().default(true),
  autoApproveWaitlist: z.boolean().default(false),
  setupEmailEnabled: z.boolean().default(true),
  defaultRiderLanguage: nonEmptyTrimmedString.default("en"),
  defaultRiderTimezone: nonEmptyTrimmedString.default("Europe/Amsterdam"),
});

export const rewardsSettingsSchema = z.object({
  // Base earning
  basePointsPerMinute: nonNegativeInteger.default(1),
  dailyCap: nonNegativeInteger.default(1000),
  weeklyCap: nonNegativeInteger.default(600),
  campaignMaxRewardCap: nonNegativeInteger.default(1000),
  minVerifiedMinutes: nonNegativeInteger.default(1),
  // Bike-type multipliers (must stay in sync with mobile REWARD_CONFIG)
  standardBikeMultiplier: nonNegativeNumber.default(1),
  eBikeMultiplier: nonNegativeNumber.default(0.9),
  fatBikeMultiplier: nonNegativeNumber.default(0.75),
  boostedRideMultiplier: nonNegativeNumber.default(1.5),
  // Movement verification thresholds (must stay in sync with mobile REWARD_CONFIG)
  maxAllowedAverageSpeedKmh: nonNegativeNumber.default(35),
  maxAllowedPeakSpeedKmh: nonNegativeNumber.default(45),
  minMovementDistanceMeters: nonNegativeNumber.default(150),
  minMovementGpsPoints: nonNegativeInteger.default(3),
});

/**
 * Ride verification thresholds — previously embedded in rewardsSettingsSchema.
 * Now a standalone persisted section for cleaner IA. On first load, mergeSettingsRows
 * seeds these from the rewards row if no dedicated rideVerification row exists yet.
 */
export const rideVerificationSettingsSchema = z.object({
  maxAllowedAverageSpeedKmh: nonNegativeNumber.default(35),
  maxAllowedPeakSpeedKmh: nonNegativeNumber.default(45),
  minMovementDistanceMeters: nonNegativeNumber.default(150),
  minMovementGpsPoints: nonNegativeInteger.default(3),
  minVerifiedMinutes: nonNegativeInteger.default(1),
});

/**
 * Impact & reporting — distanceUnit and CO₂ factor.
 * Previously embedded in generalSettingsSchema. Seeded from general on first load.
 */
export const impactSettingsSchema = z.object({
  distanceUnit: distanceUnitSchema.default("km"),
  co2KgPerKm: nonNegativeNumber.default(0.021),
});

/**
 * Standard Ride Mode (Suggested Routes) — controls bonuses and compliance thresholds.
 * These values are synced to the mobile app via the public platform config endpoint.
 */
export const suggestedRoutesSettingsSchema = z.object({
  /** Whether the Standard Ride Mode bonus system is active platform-wide. */
  standardRideEnabled: z.boolean().default(true),
  /** Default multiplier applied to base points when a rider completes a
   *  multiplier-type suggested route. 1.0 = no multiplier. */
  defaultMultiplier: nonNegativeNumber.min(1).default(1.5),
  /** Fraction [0–1] of route waypoints the rider's GPS path must cover to
   *  qualify for a bonus. */
  complianceThreshold: nonNegativeNumber.max(1).default(0.7),
  /** Maximum bonus points any rider can earn from suggested routes per day. */
  maxDailyBonusPoints: nonNegativeInteger.default(300),
  /** Maximum total points that can be distributed from a single suggested
   *  route across all riders (0 = unlimited). */
  maxPerRouteBonusTotal: nonNegativeInteger.default(10000),
});

export type SuggestedRoutesSettings = z.infer<
  typeof suggestedRoutesSettingsSchema
>;

export const campaignSettingsSchema = z.object({
  defaultMultiplier: nonNegativeNumber.default(1),
  defaultDurationDays: positiveInteger.default(30),
  defaultSignupDeadlineDays: positiveInteger.default(7),
  defaultMaxRiders: positiveInteger.default(50),
  requireApproval: z.boolean().default(false),
});

export const featureSettingsSchema = z.object({
  rewardsShopEnabled: z.boolean().default(true),
  routeTemplatesEnabled: z.boolean().default(true),
  autoAssignmentEnabled: z.boolean().default(false),
  realtimeTrackingEnabled: z.boolean().default(true),
  emailNotificationsEnabled: z.boolean().default(true),

  // ── LLM Route Intelligence (shadow mode) ────────────────────────────────────
  // All LLM flags are false/disabled by default. llmGlobalDisable is the
  // master kill switch: when true, all LLM paths short-circuit immediately
  // regardless of the other flags. Shadow mode runs LLM in parallel with the
  // live optimizer; output is only stored internally and never shown to users.
  llmGlobalDisable: z.boolean().default(true),
  llmShadowModeEnabled: z.boolean().default(false),
  llmRouteSuggestionsEnabled: z.boolean().default(false),
  llmRouteExplanationsEnabled: z.boolean().default(false),
  llmPolicyTranslationEnabled: z.boolean().default(false),
});

export const digestFrequencySchema = z.enum(["off", "daily", "weekly"]);

export const notificationSettingsSchema = z.object({
  operationsEmailEnabled: z.boolean().default(true),
  maintenanceNotificationsEnabled: z.boolean().default(true),
  waitlistNotificationsEnabled: z.boolean().default(true),
  onboardingSetupNotificationsEnabled: z.boolean().default(true),
  digestFrequency: digestFrequencySchema.default("daily"),
  alertRouting: z
    .enum(["support_only", "support_and_admin", "admin_only"])
    .default("support_and_admin"),
  fraudAlertEmail: optionalEmailSchema.default(""),
});

export const securitySettingsSchema = z.object({
  enforceAdminMfa: z.boolean().default(true),
  adminSessionTimeoutMinutes: positiveInteger.default(60),
  auditRetentionDays: positiveInteger.default(365),
  allowPasswordResetLinks: z.boolean().default(true),
  allowAccountSetupLinks: z.boolean().default(true),
  inviteDomainAllowlist: stringArraySchema.default([]),
});

export const integrationsSettingsSchema = z.object({
  routeOptimizerDashboardUrl: urlOrEmptySchema.default(""),
  mapsProviderLabel: z.string().trim().max(80).default("MapLibre"),
  mediaCdnBaseUrl: urlOrEmptySchema.default(""),
  webhookStatusPageUrl: urlOrEmptySchema.default(""),
});

export const organizationSettingsSchema = z.object({
  displayName: z.string().trim().min(1).max(120).default("MOVRR Media"),
  legalCompanyName: z.string().trim().max(160).default("MOVRR Media"),
  supportContactName: z.string().trim().max(120).default("MOVRR Support"),
  billingContactEmail: optionalEmailSchema.default(""),
  vatId: z.string().trim().max(80).default(""),
  businessAddress: z.string().trim().max(300).default(""),
  brandPrimaryLogoUrl: urlOrEmptySchema.default(""),
});

export const privacySettingsSchema = z.object({
  waitlistRetentionDays: positiveInteger.default(180),
  auditRetentionVisibilityDays: positiveInteger.default(365),
  exportRequestResponseHours: positiveInteger.default(72),
  deletionPolicyText: z.string().trim().max(2000).default(""),
  privacyContactEmail: optionalEmailSchema.default(""),
  retentionLastRunAt: z.string().datetime().nullable().optional().default(null),
});

export const billingConnectionStatusSchema = z.enum([
  "not_connected",
  "connected",
  "degraded",
]);

export const billingSettingsSchema = z.object({
  connectionStatus: billingConnectionStatusSchema.default("not_connected"),
  planName: z.string().trim().max(120).default("Not connected"),
  planStatus: z
    .enum(["inactive", "active", "past_due", "trialing"])
    .default("inactive"),
  invoiceContactEmail: optionalEmailSchema.default(""),
  billingPortalUrl: urlOrEmptySchema.default(""),
  usageSummary: z
    .string()
    .trim()
    .max(240)
    .default("Billing integration has not been connected yet."),
  entitlements: z.array(z.string().trim().min(1)).default([]),
});

export const adminSettingsValuesSchema = z.object({
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
});

export const settingsActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.string(),
});

export const settingsSectionMetadataSchema = z.object({
  updatedAt: z.string().datetime().optional(),
  updatedBy: settingsActorSchema.optional(),
  source: z
    .enum(["database", "environment", "derived", "hybrid"])
    .default("database"),
  managedBy: z.enum(["admin", "env", "system", "hybrid"]).default("admin"),
  readOnly: z.boolean().default(false),
});

export const integrationStatusCardSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  configured: z.boolean(),
  status: z.enum(["ok", "degraded", "error", "unknown"]),
  managedBy: z.enum(["env", "admin", "hybrid", "system"]),
  editableFields: z.array(z.string()).default([]),
  supportsVerification: z.boolean().default(false),
  supportsAdminEdits: z.boolean().default(false),
  lastCheckedAt: z.string().datetime(),
  details: z.array(z.string()).default([]),
});

export const billingRuntimeSchema = z.object({
  available: z.boolean(),
  message: z.string(),
});

export const adminSettingsResponseSchema = z.object({
  values: adminSettingsValuesSchema,
  metadata: z.record(settingsSectionIdSchema, settingsSectionMetadataSchema),
  runtime: z.object({
    integrationStatus: z.array(integrationStatusCardSchema),
    adminNotificationRecipients: z.array(z.string().email()),
    envManagedFields: z.record(settingsSectionIdSchema, z.array(z.string())),
    billing: billingRuntimeSchema,
  }),
});

export const settingsAuditEntrySchema = z.object({
  id: z.string(),
  section: settingsSectionIdSchema,
  action: z.string(),
  timestamp: z.string().datetime(),
  performedBy: settingsActorSchema,
  changedFields: z.array(z.string()),
  previousValue: z.record(z.unknown()).optional(),
  newValue: z.record(z.unknown()).optional(),
  snapshotAvailable: z.boolean().default(false),
});

export const updateSettingsSectionInputSchema = z.object({
  section: settingsSectionIdSchema,
  data: z.record(z.unknown()),
  confirmedRiskyChanges: z.boolean().default(false),
});

export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
export type OnboardingSettings = z.infer<typeof onboardingSettingsSchema>;
export type RideVerificationSettings = z.infer<
  typeof rideVerificationSettingsSchema
>;
export type ImpactSettings = z.infer<typeof impactSettingsSchema>;
export type RewardsSettings = z.infer<typeof rewardsSettingsSchema>;
export type RewardsSettingsPublicConfig = Pick<
  RewardsSettings,
  | "basePointsPerMinute"
  | "dailyCap"
  | "weeklyCap"
  | "campaignMaxRewardCap"
  | "minVerifiedMinutes"
  | "standardBikeMultiplier"
  | "eBikeMultiplier"
  | "fatBikeMultiplier"
  | "boostedRideMultiplier"
  | "maxAllowedAverageSpeedKmh"
  | "maxAllowedPeakSpeedKmh"
  | "minMovementDistanceMeters"
  | "minMovementGpsPoints"
>;
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;
export type FeatureSettings = z.infer<typeof featureSettingsSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;
export type IntegrationsSettings = z.infer<typeof integrationsSettingsSchema>;
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;
export type BillingSettings = z.infer<typeof billingSettingsSchema>;
export type AdminSettingsValues = z.infer<typeof adminSettingsValuesSchema>;
export type SettingsSectionMetadata = z.infer<
  typeof settingsSectionMetadataSchema
>;
export type SettingsActor = z.infer<typeof settingsActorSchema>;
export type IntegrationStatusCard = z.infer<typeof integrationStatusCardSchema>;
export type AdminSettingsResponse = z.infer<typeof adminSettingsResponseSchema>;
export type SettingsAuditEntry = z.infer<typeof settingsAuditEntrySchema>;
export type UpdateSettingsSectionInput = z.infer<
  typeof updateSettingsSectionInputSchema
>;

export type LegacySettings = {
  system: {
    supportEmail: string;
    defaultRegion: string;
    timezone: string;
    appVersion: string;
    maintenanceMode: boolean;
    allowSelfSignup: boolean;
  };
  points: RewardsSettings;
  campaignDefaults: CampaignSettings;
  featureFlags: FeatureSettings;
};
