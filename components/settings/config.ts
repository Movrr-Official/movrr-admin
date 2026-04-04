import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  CreditCard,
  Database,
  Globe,
  Leaf,
  Mail,
  MapPin,
  Settings2,
  Shield,
  Sparkles,
} from "lucide-react";
import type { SettingsSectionId } from "@/schemas/settings";

export type SettingsFieldConfig = {
  name: string;
  label: string;
  type: "text" | "email" | "number" | "url" | "textarea" | "switch" | "select";
  description?: string;
  options?: string[];
  min?: number;
  readOnly?: boolean;
};

export type SettingsSectionConfig = {
  id: SettingsSectionId;
  title: string;
  icon: LucideIcon;
  description: string;
};

export const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  {
    id: "general",
    title: "General",
    icon: Settings2,
    description: "Global support, locale, and maintenance behavior.",
  },
  {
    id: "onboarding",
    title: "Onboarding",
    icon: Sparkles,
    description: "Rider signup, waitlist, and account setup policy.",
  },
  {
    id: "rewards",
    title: "Rewards",
    icon: Sparkles,
    description: "Global points and rewards operating defaults.",
  },
  {
    id: "rideVerification",
    title: "Ride Verification",
    icon: Activity,
    description:
      "Movement thresholds and speed limits used to verify ride sessions.",
  },
  {
    id: "impact",
    title: "Impact & Reporting",
    icon: Leaf,
    description:
      "Distance unit and CO\u2082 savings factor for rider impact calculations.",
  },
  {
    id: "campaigns",
    title: "Campaigns",
    icon: Globe,
    description: "Default campaign planning and approval rules.",
  },
  {
    id: "suggestedRoutes",
    title: "Suggested Routes",
    icon: MapPin,
    description: "Free Ride Mode: route bonuses, compliance thresholds, and daily caps.",
  },
  {
    id: "features",
    title: "Features",
    icon: Sparkles,
    description: "High-impact feature toggles and rollout controls.",
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: Mail,
    description: "Operational alert routing and messaging policy.",
  },
  {
    id: "security",
    title: "Security",
    icon: Shield,
    description: "Admin access, reset, and invite domain controls.",
  },
  {
    id: "integrations",
    title: "Integrations",
    icon: Database,
    description: "External services, health checks, and non-secret config.",
  },
  {
    id: "organization",
    title: "Organization",
    icon: Building2,
    description: "Movrr global business identity and contact metadata.",
  },
  {
    id: "privacy",
    title: "Privacy",
    icon: Shield,
    description:
      "Retention windows, export response targets, and privacy contact.",
  },
  {
    id: "billing",
    title: "Billing",
    icon: CreditCard,
    description:
      "Read-only billing readiness until provider integration is connected.",
  },
];

export const SETTINGS_OPTIONS = {
  riderOnboardingMode: ["open", "waitlist_only", "closed"],
  maintenanceScope: [
    "global",
    "rewards_only",
    "onboarding_only",
    "sessions_only",
  ],
  digestFrequency: ["off", "daily", "weekly"],
  alertRouting: ["support_only", "support_and_admin", "admin_only"],
  distanceUnit: ["km", "mi"],
} as const;

