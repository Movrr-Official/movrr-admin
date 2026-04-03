"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";
import {
  ADMIN_EMAIL,
  ADMIN_EMAILS,
  APP_URL,
  FROM_EMAIL,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_MAP_STYLE_URL,
  NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET,
  RESEND_API_KEY,
  ROUTE_OPTIMIZER_URL,
  SUPPORT_EMAIL,
} from "@/lib/env";
import {
  type AdminSettingsResponse,
  type AdminSettingsValues,
  type BillingSettings,
  type IntegrationStatusCard,
  type SettingsActor,
  type SettingsAuditEntry,
  type SettingsSectionId,
  adminSettingsValuesSchema,
  billingSettingsSchema,
  campaignSettingsSchema,
  featureSettingsSchema,
  generalSettingsSchema,
  impactSettingsSchema,
  integrationsSettingsSchema,
  notificationSettingsSchema,
  onboardingModeSchema,
  onboardingSettingsSchema,
  organizationSettingsSchema,
  privacySettingsSchema,
  rewardsSettingsSchema,
  rideVerificationSettingsSchema,
  securitySettingsSchema,
  settingsSectionIdSchema,
} from "@/schemas/settings";

const LEGACY_KEYS = ["system", "points", "campaignDefaults", "featureFlags"] as const;
const SETTINGS_KEYS = [
  "general",
  "onboarding",
  "rewards",
  "rideVerification",
  "impact",
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

type PersistedSettingsKey = (typeof SETTINGS_KEYS)[number];

type SettingsRow = {
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
  features: featureSettingsSchema,
  notifications: notificationSettingsSchema,
  security: securitySettingsSchema,
  integrations: integrationsSettingsSchema,
  organization: organizationSettingsSchema,
  privacy: privacySettingsSchema,
  billing: billingSettingsSchema,
} as const;

const DEFAULT_SETTINGS: AdminSettingsValues = adminSettingsValuesSchema.parse({
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
    fraudAlertEmail: "",
  },
  security: {
    enforceAdminMfa: false,
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
});

const RISKY_FIELDS: Partial<
  Record<SettingsSectionId, Array<{ path: string; label: string }>>
> = {
  general: [
    { path: "maintenanceMode", label: "Maintenance mode" },
    { path: "maintenanceScope", label: "Maintenance scope" },
  ],
  onboarding: [{ path: "riderOnboardingMode", label: "Rider onboarding mode" }],
  features: [
    { path: "realtimeTrackingEnabled", label: "Realtime tracking" },
    { path: "autoAssignmentEnabled", label: "Auto assignment" },
  ],
  security: [
    { path: "enforceAdminMfa", label: "Admin MFA enforcement" },
    { path: "allowPasswordResetLinks", label: "Password reset links" },
    { path: "allowAccountSetupLinks", label: "Account setup links" },
  ],
};

const READ_ONLY_SECTIONS = new Set<SettingsSectionId>(["billing"]);

const ENV_MANAGED_FIELDS: Record<SettingsSectionId, string[]> = {
  general: ["appVersion"],
  onboarding: [],
  rewards: [],
  rideVerification: [],
  impact: [],
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

const parseAdminRecipients = (raw: string | undefined) => {
  const list = (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (list.length > 0) {
    return Array.from(new Set(list));
  }

  return ADMIN_EMAIL ? [ADMIN_EMAIL.toLowerCase()] : [];
};

const getSectionSchema = (section: SettingsSectionId) => sectionSchemas[section];

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

const mergeRows = (rows: SettingsRow[]): AdminSettingsValues => {
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

const getChangedFields = (
  previousValue: Record<string, unknown>,
  nextValue: Record<string, unknown>,
) => {
  const keys = new Set([
    ...Object.keys(previousValue),
    ...Object.keys(nextValue),
  ]);

  return Array.from(keys).filter(
    (key) =>
      JSON.stringify(previousValue[key]) !== JSON.stringify(nextValue[key]),
  );
};

const getRiskyChanges = (
  section: SettingsSectionId,
  previousValue: Record<string, unknown>,
  nextValue: Record<string, unknown>,
) => {
  const riskyFields = RISKY_FIELDS[section] ?? [];
  return riskyFields
    .filter(
      ({ path }) =>
        JSON.stringify(previousValue[path]) !== JSON.stringify(nextValue[path]),
    )
    .map((entry) => entry.label);
};

const deriveIntegrationStatus = async (): Promise<IntegrationStatusCard[]> => {
  const supabaseAdmin = createSupabaseAdminClient();
  const timestamp = new Date().toISOString();

  const [databaseHealth, emailHealth, optimizerHealth] = await Promise.all([
    (async () => {
      try {
        const { error } = await supabaseAdmin
          .from("user")
          .select("id", { count: "exact", head: true })
          .limit(1);
        return { ok: !error, message: error?.message };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error ? error.message : "Database check failed.",
        };
      }
    })(),
    (async () => {
      if (!RESEND_API_KEY) {
        return { ok: false, message: "RESEND_API_KEY is not configured." };
      }

      try {
        const resend = new Resend(RESEND_API_KEY);
        const { error } = await resend.domains.list();
        return { ok: !error, message: error?.message };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Email provider check failed.",
        };
      }
    })(),
    (async () => {
      if (!ROUTE_OPTIMIZER_URL) {
        return { ok: false, message: "ROUTE_OPTIMIZER_URL is not configured." };
      }

      try {
        const response = await fetch(new URL("/health", ROUTE_OPTIMIZER_URL), {
          method: "GET",
          cache: "no-store",
        });
        return {
          ok: response.ok,
          message: response.ok
            ? "Optimizer health check succeeded."
            : `Optimizer returned ${response.status}.`,
        };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Optimizer health check failed.",
        };
      }
    })(),
  ]);

  return [
    {
      id: "supabase",
      label: "Supabase Auth & Database",
      description:
        "Authentication, primary database, and admin server access.",
      configured: true,
      status: databaseHealth.ok ? "ok" : "error",
      managedBy: "env",
      editableFields: [],
      supportsVerification: true,
      supportsAdminEdits: false,
      lastCheckedAt: timestamp,
      details: [
        databaseHealth.ok
          ? "Database connectivity healthy."
          : databaseHealth.message || "Database check failed.",
      ],
    },
    {
      id: "email",
      label: "Email Provider",
      description:
        "Resend-based transactional mail for setup, reset, and operational alerts.",
      configured: Boolean(RESEND_API_KEY),
      status: emailHealth.ok ? "ok" : RESEND_API_KEY ? "degraded" : "error",
      managedBy: "env",
      editableFields: [],
      supportsVerification: true,
      supportsAdminEdits: false,
      lastCheckedAt: timestamp,
      details: [
        emailHealth.ok
          ? "Resend domain lookup succeeded."
          : emailHealth.message || "Email provider unavailable.",
      ],
    },
    {
      id: "optimizer",
      label: "Route Optimizer",
      description:
        "External route optimization service used by route operations.",
      configured: Boolean(ROUTE_OPTIMIZER_URL),
      status: optimizerHealth.ok
        ? "ok"
        : ROUTE_OPTIMIZER_URL
          ? "degraded"
          : "error",
      managedBy: "hybrid",
      editableFields: ["routeOptimizerDashboardUrl"],
      supportsVerification: true,
      supportsAdminEdits: true,
      lastCheckedAt: timestamp,
      details: [
        optimizerHealth.ok
          ? "Route optimizer health endpoint responded successfully."
          : optimizerHealth.message || "Route optimizer unavailable.",
      ],
    },
    {
      id: "maps",
      label: "Maps & Geocoding",
      description: "Map rendering and location overlays used in route views.",
      configured: Boolean(NEXT_PUBLIC_MAP_STYLE_URL),
      status: NEXT_PUBLIC_MAP_STYLE_URL ? "ok" : "error",
      managedBy: "hybrid",
      editableFields: ["mapsProviderLabel"],
      supportsVerification: false,
      supportsAdminEdits: true,
      lastCheckedAt: timestamp,
      details: [
        NEXT_PUBLIC_MAP_STYLE_URL
          ? "Primary map style configured from environment."
          : "NEXT_PUBLIC_MAP_STYLE_URL is not configured.",
      ],
    },
    {
      id: "media",
      label: "Media Storage",
      description: "Advertiser and asset storage for uploaded brand media.",
      configured: Boolean(
        NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET ||
          NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      ),
      status:
        NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET ||
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
          ? "ok"
          : "error",
      managedBy: "hybrid",
      editableFields: ["mediaCdnBaseUrl"],
      supportsVerification: false,
      supportsAdminEdits: true,
      lastCheckedAt: timestamp,
      details: [
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
          ? `Cloudinary cloud configured: ${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}.`
          : `Supabase bucket configured: ${NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET || "not configured"}.`,
      ],
    },
    {
      id: "webhooks",
      label: "Operational Webhooks",
      description:
        "Outbound links for status pages, webhooks, and observability handoff.",
      configured: true,
      status: "unknown",
      managedBy: "admin",
      editableFields: ["webhookStatusPageUrl"],
      supportsVerification: false,
      supportsAdminEdits: true,
      lastCheckedAt: timestamp,
      details: [
        "Operational webhook and runbook references are admin-managed in Settings.",
      ],
    },
  ];
};

const filterAuditEntriesByVisibility = (
  entries: SettingsAuditEntry[],
  visibilityDays: number,
) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - visibilityDays);
  return entries.filter(
    (entry) => new Date(entry.timestamp).getTime() >= cutoff.getTime(),
  );
};

