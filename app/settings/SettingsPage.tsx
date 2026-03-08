"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { AlertCircle, Mail } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/PageHeader";
import { BillingSection } from "@/components/settings/BillingSection";
import { SETTINGS_FIELDS, SETTINGS_SECTIONS } from "@/components/settings/config";
import { IntegrationStatusCards } from "@/components/settings/IntegrationStatusCards";
import { SettingsAuditPanel } from "@/components/settings/SettingsAuditPanel";
import { SettingsSectionForm } from "@/components/settings/SettingsSectionForm";
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
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  getSettingsAudit,
  recheckIntegrationStatus,
  updateSettingsSection,
} from "@/app/actions/settings";
import { ADMIN_SETTINGS_QUERY_KEY, useSettingsData } from "@/hooks/useSettingsData";
import {
  type SettingsAuditEntry,
  type SettingsSectionId,
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
} from "@/schemas/settings";

const SECTION_SCHEMAS = {
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
  billing: z.object({}),
} as const;

const DEFAULT_SECTION: SettingsSectionId = "general";

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading, error } = useSettingsData();
  const [isSaving, setIsSaving] = useState(false);
  const [isRecheckingIntegrations, setIsRecheckingIntegrations] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    values: Record<string, unknown>;
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

  useEffect(() => {
    form.reset(values);
  }, [form, values, section]);

  const { data: auditEntries = [] } = useQuery<SettingsAuditEntry[]>({
    queryKey: ["settingsAudit", section],
    enabled: Boolean(settings),
    queryFn: async () => {
      const result = await getSettingsAudit(section);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to load settings audit history");
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

    if (form.formState.isDirty) {
      toast({
        title: "Unsaved changes",
        description: "Save or discard the current section before switching.",
      });
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("section", nextSection);
    router.replace(`/settings?${nextParams.toString()}`);
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
          riskyChanges: result.riskyChanges,
        });
        return;
      }

      if (!result.success) {
        throw new Error(result.error || "Failed to save settings section");
      }

      setPendingConfirmation(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_SETTINGS_QUERY_KEY }),
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

  const handleIntegrationRecheck = async () => {
    setIsRecheckingIntegrations(true);
    try {
      const result = await recheckIntegrationStatus();
      if (!result.success) {
        throw new Error(result.error || "Failed to refresh integration checks");
      }
      await queryClient.invalidateQueries({ queryKey: ADMIN_SETTINGS_QUERY_KEY });
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
            {error instanceof Error ? error.message : "Failed to load settings."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Global platform configuration, policy enforcement, and operational diagnostics for MOVRR Admin."
      />

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
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/60 bg-background/30 hover:bg-background/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      <div>
                        <div className="font-medium text-foreground">{entry.title}</div>
                        <div className="text-xs text-muted-foreground">
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
            <IntegrationStatusCards
              integrations={settings.runtime.integrationStatus}
              isRefreshing={isRecheckingIntegrations}
              onRefresh={handleIntegrationRecheck}
            />
          ) : null}

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
                  isSectionReadOnly={Boolean(metadata?.readOnly)}
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm high-impact changes</AlertDialogTitle>
            <AlertDialogDescription>
              The following settings affect live platform behavior: {pendingConfirmation?.riskyChanges.join(", ")}.
              Confirm to persist these changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
  );
}
