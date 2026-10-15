import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";

function requireRider(
  ctx: RequestContext,
): ApplicationResult<{ riderId: string }> {
  if (ctx.principal.type !== "rider") {
    return fail("permission_denied", "Rider principal required");
  }
  return ok({ riderId: ctx.principal.riderId });
}

export async function optInToCampaign(
  ctx: RequestContext,
  campaignId: string,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown>> {
  const rider = requireRider(ctx);
  if (!rider.ok) return rider;

  const { data, error } = await supabase.rpc("rider_campaign_opt_in", {
    p_campaign_id: campaignId,
  });

  if (error) return fail("BusinessFailure", error.message);
  return ok(data);
}

export async function withdrawCampaignSignup(
  ctx: RequestContext,
  campaignId: string,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown>> {
  const rider = requireRider(ctx);
  if (!rider.ok) return rider;

  const { data, error } = await supabase.rpc("rider_campaign_withdraw", {
    p_campaign_id: campaignId,
  });

  if (error) return fail("BusinessFailure", error.message);
  return ok(data);
}

export async function confirmCampaignParticipation(
  ctx: RequestContext,
  campaignId: string,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown>> {
  const rider = requireRider(ctx);
  if (!rider.ok) return rider;

  const { data, error } = await supabase.rpc("rider_campaign_confirm", {
    p_campaign_id: campaignId,
  });

  if (error) return fail("BusinessFailure", error.message);
  return ok(data);
}

export async function listRiderCampaigns(
  ctx: RequestContext,
): Promise<ApplicationResult<unknown[]>> {
  const rider = requireRider(ctx);
  if (!rider.ok) return rider;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaign")
    .select("*, campaign_signup!inner(status, rider_id)")
    .eq("campaign_signup.rider_id", rider.value.riderId)
    .limit(100);

  if (error) return fail("BusinessFailure", error.message);

  return ok(data ?? []);
}