const resolveOperationalAlertRoles = (
  alertRouting: AdminSettingsValues["notifications"]["alertRouting"],
) => {
  switch (alertRouting) {
    case "support_only":
      return ["support"];
    case "admin_only":
      return ["admin", "super_admin"];
    default:
      return ["support", "admin", "super_admin"];
  }
};

const createOperationalNotifications = async (
  input: {
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    alertRouting: AdminSettingsValues["notifications"]["alertRouting"];
  },
) => {
  const supabaseAdmin = createSupabaseAdminClient();
  const roles = resolveOperationalAlertRoles(input.alertRouting);
  const { data: recipients, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .in("role", roles);

  if (error || !recipients?.length) {
    return;
  }

  const rows = recipients.map((recipient) => ({
    user_id: recipient.user_id,
    title: input.title,
    message: input.message,
    type: "system",
    is_read: false,
    metadata: input.metadata ?? {},
  }));

  await supabaseAdmin.from("notifications").insert(rows);
};

const sendOperationalEmailAlert = async (
  subject: string,
  message: string,
) => {
  if (!RESEND_API_KEY) return;
  const recipients = parseAdminRecipients(ADMIN_EMAILS);
  if (recipients.length === 0) return;

  const resend = new Resend(RESEND_API_KEY);
  await resend.emails.send({
    from: FROM_EMAIL
      ? `Movrr System <${FROM_EMAIL}>`
      : "Movrr <no-reply@movrr.nl>",
    to: recipients,
    subject,
    html: `<p>${message}</p>`,
  });
};

const buildAuditActor = (
  auth: Awaited<ReturnType<typeof requireAdminRoles>>,
): SettingsActor => ({
  id: auth.authUser.id,
  name:
    auth.authUser.user_metadata?.full_name ||
    auth.authUser.user_metadata?.name ||
    auth.adminUser.email,
  email: auth.adminUser.email,
  role: auth.adminUser.role,
});

const fetchAuditEntries = async (
  section?: SettingsSectionId,
): Promise<SettingsAuditEntry[]> => {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("audit_log")
    .select("*")
    .eq("action", "System Settings Changed")
    .order("timestamp", { ascending: false })
    .limit(100);

  if (error) {
    logger.error("Failed to load settings audit entries", error);
    return [];
  }

  const entries = (data ?? []).map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const auditSection = metadata.section;

      if (
        !auditSection ||
        !settingsSectionIdSchema.safeParse(auditSection).success
      ) {
        return null;
      }

      const performedBy = (row.performed_by ?? {}) as Record<string, unknown>;

      return {
        id: String(row.id),
        section: auditSection as SettingsSectionId,
        action: String(row.action ?? "System Settings Changed"),
        timestamp: String(row.timestamp ?? new Date().toISOString()),
        performedBy: {
          id: String(performedBy.id ?? "system"),
          name: String(performedBy.name ?? "System"),
          email: String(performedBy.email ?? "system@movrr.nl"),
          role: String(performedBy.role ?? "system"),
        },
        changedFields: Array.isArray(metadata.changedFields)
          ? metadata.changedFields.map((item) => String(item))
          : [],
        previousValue:
          metadata.previousValue && typeof metadata.previousValue === "object"
            ? (metadata.previousValue as Record<string, unknown>)
            : undefined,
        newValue:
          metadata.newValue && typeof metadata.newValue === "object"
            ? (metadata.newValue as Record<string, unknown>)
            : undefined,
        snapshotAvailable: Boolean(metadata.snapshot),
      } as SettingsAuditEntry;
    });

  return entries
    .filter((entry): entry is SettingsAuditEntry => entry !== null)
    .filter((entry) => (section ? entry.section === section : true));
};

