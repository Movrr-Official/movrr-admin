import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CreditCard,
  Database,
  Globe,
  Mail,
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
    id: "campaigns",
    title: "Campaigns",
    icon: Globe,
    description: "Default campaign planning and approval rules.",
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
    description: "Retention windows, export response targets, and privacy contact.",
  },
  {
    id: "billing",
    title: "Billing",
    icon: CreditCard,
    description: "Read-only billing readiness until provider integration is connected.",
  },
];

export const SETTINGS_OPTIONS = {
  riderOnboardingMode: ["open", "waitlist_only", "closed"],
  digestFrequency: ["off", "daily", "weekly"],
  alertRouting: ["support_only", "support_and_admin", "admin_only"],
} as const;

export const SETTINGS_FIELDS: Record<SettingsSectionId, SettingsFieldConfig[]> = {
  general: [
    { name: "supportEmail", label: "Support Email", type: "email" },
    { name: "publicSupportEmail", label: "Public Support Email", type: "email" },
    {
      name: "publicSupportContactName",
      label: "Public Support Contact Name",
      type: "text",
    },
    { name: "defaultRegion", label: "Default Region", type: "text" },
    { name: "timezone", label: "Timezone", type: "text" },
    { name: "defaultLanguage", label: "Default Language", type: "text" },
    { name: "defaultCurrency", label: "Default Currency", type: "text" },
    { name: "appVersion", label: "App Version", type: "text", readOnly: true },
    {
      name: "maintenanceMode",
      label: "Maintenance Mode",
      type: "switch",
      description: "Blocks normal platform use for maintenance windows.",
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
    { name: "autoApproveWaitlist", label: "Auto-Approve Waitlist", type: "switch" },
    { name: "setupEmailEnabled", label: "Setup Email Enabled", type: "switch" },
    { name: "defaultRiderLanguage", label: "Default Rider Language", type: "text" },
    { name: "defaultRiderTimezone", label: "Default Rider Timezone", type: "text" },
  ],
  rewards: [
    { name: "basePointsPerMinute", label: "Base Points / Minute", type: "number", min: 0 },
    { name: "dailyCap", label: "Daily Cap", type: "number", min: 0 },
    { name: "weeklyCap", label: "Weekly Cap", type: "number", min: 0 },
    { name: "campaignMaxRewardCap", label: "Campaign Reward Cap", type: "number", min: 0 },
    { name: "minVerifiedMinutes", label: "Minimum Verified Minutes", type: "number", min: 0 },
  ],
  campaigns: [
    { name: "defaultMultiplier", label: "Default Multiplier", type: "number", min: 0 },
    { name: "defaultDurationDays", label: "Default Duration (Days)", type: "number", min: 1 },
    {
      name: "defaultSignupDeadlineDays",
      label: "Default Signup Deadline (Days)",
      type: "number",
      min: 1,
    },
    { name: "defaultMaxRiders", label: "Default Max Riders", type: "number", min: 1 },
    { name: "requireApproval", label: "Require Approval", type: "switch" },
  ],
  features: [
    { name: "rewardsShopEnabled", label: "Rewards Shop Enabled", type: "switch" },
    { name: "routeTemplatesEnabled", label: "Route Templates Enabled", type: "switch" },
    { name: "autoAssignmentEnabled", label: "Auto Assignment Enabled", type: "switch" },
    { name: "realtimeTrackingEnabled", label: "Realtime Tracking Enabled", type: "switch" },
    { name: "emailNotificationsEnabled", label: "Email Notifications Enabled", type: "switch" },
  ],
  notifications: [
    { name: "operationsEmailEnabled", label: "Operations Email Enabled", type: "switch" },
    {
      name: "maintenanceNotificationsEnabled",
      label: "Maintenance Notifications",
      type: "switch",
    },
    { name: "waitlistNotificationsEnabled", label: "Waitlist Notifications", type: "switch" },
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
    { name: "webhookStatusPageUrl", label: "Webhook Status Page URL", type: "url" },
  ],
  organization: [
    { name: "displayName", label: "Organization Display Name", type: "text" },
    { name: "legalCompanyName", label: "Legal Company Name", type: "text" },
    { name: "supportContactName", label: "Support Contact Name", type: "text" },
    { name: "billingContactEmail", label: "Billing Contact Email", type: "email" },
    { name: "vatId", label: "VAT / Tax ID", type: "text" },
    { name: "brandPrimaryLogoUrl", label: "Primary Brand Logo URL", type: "url" },
    { name: "businessAddress", label: "Business Address", type: "textarea" },
  ],
  privacy: [
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
    { name: "privacyContactEmail", label: "Privacy Contact Email", type: "email" },
    { name: "deletionPolicyText", label: "Deletion Policy", type: "textarea" },
  ],
  billing: [],
};