export const SETTINGS_FIELDS: Record<SettingsSectionId, SettingsFieldConfig[]> =
  {
    general: [
      { name: "supportEmail", label: "Support Email", type: "email" },
      {
        name: "publicSupportEmail",
        label: "Public Support Email",
        type: "email",
      },
      {
        name: "publicSupportContactName",
        label: "Public Support Contact Name",
        type: "text",
      },
      { name: "defaultRegion", label: "Default Region", type: "text" },
      { name: "timezone", label: "Timezone", type: "text" },
      { name: "defaultLanguage", label: "Default Language", type: "text" },
      { name: "defaultCurrency", label: "Default Currency", type: "text" },
      {
        name: "appVersion",
        label: "App Version",
        type: "text",
        readOnly: true,
      },
      {
        name: "maintenanceMode",
        label: "Maintenance Mode",
        type: "switch",
        description:
          "Enables maintenance state. The mobile app blocks new ride sessions based on the scope below.",
      },
      {
        name: "maintenanceScope",
        label: "Maintenance Scope",
        type: "select",
        options: ["global", "rewards_only", "onboarding_only", "sessions_only"],
        description:
          "Scope of the maintenance block. 'global' blocks all rider activity. 'sessions_only' blocks new rides but allows browsing.",
      },
      {
        name: "maintenanceMessage",
        label: "Maintenance Message",
        type: "textarea",
        description:
          "Message displayed to riders in the mobile app when maintenance is active.",
      },
    ],
    onboarding: [
      {
        name: "riderOnboardingMode",
        label: "Rider Onboarding Mode",
        type: "select",
        options: [...SETTINGS_OPTIONS.riderOnboardingMode],
      },
      { name: "requireCity", label: "Require City", type: "switch" },
      { name: "requireCountry", label: "Require Country", type: "switch" },
      {
        name: "autoApproveWaitlist",
        label: "Auto-Approve Waitlist",
        type: "switch",
      },
      {
        name: "setupEmailEnabled",
        label: "Setup Email Enabled",
        type: "switch",
      },
      {
        name: "defaultRiderLanguage",
        label: "Default Rider Language",
        type: "text",
      },
      {
        name: "defaultRiderTimezone",
        label: "Default Rider Timezone",
        type: "text",
      },
    ],
    rewards: [
      {
        name: "basePointsPerMinute",
        label: "Base Points / Minute (Free Ride)",
        type: "number",
        min: 0,
      },
      { name: "dailyCap", label: "Daily Cap", type: "number", min: 0 },
      { name: "weeklyCap", label: "Weekly Cap", type: "number", min: 0 },
      {
        name: "campaignMaxRewardCap",
        label: "Per-Ride Reward Cap",
        type: "number",
        min: 0,
        description:
          "Maximum points awarded per verified ride session, regardless of mode.",
      },
      {
        name: "minVerifiedMinutes",
        label: "Minimum Verified Minutes",
        type: "number",
        min: 0,
      },
      {
        name: "standardBikeMultiplier",
        label: "Standard Bike Multiplier",
        type: "number",
        min: 0,
        description:
          "Points multiplier for standard_bike riders (default 1.0).",
      },
      {
        name: "eBikeMultiplier",
        label: "E-Bike Multiplier",
        type: "number",
        min: 0,
        description: "Points multiplier for e_bike riders (default 0.9).",
      },
      {
        name: "fatBikeMultiplier",
        label: "Fat Bike Multiplier",
        type: "number",
        min: 0,
        description: "Points multiplier for fat_bike riders (default 0.75).",
      },
      {
        name: "campaignRideMultiplier",
        label: "Campaign Ride Multiplier",
        type: "number",
        min: 0,
        description:
          "Multiplier applied to points earned on campaign-assigned rides (default 1.5).",
      },
    ],
    rideVerification: [
      {
        name: "minVerifiedMinutes",
        label: "Minimum Verified Minutes",
        type: "number",
        min: 0,
        description:
          "Minimum active ride duration before any points are awarded.",
      },
      {
        name: "maxAllowedAverageSpeedKmh",
        label: "Max Allowed Average Speed (km/h)",
        type: "number",
        min: 0,
        description:
          "Rides exceeding this average speed are flagged as invalid.",
      },
      {
        name: "maxAllowedPeakSpeedKmh",
        label: "Max Allowed Peak Speed (km/h)",
        type: "number",
        min: 0,
        description:
          "Rides exceeding this peak GPS speed are flagged as invalid.",
      },
      {
        name: "minMovementDistanceMeters",
        label: "Min Movement Distance (meters)",
        type: "number",
        min: 0,
        description:
          "Minimum total GPS distance for a ride session to qualify for points.",
      },
      {
        name: "minMovementGpsPoints",
        label: "Min GPS Points",
        type: "number",
        min: 0,
        description:
          "Minimum number of GPS location points required for ride verification.",
      },
    ],
    impact: [
      {
        name: "distanceUnit",
        label: "Distance Unit",
        type: "select",
        options: ["km", "mi"],
        description: "Unit used for distance display across the platform.",
      },
      {
        name: "co2KgPerKm",
        label: "CO\u2082 Savings Factor (kg/km)",
        type: "number",
        min: 0,
        description:
          "Average CO\u2082 saved per km cycled vs. car equivalent. Used for lifetime impact calculations.",
      },
    ],
    suggestedRoutes: [
      {
        name: "freeRideEnabled",
        label: "Free Ride Mode Enabled",
        type: "switch",
        description:
          "Enables the Free Ride Mode bonus system platform-wide. Riders earn bonuses for completing admin-curated suggested routes.",
      },
      {
        name: "defaultMultiplier",
        label: "Default Multiplier",
        type: "number",
        min: 1,
        description:
          "Default points multiplier applied when a rider completes a multiplier-type suggested route (minimum 1.0).",
      },
      {
        name: "complianceThreshold",
        label: "Compliance Threshold",
        type: "number",
        min: 0,
        description:
          "Fraction of route waypoints (0–1) the rider's GPS path must cover to qualify for a bonus. Default: 0.7 (70%).",
      },
      {
        name: "maxDailyBonusPoints",
        label: "Max Daily Bonus Points",
        type: "number",
        min: 0,
        description:
          "Maximum bonus points any rider can earn from suggested routes per day.",
      },
      {
        name: "maxPerRouteBonusTotal",
        label: "Max Per-Route Bonus Total",
        type: "number",
        min: 0,
        description:
          "Maximum total points that can be distributed from a single suggested route across all riders (0 = unlimited).",
      },
    ],
    campaigns: [
      {
        name: "defaultMultiplier",
        label: "Default Multiplier",
        type: "number",
        min: 0,
      },
      {
        name: "defaultDurationDays",
        label: "Default Duration (Days)",
        type: "number",
        min: 1,
      },
      {
        name: "defaultSignupDeadlineDays",
        label: "Default Signup Deadline (Days)",
        type: "number",
        min: 1,
      },
      {
        name: "defaultMaxRiders",
        label: "Default Max Riders",
        type: "number",
        min: 1,
      },
      { name: "requireApproval", label: "Require Approval", type: "switch" },
    ],
    features: [
      {
        name: "rewardsShopEnabled",
        label: "Rewards Shop Enabled",
        type: "switch",
      },
      {
        name: "routeTemplatesEnabled",
        label: "Route Templates Enabled",
        type: "switch",
      },
      {
        name: "autoAssignmentEnabled",
        label: "Auto Assignment Enabled",
        type: "switch",
      },
      {
        name: "realtimeTrackingEnabled",
        label: "Realtime Tracking Enabled",
        type: "switch",
      },
      {
        name: "emailNotificationsEnabled",
        label: "Email Notifications Enabled",
        type: "switch",
      },
      // ── LLM Route Intelligence (shadow mode, admin-only) ──────────────────
      {
        name: "llmGlobalDisable",
        label: "LLM Global Disable",
        type: "switch",
        description:
          "Master kill switch. When ON, all LLM capabilities are immediately disabled regardless of other flags. Default: ON (disabled). Change only after internal review.",
      },
      {
        name: "llmShadowModeEnabled",
        label: "LLM Shadow Mode",
        type: "switch",
        description:
          "Runs LLM analysis in parallel with the live optimizer. Output is stored internally only — never shown to users or used in routing decisions.",
      },
      {
        name: "llmRouteSuggestionsEnabled",
        label: "LLM Route Suggestions",
        type: "switch",
        description:
          "Enables the route-suggestion capability in shadow mode. LLM suggests candidate route concepts for offline review.",
      },
      {
        name: "llmRouteExplanationsEnabled",
        label: "LLM Route Explanations",
        type: "switch",
        description:
          "Enables the route-explanation capability in shadow mode. LLM generates human-readable summaries of deterministic optimizer outputs.",
      },
      {
        name: "llmPolicyTranslationEnabled",
        label: "LLM Policy Translation",
        type: "switch",
        description:
          "Enables the policy-translation capability in shadow mode. LLM translates natural-language planning intent into structured optimizer preferences for admin review.",
      },
    ],
    notifications: [
      {
        name: "operationsEmailEnabled",
        label: "Operations Email Enabled",
        type: "switch",
      },
      {
        name: "maintenanceNotificationsEnabled",
        label: "Maintenance Notifications",
        type: "switch",
      },
      {
        name: "waitlistNotificationsEnabled",
        label: "Waitlist Notifications",
        type: "switch",
      },
      {
        name: "onboardingSetupNotificationsEnabled",
        label: "Onboarding Setup Notifications",
        type: "switch",
      },
      {
        name: "digestFrequency",
        label: "Digest Frequency",
        type: "select",
        options: [...SETTINGS_OPTIONS.digestFrequency],
      },
      {
        name: "alertRouting",
        label: "Alert Routing",
        type: "select",
        options: [...SETTINGS_OPTIONS.alertRouting],
      },
    ],
    security: [
      { name: "enforceAdminMfa", label: "Enforce Admin MFA", type: "switch" },
      {
        name: "adminSessionTimeoutMinutes",
        label: "Admin Session Timeout (Minutes)",
        type: "number",
        min: 1,
      },
      {
        name: "auditRetentionDays",
        label: "Audit Retention (Days)",
        type: "number",
        min: 1,
      },
      {
        name: "allowPasswordResetLinks",
        label: "Allow Password Reset Links",
        type: "switch",
      },
      {
        name: "allowAccountSetupLinks",
        label: "Allow Account Setup Links",
        type: "switch",
      },
      {
        name: "inviteDomainAllowlist",
        label: "Invite Domain Allowlist",
        type: "textarea",
        description: "One domain per line.",
      },
    ],
    integrations: [
      {
        name: "routeOptimizerDashboardUrl",
        label: "Route Optimizer Dashboard URL",
        type: "url",
      },
      { name: "mapsProviderLabel", label: "Maps Provider Label", type: "text" },
      { name: "mediaCdnBaseUrl", label: "Media CDN Base URL", type: "url" },
      {
        name: "webhookStatusPageUrl",
        label: "Webhook Status Page URL",
        type: "url",
      },
    ],
    organization: [
      { name: "displayName", label: "Organization Display Name", type: "text" },
      { name: "legalCompanyName", label: "Legal Company Name", type: "text" },
      {
        name: "supportContactName",
        label: "Support Contact Name",
        type: "text",
      },
      {
        name: "billingContactEmail",
        label: "Billing Contact Email",
        type: "email",
      },
      { name: "vatId", label: "VAT / Tax ID", type: "text" },
      {
        name: "brandPrimaryLogoUrl",
        label: "Primary Brand Logo URL",
        type: "url",
      },
      { name: "businessAddress", label: "Business Address", type: "textarea" },
    ],
    privacy: [
      {
        name: "retentionLastRunAt",
        label: "Last Retention Run",
        type: "text",
        readOnly: true,
        description:
          "Timestamp of the last privacy retention job execution. Updated automatically by the scheduled job.",
      },
      {
        name: "waitlistRetentionDays",
        label: "Waitlist Retention (Days)",
        type: "number",
        min: 1,
      },
      {
        name: "auditRetentionVisibilityDays",
        label: "Audit Visibility Window (Days)",
        type: "number",
        min: 1,
      },
      {
        name: "exportRequestResponseHours",
        label: "Export Response Target (Hours)",
        type: "number",
        min: 1,
      },
      {
        name: "privacyContactEmail",
        label: "Privacy Contact Email",
        type: "email",
      },
      {
        name: "deletionPolicyText",
        label: "Deletion Policy",
        type: "textarea",
      },
    ],
    billing: [],
  };
