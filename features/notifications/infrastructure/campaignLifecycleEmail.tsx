import "server-only";

import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CUSTOMER_APP_URL, RESEND_API_KEY, SYSTEM_EMAIL } from "@/lib/env";
import CampaignLifecycleEmail, {
  campaignLifecycleSubject,
  campaignLifecycleText,
} from "@/emails/campaign-lifecycle";
import type { CampaignLifecycleStatus } from "@/features/platform/vocabulary";
import { shouldSendCampaignLifecycleEmail } from "@/features/notifications/application/campaignEmailPreferences";

export async function sendCampaignLifecycleEmail(input: {
  campaignId: string;
  advertiserId: string;
  campaignName: string;
  status: CampaignLifecycleStatus;
  version: string;
}): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: advertiser, error: advertiserError } = await supabase
      .from("advertiser")
      .select("user_id, email_notifications, campaign_updates")
      .eq("id", input.advertiserId)
      .maybeSingle();
    if (advertiserError) throw new Error(advertiserError.message);
    if (!advertiser?.user_id || !shouldSendCampaignLifecycleEmail({
      emailNotifications: advertiser.email_notifications,
      campaignUpdates: advertiser.campaign_updates,
    })) {
      return;
    }

    const { data: user, error: userError } = await supabase
      .from("user")
      .select("email, name")
      .eq("id", advertiser.user_id)
      .maybeSingle();
    if (userError) throw new Error(userError.message);
    if (!user?.email) return;

    const props = {
      name: user.name ? String(user.name) : undefined,
      campaignName: input.campaignName,
      status: input.status,
      actionUrl: `${CUSTOMER_APP_URL.replace(/\/$/, "")}/dashboard/campaigns/${encodeURIComponent(input.campaignId)}`,
    };
    const resend = new Resend(RESEND_API_KEY);
    const { error } = await resend.emails.send(
      {
        from: `MOVRR <${SYSTEM_EMAIL}>`,
        to: [String(user.email)],
        subject: campaignLifecycleSubject(props),
        react: <CampaignLifecycleEmail {...props} />,
        text: campaignLifecycleText(props),
        tags: [
          { name: "category", value: "campaign-lifecycle" },
          { name: "status", value: input.status.replaceAll("_", "-") },
        ],
      },
      {
        idempotencyKey: `campaign:${input.campaignId}:${input.status}:${input.version}`.slice(0, 256),
      },
    );
    if (error) throw new Error(error.message);
  } catch (error) {
    // The campaign write is already durable. Notification outages are reported
    // without misrepresenting the authoritative command as failed.
    console.error("Campaign lifecycle email failed", {
      campaignId: input.campaignId,
      status: input.status,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
