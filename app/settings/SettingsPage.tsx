"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { AlertCircle, Eye, Mail, DatabaseZap } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/PageHeader";
import { BillingSection } from "@/components/settings/BillingSection";
import {
  SETTINGS_FIELDS,
  SETTINGS_SECTIONS,
} from "@/components/settings/config";
import { IntegrationStatusCards } from "@/components/settings/IntegrationStatusCards";
import { SettingsAuditPanel } from "@/components/settings/SettingsAuditPanel";
import { ContractHealthPanel } from "@/components/contracts/ContractHealthPanel";
import { SettingsSectionForm } from "@/components/settings/SettingsSectionForm";
import { useAdminUser } from "@/hooks/useAdminUser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  getSettingsAudit,
  recheckIntegrationStatus,
  syncPlatformSettings,
  updateSettingsSection,
} from "@/app/actions/settings";
import {
  PLATFORM_SETTINGS_QUERY_KEY,
  useSettingsData,
} from "@/hooks/useSettingsData";
import {
  type SettingsAuditEntry,
  type SettingsSectionId,
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
} from "@/schemas/settings";

const SECTION_SCHEMAS = {
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
  billing: z.object({}),
} as const;

const DEFAULT_SECTION: SettingsSectionId = "general";

const normalizeSectionState = (
  fields: { name: string; type?: string }[],
  input: Record<string, unknown> | undefined,
) => {
  const source = input ?? {};
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    const value = source[field.name];
    if (Array.isArray(value)) {
      acc[field.name] = value.map((item) =>
        typeof item === "string" ? item.trim() : item,
      );
      return acc;
    }
    if (field.type === "number") {
      if (value === "" || value === null || value === undefined) {
        acc[field.name] = null;
        return acc;
      }
      const parsedValue =
        typeof value === "number" ? value : Number(String(value).trim());
      acc[field.name] = Number.isFinite(parsedValue) ? parsedValue : null;
      return acc;
    }
    if (field.type === "switch") {
      acc[field.name] =
        typeof value === "string" ? value === "true" : Boolean(value);
      return acc;
    }
    if (typeof value === "string") {
      const trimmedValue = value.trim();
      acc[field.name] = trimmedValue === "" ? null : trimmedValue;
      return acc;
    }
    acc[field.name] = value ?? null;
    return acc;
  }, {});
};