const buildMetadata = async (
  rows: SettingsRow[],
  auditEntries: SettingsAuditEntry[],
): Promise<AdminSettingsResponse["metadata"]> => {
  const metadata = {} as AdminSettingsResponse["metadata"];

  for (const section of Object.keys(sectionSchemas) as SettingsSectionId[]) {
    const row = rows.find((candidate) => candidate.key === section);
    const latestAudit = auditEntries.find((entry) => entry.section === section);

    metadata[section] = {
      updatedAt: row?.updated_at ?? latestAudit?.timestamp,
      updatedBy: latestAudit?.performedBy,
      source:
        section === "billing"
          ? "derived"
          : section === "integrations"
            ? "hybrid"
            : "database",
      managedBy:
        section === "billing"
          ? "system"
          : ENV_MANAGED_FIELDS[section].length > 0
            ? ENV_MANAGED_FIELDS[section].length ===
              Object.keys(DEFAULT_SETTINGS[section]).length
              ? "env"
              : "hybrid"
            : "admin",
      readOnly: READ_ONLY_SECTIONS.has(section),
    };
  }

  return metadata;
};

async function loadSettingsRows() {
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

export async function getAdminSettings(): Promise<{
  success: boolean;
  data?: AdminSettingsResponse;
  error?: string;
}> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const [rows, auditEntries, integrationStatus] = await Promise.all([
      loadSettingsRows(),
      fetchAuditEntries(),
      deriveIntegrationStatus(),
    ]);

    const values = mergeRows(rows);
    const visibleAuditEntries = filterAuditEntriesByVisibility(
      auditEntries,
      values.privacy.auditRetentionVisibilityDays,
    );
    const metadata = await buildMetadata(rows, visibleAuditEntries);

    return {
      success: true,
      data: {
        values,
        metadata,
        runtime: {
          integrationStatus,
          adminNotificationRecipients: parseAdminRecipients(ADMIN_EMAILS),
          envManagedFields: ENV_MANAGED_FIELDS,
          billing: {
            available: false,
            message:
              "Billing is not connected in MOVRR Admin yet. Use your billing provider portal or internal finance process.",
          },
        },
      },
    };
  } catch (error) {
    logger.error("Failed to load admin settings", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load admin settings",
    };
  }
}

