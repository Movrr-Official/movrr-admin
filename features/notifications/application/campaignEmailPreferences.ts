export function shouldSendCampaignLifecycleEmail(preferences: {
  emailNotifications: boolean | null | undefined;
  campaignUpdates: boolean | null | undefined;
}): boolean {
  // Null represents legacy rows created before these preferences existed.
  return preferences.emailNotifications !== false && preferences.campaignUpdates !== false;
}
