import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { CampaignLifecycleStatus } from "@/features/platform/vocabulary";
import {
  getCampaignRecordById,
  insertCampaignRecord,
  listCampaignRecords,
  updateCampaignRecord,
} from "@/features/campaigns/application/campaignRepository";

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
  let advertiserId = filters?.advertiserId;

  if (ctx.principal.type === "organisation" && ctx.principal.organisationType === "advertiser") {
    advertiserId = (await resolveAdvertiserId(ctx.principal.organisationId)) ?? undefined;
    if (!advertiserId) return ok([]);
  }

  try {
    const data = await listCampaignRecords(
      advertiserId ? { advertiserId } : undefined,
    );
    return ok(data);
  } catch (error) {
    return fail(
      "BusinessFailure",
      error instanceof Error ? error.message : "Failed to list campaigns",
    );
  }
}

export async function getCampaignById(
  ctx: RequestContext,
  campaignId: string,
): Promise<ApplicationResult<unknown>> {
  try {
    const data = await getCampaignRecordById(campaignId);
    if (!data) return fail("not_found", "Campaign not found");

    if (ctx.principal.type === "organisation" && ctx.principal.organisationType === "advertiser") {
      const advertiserId = await resolveAdvertiserId(ctx.principal.organisationId);
      if (advertiserId && data.advertiser_id !== advertiserId) {
        return fail("permission_denied", "Campaign not in your organisation");
      }
    }

    return ok(data);
  } catch (error) {
    return fail(
      "BusinessFailure",
      error instanceof Error ? error.message : "Failed to load campaign",
    );
  }
}

export async function createCampaignForPrincipal(
  ctx: RequestContext,
  input: CampaignWriteInput & { advertiserId?: string },
): Promise<ApplicationResult<unknown>> {
  const orgCheck = requireAdvertiserOrg(ctx);
  if (!orgCheck.ok) {
    if (ctx.principal.type !== "admin") return orgCheck;
  }

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

  const { data, error } = await insertCampaignRecord({
    advertiserId,
    name: input.name,
    description: input.description,
    budget: input.budget,
    startDate: input.startDate,
    endDate: input.endDate,
    routeIds: input.routeIds,
    campaignType: input.campaignType,
    targetZones: input.targetZones,
    vehicleTypeRequired: input.vehicleTypeRequired,
    deliveryMode: input.deliveryMode,
    impressionGoal: input.impressionGoal,
    status: "draft",
  });

  if (error) return fail("BusinessFailure", error);
  return ok(data);
}

export async function updateCampaignForPrincipal(
  ctx: RequestContext,
  input: CampaignUpdateInput,
): Promise<ApplicationResult<unknown>> {
  const existing = await getCampaignById(ctx, input.id);
  if (!existing.ok) return existing;

  const { data, error } = await updateCampaignRecord({
    id: input.id,
    name: input.name,
    description: input.description,
    budget: input.budget,
    startDate: input.startDate,
    endDate: input.endDate,
    campaignType: input.campaignType,
    targetZones: input.targetZones,
    vehicleTypeRequired: input.vehicleTypeRequired,
    deliveryMode: input.deliveryMode,
    impressionGoal: input.impressionGoal,
    status: input.status,
  });

  if (error) return fail("BusinessFailure", error);
  return ok(data);
}

export async function updateCampaignStatusForPrincipal(
  ctx: RequestContext,
  campaignId: string,
  status: CampaignLifecycleStatus,
): Promise<ApplicationResult<unknown>> {
  return updateCampaignForPrincipal(ctx, { id: campaignId, status });
}
