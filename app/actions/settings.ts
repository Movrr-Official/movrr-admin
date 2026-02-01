"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";
import { settings, adminSettingsSchema } from "@/schemas/settings";

const SETTINGS_KEYS = [
  "system",
  "points",
  "campaignDefaults",
  "featureFlags",
] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];

const defaultSettings: settings = {
  system: {
    supportEmail: "support@movrr.nl",
    defaultRegion: "NL",
    timezone: "Europe/Amsterdam",
    appVersion: "1.0.0",
    maintenanceMode: false,
    allowSelfSignup: true,
  },
  points: {
    basePointsPerMinute: 1,
    dailyCap: 120,
    weeklyCap: 600,
    campaignMaxRewardCap: 1000,
    minVerifiedMinutes: 1,
  },
  campaignDefaults: {
    defaultMultiplier: 1,
    defaultDurationDays: 30,
    defaultSignupDeadlineDays: 7,
    defaultMaxRiders: 50,
    requireApproval: false,
  },
  featureFlags: {
    rewardsShopEnabled: true,
    routeTemplatesEnabled: true,
    autoAssignmentEnabled: false,
    realtimeTrackingEnabled: true,
    emailNotificationsEnabled: true,
  },
};

const mergeSettings = (rows: Array<{ key: SettingsKey; value: any }>) => {
  const merged = { ...defaultSettings } as settings;
  rows.forEach((row) => {
    if (!row?.key) return;
    merged[row.key] = {
      ...(defaultSettings[row.key] as any),
      ...(row.value ?? {}),
    } as any;
  });
  return merged;
};

export async function getAdminSettings(): Promise<{
  success: boolean;
  data?: settings;
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .select("key, value")
      .in("key", SETTINGS_KEYS);

    if (error) {
      logger.error("Failed to load admin settings", error);
      return { success: false, error: error.message };
    }

    const merged = mergeSettings((data ?? []) as any);
    return { success: true, data: merged };
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

export async function updateSettings(
  payload: settings,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validated = adminSettingsSchema.parse(payload);

    const now = new Date().toISOString();
    const rows = SETTINGS_KEYS.map((key) => ({
      key,
      value: validated[key],
      updated_at: now,
      created_at: now,
    }));

    const { error } = await supabaseAdmin
      .from("admin_settings")
      .upsert(rows, { onConflict: "key" });

    if (error) {
      logger.error("Failed to update admin settings", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    logger.error("Failed to update admin settings", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update admin settings",
    };
  }
}
