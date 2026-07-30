import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { CampaignLifecycleStatus } from "@/features/platform/vocabulary";

export type CampaignWriteInput = {
  name: string;
  description?: string;
  budget: number;
  startDate: string;
  endDate: string;
  routeIds?: string[];
  campaignType?: "destination_ride" | "swarm";
  targetZones?: string[];
  vehicleTypeRequired?: "bike" | "e-bike" | "cargo-bike";
  deliveryMode?: "manual" | "automated";
  impressionGoal?: number;
};

export type CampaignUpdateInput = Partial<CampaignWriteInput> & {
  id: string;
  status?: CampaignLifecycleStatus;
};

function mapUiCampaignTypeToDb(value?: string | null) {
  if (!value) return "destination_ride";
  const normalized = value.toLowerCase();
  if (normalized === "destination_ride" || normalized === "swarm") return normalized;
  return "destination_ride";
}

function requireAdvertiserOrg(ctx: RequestContext): ApplicationResult<{
  organisationId: string;
  advertiserId?: string;
}> {
  if (ctx.principal.type === "admin") {
    return ok({ organisationId: "" });
  }
  if (
    ctx.principal.type !== "organisation" ||
    ctx.principal.organisationType !== "advertiser"
  ) {
    return fail("permission_denied", "Advertiser organisation required");
  }
  return ok({ organisationId: ctx.principal.organisationId });
}

async function resolveAdvertiserId(
  organisationId: string,
): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("advertiser")
    .select("id")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function listCampaignsForPrincipal(
  ctx: RequestContext,
  filters?: { advertiserId?: string },
): Promise<ApplicationResult<unknown[]>> {
  const supabase = createSupabaseAdminClient();
  let advertiserId = filters?.advertiserId;

  if (ctx.principal.type === "organisation" && ctx.principal.organisationType === "advertiser") {
    advertiserId = (await resolveAdvertiserId(ctx.principal.organisationId)) ?? undefined;
    if (!advertiserId) return ok([]);
  }

  let query = supabase
    .from("campaign")
    .select("*")
    .order("created_at", { ascending: false });

  if (advertiserId) {
    query = query.eq("advertiser_id", advertiserId);
  }

  const { data, error } = await query.limit(200);
  if (error) return fail("BusinessFailure", error.message);
  return ok(data ?? []);
}

export async function getCampaignById(
  ctx: RequestContext,
  campaignId: string,
): Promise<ApplicationResult<unknown>> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaign")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) return fail("BusinessFailure", error.message);
  if (!data) return fail("not_found", "Campaign not found");

  if (ctx.principal.type === "organisation" && ctx.principal.organisationType === "advertiser") {
    const advertiserId = await resolveAdvertiserId(ctx.principal.organisationId);
    if (advertiserId && data.advertiser_id !== advertiserId) {
      return fail("permission_denied", "Campaign not in your organisation");
    }
  }

  return ok(data);
}

export async function createCampaignForPrincipal(
  ctx: RequestContext,
  input: CampaignWriteInput & { advertiserId?: string },
): Promise<ApplicationResult<unknown>> {
  const orgCheck = requireAdvertiserOrg(ctx);
  if (!orgCheck.ok) {
    if (ctx.principal.type !== "admin") return orgCheck;
  }

  const supabase = createSupabaseAdminClient();
  let advertiserId = input.advertiserId;

  if (ctx.principal.type === "organisation" && ctx.principal.organisationType === "advertiser") {
    advertiserId = (await resolveAdvertiserId(ctx.principal.organisationId)) ?? undefined;
    if (!advertiserId) {
      return fail("BusinessFailure", "No advertiser profile linked to organisation");
    }
  }

  if (!advertiserId) {
    return fail("validation", "advertiserId is required");
  }

  const campaignData: Record<string, unknown> = {
    advertiser_id: advertiserId,
    name: input.name,
    description: input.description || "",
    budget: input.budget,
    start_date: input.startDate,
    end_date: input.endDate,
    visibility_target:
      input.impressionGoal !== undefined ? String(input.impressionGoal) : null,
    impressions: 0,
    qr_scans: 0,
    conversions: 0,
    campaign_type: mapUiCampaignTypeToDb(input.campaignType),
    target_zones: input.targetZones || [],
    vehicle_type_required: input.vehicleTypeRequired || "bike",
    requirements: input.deliveryMode ? { deliveryMode: input.deliveryMode } : undefined,
    creative_assets: [],
    lifecycle_status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: campaign, error } = await supabase
    .from("campaign")
    .insert(campaignData)
    .select()
    .single();

  if (error) return fail("BusinessFailure", error.message);

  if (input.routeIds && input.routeIds.length > 0) {
    await supabase
      .from("route")
      .update({ campaign_id: campaign.id })
      .in("id", input.routeIds);
  }

  return ok(campaign);
}

export async function updateCampaignForPrincipal(
  ctx: RequestContext,
  input: CampaignUpdateInput,
): Promise<ApplicationResult<unknown>> {
  const existing = await getCampaignById(ctx, input.id);
  if (!existing.ok) return existing;

  const supabase = createSupabaseAdminClient();
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.budget !== undefined) updateData.budget = input.budget;
  if (input.startDate !== undefined) updateData.start_date = input.startDate;
  if (input.endDate !== undefined) updateData.end_date = input.endDate;
  if (input.impressionGoal !== undefined) {
    updateData.visibility_target = String(input.impressionGoal);
  }
  if (input.campaignType !== undefined) {
    updateData.campaign_type = mapUiCampaignTypeToDb(input.campaignType);
  }
  if (input.targetZones !== undefined) updateData.target_zones = input.targetZones;
  if (input.vehicleTypeRequired !== undefined) {
    updateData.vehicle_type_required = input.vehicleTypeRequired;
  }
  if (input.status !== undefined) updateData.lifecycle_status = input.status;

  const { data, error } = await supabase
    .from("campaign")
    .update(updateData)
    .eq("id", input.id)
    .select()
    .single();

  if (error) return fail("BusinessFailure", error.message);
  return ok(data);
}

export async function updateCampaignStatusForPrincipal(
  ctx: RequestContext,
  campaignId: string,
  status: CampaignLifecycleStatus,
): Promise<ApplicationResult<unknown>> {
  return updateCampaignForPrincipal(ctx, { id: campaignId, status });
}
