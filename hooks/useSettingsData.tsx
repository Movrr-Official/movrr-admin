"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminSettings } from "@/app/actions/settings";
import { settings } from "@/schemas/settings";
import { shouldUseMockData } from "@/lib/dataSource";

const fallbackSettings: settings = {
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

export const useSettingsData = (options?: { refetchInterval?: number }) => {
  return useQuery<settings>({
    queryKey: ["adminSettings"],
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
  });
};
