import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CampaignLifecycleStatus } from "@/features/platform/vocabulary";

export type CampaignRecordInput = {
  advertiserId: string;
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
  status?: CampaignLifecycleStatus;
};

export type CampaignUpdateRecordInput = Partial<
  Omit<CampaignRecordInput, "advertiserId">
> & {
  id: string;
  advertiserId?: string;
};

function mapUiCampaignTypeToDb(value?: string | null) {
  if (!value) return "destination_ride";
  const normalized = value.toLowerCase();
  if (normalized === "destination_ride" || normalized === "swarm") return normalized;
  return "destination_ride";
}

export async function insertCampaignRecord(
  input: CampaignRecordInput,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const supabase = createSupabaseAdminClient();
  const campaignData: Record<string, unknown> = {
    advertiser_id: input.advertiserId,
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
    lifecycle_status: input.status ?? "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("campaign")
    .insert(campaignData)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  if (input.routeIds && input.routeIds.length > 0 && data?.id) {
    await supabase
      .from("route")
      .update({ campaign_id: data.id })
      .in("id", input.routeIds);
  }

  return { data: data as Record<string, unknown>, error: null };
}

export async function updateCampaignRecord(
  input: CampaignUpdateRecordInput,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
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
  if (input.advertiserId !== undefined) updateData.advertiser_id = input.advertiserId;
  if (input.campaignType !== undefined) {
    updateData.campaign_type = mapUiCampaignTypeToDb(input.campaignType);
  }
  if (input.targetZones !== undefined) updateData.target_zones = input.targetZones;
  if (input.vehicleTypeRequired !== undefined) {
    updateData.vehicle_type_required = input.vehicleTypeRequired;
  }
  if (input.status !== undefined) updateData.lifecycle_status = input.status;

  if (input.deliveryMode !== undefined) {
    const { data: existingCampaign } = await supabase
      .from("campaign")
      .select("requirements")
      .eq("id", input.id)
      .maybeSingle();

    const existingRequirements =
      existingCampaign?.requirements &&
      typeof existingCampaign.requirements === "object"
        ? (existingCampaign.requirements as Record<string, unknown>)
        : {};

    updateData.requirements = {
      ...existingRequirements,
      deliveryMode: input.deliveryMode,
    };
  }

  const { data, error } = await supabase
    .from("campaign")
    .update(updateData)
    .eq("id", input.id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Record<string, unknown>, error: null };
}

export async function listCampaignRecords(filters?: {
  advertiserId?: string;
}): Promise<Record<string, unknown>[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("campaign").select("*").order("created_at", { ascending: false });

  if (filters?.advertiserId) {
    query = query.eq("advertiser_id", filters.advertiserId);
  }

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function getCampaignRecordById(
  id: string,
): Promise<Record<string, unknown> | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("campaign").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown> | null) ?? null;
}