export async function getSettingsSection(section: SettingsSectionId) {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const result = await getAdminSettings();

    if (!result.success || !result.data) {
      return {
        success: false as const,
        error: result.error || "Failed to load settings",
      };
    }

    return {
      success: true as const,
      data: {
        value: result.data.values[section],
        metadata: result.data.metadata[section],
        runtime: result.data.runtime,
      },
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error ? error.message : "Failed to load section",
    };
  }
}

export async function getSettingsAudit(section?: SettingsSectionId) {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const [rows, entries] = await Promise.all([
      loadSettingsRows(),
      fetchAuditEntries(section),
    ]);
    const values = mergeRows(rows);
    return {
      success: true as const,
      data: filterAuditEntriesByVisibility(
        entries,
        values.privacy.auditRetentionVisibilityDays,
      ),
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load settings audit",
    };
  }
}

export async function recheckIntegrationStatus() {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const data = await deriveIntegrationStatus();
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Failed to recheck integration status",
    };
  }
}

export async function executePrivacyRetentionJob() {
  const supabaseAdmin = createSupabaseAdminClient();
  const rows = await loadSettingsRows();
  const values = mergeRows(rows);

  const waitlistCutoff = new Date();
  waitlistCutoff.setDate(
    waitlistCutoff.getDate() - values.privacy.waitlistRetentionDays,
  );

  const auditCutoff = new Date();
  auditCutoff.setDate(
    auditCutoff.getDate() - values.security.auditRetentionDays,
  );

  const { data: staleWaitlistRows } = await supabaseAdmin
    .from("waitlist")
    .select("id", { count: "exact" })
    .lt("created_at", waitlistCutoff.toISOString())
    .eq("converted_to_user", false);

  const { error: deleteWaitlistError } = await supabaseAdmin
    .from("waitlist")
    .delete()
    .lt("created_at", waitlistCutoff.toISOString())
    .eq("converted_to_user", false);

  if (deleteWaitlistError) {
    throw new Error(deleteWaitlistError.message);
  }

  const { data: staleAuditRows } = await supabaseAdmin
    .from("audit_log")
    .select("id", { count: "exact" })
    .lt("timestamp", auditCutoff.toISOString())
    .neq("action", "System Settings Changed");

  const { error: deleteAuditError } = await supabaseAdmin
    .from("audit_log")
    .delete()
    .lt("timestamp", auditCutoff.toISOString())
    .neq("action", "System Settings Changed");

  if (deleteAuditError) {
    throw new Error(deleteAuditError.message);
  }

  const executedAt = new Date().toISOString();

  // Stamp retentionLastRunAt into the persisted privacy settings so the admin
  // UI can surface when the job last ran without a separate table.
  const currentRows = await loadSettingsRows();
  const currentValues = mergeRows(currentRows);
  const privacyRow = currentRows.find((r) => r.key === "privacy");
  const nextPrivacyValue = {
    ...(privacyRow?.value ?? currentValues.privacy),
    retentionLastRunAt: executedAt,
  };
  await supabaseAdmin.from("admin_settings").upsert(
    { key: "privacy", value: nextPrivacyValue, updated_at: executedAt },
    { onConflict: "key" },
  );

  return {
    success: true as const,
    data: {
      waitlistDeleted: staleWaitlistRows?.length ?? 0,
      auditDeleted: staleAuditRows?.length ?? 0,
      executedAt,
      waitlistCutoff: waitlistCutoff.toISOString(),
      auditCutoff: auditCutoff.toISOString(),
    },
  };
}

