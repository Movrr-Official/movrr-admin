import { describe, expect, it } from "vitest";
import { shouldSendCampaignLifecycleEmail } from "@/features/notifications/application/campaignEmailPreferences";

describe("campaign lifecycle email preferences", () => {
  it("sends when both advertiser preferences are enabled", () => {
    expect(shouldSendCampaignLifecycleEmail({
      emailNotifications: true,
      campaignUpdates: true,
    })).toBe(true);
  });

  it("honours either opt-out", () => {
    expect(shouldSendCampaignLifecycleEmail({
      emailNotifications: false,
      campaignUpdates: true,
    })).toBe(false);
    expect(shouldSendCampaignLifecycleEmail({
      emailNotifications: true,
      campaignUpdates: false,
    })).toBe(false);
  });

  it("keeps legacy null preferences backward compatible", () => {
    expect(shouldSendCampaignLifecycleEmail({
      emailNotifications: null,
      campaignUpdates: null,
    })).toBe(true);
  });
});