const serializeSectionState = (value: Record<string, unknown>) =>
  JSON.stringify(value);

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading, error } = useSettingsData();
  const { data: adminUser } = useAdminUser();
  const isReadOnlyRole =
    adminUser?.role === "compliance_officer" ||
    adminUser?.role === "government";
  const [isSaving, setIsSaving] = useState(false);
  const [isRecheckingIntegrations, setIsRecheckingIntegrations] =
    useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    values: Record<string, unknown>;
    currentValues: Record<string, unknown>;
    riskyChanges: string[];
  } | null>(null);

  const sectionParam = searchParams.get("section");
  const section = (
    SETTINGS_SECTIONS.some((candidate) => candidate.id === sectionParam)
      ? sectionParam
      : DEFAULT_SECTION
  ) as SettingsSectionId;

  const sectionConfig =
    SETTINGS_SECTIONS.find((candidate) => candidate.id === section) ??
    SETTINGS_SECTIONS[0];
  const schema = SECTION_SCHEMAS[section];
  const values = settings?.values[section] ?? {};
  const metadata = settings?.metadata[section];
  const fields = SETTINGS_FIELDS[section];

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    values,
  });

  const watchedValues = useWatch({ control: form.control });
  // Access defaultValues here so RHF subscribes this component to changes after reset.
  const formDefaultValues = form.formState.defaultValues;

  useEffect(() => {
    form.reset(values);
  }, [form, values, section]);

  // Both sides are RHF-internal: they update in the same render, eliminating the race with `values`.
  const hasUnsavedChanges = useMemo(() => {
    const baseline = serializeSectionState(
      normalizeSectionState(
        fields,
        (formDefaultValues ?? {}) as Record<string, unknown>,
      ),
    );
    const current = serializeSectionState(
      normalizeSectionState(fields, watchedValues as Record<string, unknown>),
    );
    return baseline !== current;
  }, [fields, formDefaultValues, watchedValues]);

  const { data: auditEntries = [] } = useQuery<SettingsAuditEntry[]>({
    queryKey: ["settingsAudit", section],
    enabled: Boolean(settings),
    queryFn: async () => {
      const result = await getSettingsAudit(section);
      if (!result.success || !result.data) {
        throw new Error(
          result.error || "Failed to load settings audit history",
        );
      }
      return result.data;
    },
  });

  const validationSummary = useMemo(
    () =>
      Object.entries(form.formState.errors).map(([key, value]) => ({
        key,
        message: value?.message ? String(value.message) : "Invalid value",
      })),
    [form.formState.errors],
  );

  const setSection = (nextSection: SettingsSectionId) => {
    if (nextSection === section) return;

    if (hasUnsavedChanges) {
      toast({
        title: "Unsaved changes",
        description: "Save or discard the current section before switching.",
      });
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("section", nextSection);
    router.replace(`/settings?${nextParams.toString()}`, { scroll: false });
  };

  const saveSection = async (
    nextValues: Record<string, unknown>,
    confirmedRiskyChanges = false,
  ) => {
    setIsSaving(true);
    try {
      const result = await updateSettingsSection({
        section,
        data: nextValues,
        confirmedRiskyChanges,
      });

      if (result.requiresConfirmation && result.riskyChanges?.length) {
        setPendingConfirmation({
          values: nextValues,
          currentValues: values,
          riskyChanges: result.riskyChanges,
        });
        return;
      }

      if (!result.success) {
        throw new Error(result.error || "Failed to save settings section");
      }

      setPendingConfirmation(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: PLATFORM_SETTINGS_QUERY_KEY,
        }),
        queryClient.invalidateQueries({ queryKey: ["settingsAudit", section] }),
      ]);
      toast({
        title: "Section saved",
        description: `${sectionConfig.title} settings were updated successfully.`,
      });
    } catch (saveError) {
      toast({
        title: "Unable to save section",
        description:
          saveError instanceof Error
            ? saveError.message
            : "Failed to save settings section.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncPlatformSettings();
      if (!result.success) throw new Error(result.error || "Sync failed");
      await queryClient.invalidateQueries({
        queryKey: PLATFORM_SETTINGS_QUERY_KEY,
      });
      toast({
        title: "Database synced",
        description: result.seeded.length
          ? `Seeded ${result.seeded.length} missing section${result.seeded.length > 1 ? "s" : ""}: ${result.seeded.join(", ")}.`
          : "All sections were already present.",
      });
    } catch (err) {
      toast({
        title: "Sync failed",
        description:
          err instanceof Error ? err.message : "Failed to sync settings.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleIntegrationRecheck = async () => {
    setIsRecheckingIntegrations(true);
    try {
      const result = await recheckIntegrationStatus();
      if (!result.success) {
        throw new Error(result.error || "Failed to refresh integration checks");
      }
      await queryClient.invalidateQueries({
        queryKey: PLATFORM_SETTINGS_QUERY_KEY,
      });
      toast({
        title: "Integrations refreshed",
        description: "Integration health has been rechecked.",
      });
    } catch (refreshError) {
      toast({
        title: "Unable to refresh integrations",
        description:
          refreshError instanceof Error
            ? refreshError.message
            : "Failed to refresh integration status.",
        variant: "destructive",
      });
    } finally {
      setIsRecheckingIntegrations(false);
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Global platform configuration for MOVRR Admin."
        />
        <Card className="glass-card border-0">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading settings...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Global platform configuration for MOVRR Admin."
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load settings</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Failed to load settings."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          title="Settings"
          description="Global platform configuration, policy enforcement, and operational diagnostics for MOVRR Admin."
        />

        {settings.missingSections.length > 0 && (
          <Alert>
            <DatabaseZap className="h-4 w-4" />
            <AlertTitle>
              {settings.missingSections.length} section
              {settings.missingSections.length > 1 ? "s" : ""} not yet persisted
              to database
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                The following sections are showing hardcoded defaults:{" "}
                <span className="font-medium">
                  {settings.missingSections.join(", ")}
                </span>
                . Sync to write their current values to the database.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={isSyncing}
                onClick={handleSync}
              >
                {isSyncing ? "Syncing…" : "Seed missing sections"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="glass-card border-0">
            <CardContent className="p-4">
              <div className="space-y-2">
                {SETTINGS_SECTIONS.map((entry) => {
                  const Icon = entry.icon;
                  const isActive = entry.id === section;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSection(entry.id)}
                      aria-pressed={isActive}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-primary/50 bg-primary/10"
                          : "border-border/60 bg-background/30 hover:bg-background/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <div className="font-medium text-foreground">
                              {entry.title}
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground ml-6">
                            {entry.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="glass-card border-0">
              <CardContent className="p-6">
                <div className="space-y-1">
                  <div className="text-lg font-semibold text-foreground">
                    {sectionConfig.title}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {sectionConfig.description}
                  </div>
                  <div className="pt-2 text-xs text-muted-foreground">
                    {metadata?.updatedAt
                      ? `Last updated ${new Date(metadata.updatedAt).toLocaleString()}`
                      : "No saved updates yet."}
                    {metadata?.updatedBy
                      ? ` by ${metadata.updatedBy.name} (${metadata.updatedBy.role})`
                      : ""}
                  </div>
                </div>
              </CardContent>
            </Card>

            {validationSummary.length > 0 ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Section validation issues</AlertTitle>
                <AlertDescription>
                  {validationSummary
                    .map((item) => `${item.key}: ${item.message}`)
                    .join(" • ")}
                </AlertDescription>
              </Alert>
            ) : null}

            {section === "notifications" ? (
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertTitle>Env-managed Admin Recipients</AlertTitle>
                <AlertDescription>
                  {settings.runtime.adminNotificationRecipients.length > 0
                    ? settings.runtime.adminNotificationRecipients.join(", ")
                    : "No admin recipients configured."}
                </AlertDescription>
              </Alert>
            ) : null}

            {section === "integrations" ? (
              <>
                <IntegrationStatusCards
                  integrations={settings.runtime.integrationStatus}
                  isRefreshing={isRecheckingIntegrations}
                  onRefresh={handleIntegrationRecheck}
                />
                <ContractHealthPanel />
              </>
            ) : null}

            {isReadOnlyRole && (
              <Alert>
                <Eye className="h-4 w-4" />
                <AlertTitle>Read-only access</AlertTitle>
                <AlertDescription>
                  Your role ({adminUser?.role?.replace("_", " ")}) has read-only
                  access to platform settings. Contact an administrator to
                  request changes.
                </AlertDescription>
              </Alert>
            )}

            {section === "billing" ? (
              <BillingSection settings={settings} />
            ) : (
              <Card className="glass-card border-0">
                <CardContent className="space-y-6 p-6">
                  <SettingsSectionForm
                    form={form}
                    fields={fields}
                    values={values}
                    isSaving={isSaving}
                    isSectionReadOnly={
                      Boolean(metadata?.readOnly) || isReadOnlyRole
                    }
                    hasUnsavedChanges={hasUnsavedChanges}
                    onSubmit={saveSection}
                  />
                </CardContent>
              </Card>
            )}

            <SettingsAuditPanel entries={auditEntries} />
          </div>
        </div>

        <AlertDialog
          open={Boolean(pendingConfirmation)}
          onOpenChange={(open) => {
            if (!open) setPendingConfirmation(null);
          }}
        >
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm high-impact changes</AlertDialogTitle>
              <AlertDialogDescription>
                These settings affect live platform behavior. Review each change
                carefully before confirming.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {pendingConfirmation && (
              <div className="space-y-2 py-1">
                {pendingConfirmation.riskyChanges.map((fieldName) => {
                  const fieldConfig = fields.find((f) => f.name === fieldName);
                  const label = fieldConfig?.label ?? fieldName;
                  const description = fieldConfig?.description;
                  const oldVal = pendingConfirmation.currentValues[fieldName];
                  const newVal = pendingConfirmation.values[fieldName];

                  const fmt = (v: unknown): string => {
                    if (v === null || v === undefined) return "—";
                    if (typeof v === "boolean") return v ? "on" : "off";
                    if (Array.isArray(v))
                      return v.length === 0 ? "(empty)" : v.join(", ");
                    return String(v);
                  };

                  return (
                    <div
                      key={fieldName}
                      className="rounded-lg border border-border/60 bg-background/60 p-3"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {label}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive/80 line-through">
                          {fmt(oldVal)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="rounded bg-green-500/10 px-1.5 py-0.5 font-mono text-green-600 dark:text-green-400">
                          {fmt(newVal)}
                        </span>
                      </div>
                      {description && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingConfirmation) {
                    void saveSection(pendingConfirmation.values, true);
                  }
                }}
              >
                Confirm changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