export async function updateSettingsSection(input: {
  section: SettingsSectionId;
  data: Record<string, unknown>;
  confirmedRiskyChanges?: boolean;
}): Promise<{
  success: boolean;
  error?: string;
  requiresConfirmation?: boolean;
  riskyChanges?: string[];
}> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const section = settingsSectionIdSchema.parse(input.section);

    if (READ_ONLY_SECTIONS.has(section)) {
      return {
        success: false,
        error:
          "This settings section is read-only until its provider integration is connected.",
      };
    }

    const result = await getAdminSettings();
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || "Failed to load existing settings",
      };
    }

    const previousSectionValue = result.data.values[section] as Record<
      string,
      unknown
    >;
    const schema = getSectionSchema(section);
    const sanitizedInput = { ...(input.data ?? {}) };

    for (const field of ENV_MANAGED_FIELDS[section]) {
      if (field in sanitizedInput) {
        delete sanitizedInput[field];
      }
    }

    const nextSectionValue = schema.parse({
      ...previousSectionValue,
      ...sanitizedInput,
    }) as Record<string, unknown>;
    const changedFields = getChangedFields(
      previousSectionValue,
      nextSectionValue,
    );

    if (changedFields.length === 0) {
      return { success: true };
    }

    const riskyChanges = getRiskyChanges(
      section,
      previousSectionValue,
      nextSectionValue,
    );
    if (riskyChanges.length > 0 && !input.confirmedRiskyChanges) {
      return {
        success: false,
        requiresConfirmation: true,
        riskyChanges,
        error:
          "This change affects a high-impact platform setting and requires confirmation.",
      };
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("admin_settings").upsert(
      {
        key: section,
        value: nextSectionValue,
        updated_at: now,
        created_at: now,
      },
      { onConflict: "key" },
    );

    if (error) {
      logger.error("Failed to update settings section", error, { section });
      return { success: false, error: error.message };
    }

    const actor = buildAuditActor(auth);
    const { error: auditError } = await supabaseAdmin.from("audit_log").insert({
      action: "System Settings Changed",
      result: "Success",
      performed_by: actor,
      affected_entity: {
        type: "settings_section",
        id: section,
        name: section,
      },
      resource_id: section,
      metadata: {
        section,
        changedFields,
        previousValue: previousSectionValue,
        newValue: nextSectionValue,
        snapshot: nextSectionValue,
      },
      timestamp: now,
    });

    if (auditError) {
      logger.warn("Settings update succeeded but audit log write failed", {
        section,
        message: auditError.message,
      });
    }

    if (
      section === "general" &&
      changedFields.includes("maintenanceMode") &&
      result.data.values.notifications.operationsEmailEnabled &&
      result.data.values.notifications.maintenanceNotificationsEnabled
    ) {
      const enabled = Boolean(nextSectionValue.maintenanceMode);
      const title = enabled
        ? "MOVRR maintenance mode enabled"
        : "MOVRR maintenance mode disabled";
      const message = enabled
        ? "Maintenance mode has been enabled from Settings. Operator review is recommended."
        : "Maintenance mode has been disabled and operator access should be back to normal.";

      await Promise.allSettled([
        sendOperationalEmailAlert(title, message),
        createOperationalNotifications({
          title,
          message,
          alertRouting: result.data.values.notifications.alertRouting,
          metadata: {
            section,
            maintenanceMode: enabled,
          },
        }),
      ]);
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    logger.error("Failed to update settings section", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update settings section",
    };
  }
}

export async function getLegacySettingsCompatibility() {
  const result = await getAdminSettings();
  if (!result.success || !result.data) {
    return result;
  }

  const { values } = result.data;
  return {
    success: true as const,
    data: {
      system: {
        supportEmail: values.general.supportEmail,
        defaultRegion: values.general.defaultRegion,
        timezone: values.general.timezone,
        appVersion: values.general.appVersion,
        maintenanceMode: values.general.maintenanceMode,
        allowSelfSignup: values.onboarding.riderOnboardingMode === "open",
      },
      points: values.rewards,
      campaignDefaults: values.campaigns,
      featureFlags: values.features,
    },
  };
}
