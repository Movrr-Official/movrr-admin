import "server-only";

import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CUSTOMER_APP_URL, RESEND_API_KEY, SYSTEM_EMAIL } from "@/lib/env";
import RewardLifecycleEmail, {
  rewardLifecycleSubject,
  rewardLifecycleText,
} from "@/emails/reward-lifecycle";
import type {
  RewardLifecycleEmailInput,
  TransactionalEmailPort,
} from "@/features/notifications/application/contracts/TransactionalEmailPort";

type Recipient = { email: string; name?: string; rewardName: string };

async function resolveRecipient(input: RewardLifecycleEmailInput): Promise<Recipient | null> {
  const supabase = createSupabaseAdminClient();
  const { data: rider, error: riderError } = await supabase
    .from("rider")
    .select("user_id")
    .eq("id", input.riderId)
    .maybeSingle();
  if (riderError) throw new Error(`reward email rider lookup: ${riderError.message}`);
  if (!rider?.user_id) return null;

  const [{ data: user, error: userError }, catalogResult] = await Promise.all([
    supabase
      .from("user")
      .select("email, name")
      .eq("id", rider.user_id)
      .maybeSingle(),
    input.catalogItemId
      ? supabase
          .from("reward_catalog")
          .select("title")
          .eq("id", input.catalogItemId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (userError) throw new Error(`reward email user lookup: ${userError.message}`);
  if (catalogResult.error) {
    throw new Error(`reward email catalog lookup: ${catalogResult.error.message}`);
  }
  if (!user?.email) return null;

  return {
    email: String(user.email),
    name: user.name ? String(user.name) : undefined,
    rewardName: catalogResult.data?.title
      ? String(catalogResult.data.title)
      : "MOVRR reward",
  };
}

export function createResendTransactionalEmailPort(): TransactionalEmailPort {
  const resend = new Resend(RESEND_API_KEY);

  return {
    async sendRewardLifecycle(input) {
      const recipient = await resolveRecipient(input);
      if (!recipient) return;
      const actionUrl = `${CUSTOMER_APP_URL.replace(/\/$/, "")}/dashboard/rewards/orders/${encodeURIComponent(input.fulfilmentId)}`;
      const props = {
        kind: input.kind,
        name: recipient.name,
        rewardName: recipient.rewardName,
        pointsSpent: input.pointsSpent,
        occurredAt: input.occurredAt,
        expiresAt: input.expiresAt,
        actionUrl,
      };

      const { error } = await resend.emails.send(
        {
          from: `MOVRR <${SYSTEM_EMAIL}>`,
          to: [recipient.email],
          subject: rewardLifecycleSubject(input.kind),
          react: <RewardLifecycleEmail {...props} />,
          text: rewardLifecycleText(props),
          tags: [
            { name: "category", value: "reward-lifecycle" },
            { name: "event", value: input.kind.replaceAll("_", "-") },
          ],
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (error) throw new Error(`Resend: ${error.message}`);
    },
  };
}
