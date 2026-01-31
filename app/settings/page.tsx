"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { useSettingsData } from "@/hooks/useSettingsData";
import { updateSettings } from "@/app/actions/settings";
import { shouldUseMockData } from "@/lib/dataSource";

const toNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => Number(value), schema);

const settingsFormSchema = z.object({
  system: z.object({
    supportEmail: z.string().email().optional(),
    defaultRegion: z.string().min(2),
    timezone: z.string().min(1),
    appVersion: z.string().min(1),
    maintenanceMode: z.boolean(),
    allowSelfSignup: z.boolean(),
  }),
  points: z.object({
    basePointsPerMinute: toNumber(z.number().int().min(0)),
    dailyCap: toNumber(z.number().int().min(0)),
    weeklyCap: toNumber(z.number().int().min(0)),
    campaignMaxRewardCap: toNumber(z.number().int().min(0)),
    minVerifiedMinutes: toNumber(z.number().int().min(0)),
  }),
  campaignDefaults: z.object({
    defaultMultiplier: toNumber(z.number().min(0)),
    defaultDurationDays: toNumber(z.number().int().min(1)),
    defaultSignupDeadlineDays: toNumber(z.number().int().min(1)),
    defaultMaxRiders: toNumber(z.number().int().min(1)),
    requireApproval: z.boolean(),
  }),
  featureFlags: z.object({
    rewardsShopEnabled: z.boolean(),
    routeTemplatesEnabled: z.boolean(),
    autoAssignmentEnabled: z.boolean(),
    realtimeTrackingEnabled: z.boolean(),
    emailNotificationsEnabled: z.boolean(),
  }),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export default function SettingsPage() {
  const { toast } = useToast();
  const useMockData = shouldUseMockData();
  const { data, isLoading, refetch } = useSettingsData();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: data,
  });

  useEffect(() => {
    if (data) {
      form.reset(data);
    }
  }, [data, form]);

  const onSubmit = async (values: SettingsFormValues) => {
    if (useMockData) {
      toast({
        title: "Mock mode",
        description:
          "Settings updates are disabled while mock data is enabled.",
      });
      return;
    }

    setIsSaving(true);
    const result = await updateSettings(values);
    setIsSaving(false);

    if (!result.success) {
      toast({
        title: "Save failed",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Settings updated",
      description: "Settings have been saved successfully.",
    });
    await refetch();
  };

  const isDisabled = isLoading || isSaving;

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Settings"
          description="Configure system-wide defaults, points logic, and feature flags for Movrr."
        />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle>System Configuration</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="system.supportEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Support email</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="support@movrr.nl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="system.defaultRegion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default region</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="NL" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="system.timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timezone</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Europe/Amsterdam" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="system.appVersion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App version</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="v1.0.0" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="system.maintenanceMode"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <div>
                            <FormLabel className="text-sm">
                              Maintenance mode (Admin dashboard)
                            </FormLabel>
                            <p className="text-xs text-muted-foreground">
                              Shows a banner to admins only. Riders are not
                              affected.
                            </p>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="system.allowSelfSignup"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <div>
                            <FormLabel className="text-sm">
                              Allow self signup
                            </FormLabel>
                            <p className="text-xs text-muted-foreground">
                              Enable rider self-registration.
                            </p>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle>Points Configuration</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="points.basePointsPerMinute"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base points / min</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="points.minVerifiedMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min verified minutes</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="points.campaignMaxRewardCap"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign max cap</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="points.dailyCap"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Daily cap</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="points.weeklyCap"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weekly cap</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle>Campaign Defaults</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="campaignDefaults.defaultMultiplier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default multiplier</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step="0.1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="campaignDefaults.defaultDurationDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default duration (days)</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="campaignDefaults.defaultSignupDeadlineDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signup deadline (days)</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="campaignDefaults.defaultMaxRiders"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default max riders</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="campaignDefaults.requireApproval"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      <div>
                        <FormLabel className="text-sm">
                          Require approval
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Require manual approval for campaign creation.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle>Feature Flags</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {(
                    [
                      { key: "rewardsShopEnabled", label: "Rewards shop" },
                      {
                        key: "routeTemplatesEnabled",
                        label: "Route templates",
                      },
                      {
                        key: "autoAssignmentEnabled",
                        label: "Auto assignment",
                      },
                      {
                        key: "realtimeTrackingEnabled",
                        label: "Realtime tracking",
                      },
                      {
                        key: "emailNotificationsEnabled",
                        label: "Email notifications",
                      },
                    ] as const
                  ).map((flag) => (
                    <FormField
                      key={flag.key}
                      control={form.control}
                      name={`featureFlags.${flag.key}`}
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <FormLabel className="text-sm">
                            {flag.label}
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={isDisabled}>
                {isSaving ? "Saving..." : "Save settings"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
