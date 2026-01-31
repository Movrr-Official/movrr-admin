"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  Campaign,
  CampaignFiltersSchema,
  createCampaignSchema,
  updateCampaignSchema,
  campaignStatusSchema,
} from "@/schemas";
import { z } from "zod";

const normalizeCampaignType = (value?: string | null) => {
  if (!value) return "destination_ride";
  const normalized = value.toLowerCase();

  if (normalized === "destination_ride" || normalized === "swarm") {
    return normalized;
  }

  return "destination_ride";
};

const mapUiCampaignTypeToDb = (value?: string | null) => {
  if (!value) return "destination_ride";
  const normalized = value.toLowerCase();

  if (normalized === "destination_ride" || normalized === "swarm") {
    return normalized;
  }

  return "destination_ride";
};

const normalizeLifecycleStatus = (value?: string | null) => {
  if (!value) return "draft";
  const status = value.toLowerCase();
  if (
    ["draft", "active", "paused", "completed", "cancelled"].includes(status)
  ) {
    return status;
  }
  return "draft";
};

const computeProgress = (
  startDate?: string | null,
  endDate?: string | null,
) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
};

const toCreativeAssets = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "url" in item) {
          return String((item as { url?: string }).url ?? "");
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof value === "string") return [value];
  return [];
};

const geoJsonSchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.any()),
});

const campaignZoneSchema = z.object({
  id: z.string().optional(),
  campaignId: z.string(),
  name: z.string().optional(),
  geom: geoJsonSchema,
});

const campaignHotZoneSchema = z.object({
  id: z.string().optional(),
  campaignId: z.string(),
  name: z.string().optional(),
  bonusPercent: z.number().int().min(0).max(100),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  geom: geoJsonSchema,
});

const updateCampaignAttributesSchema = z.object({
  id: z.string(),
  campaignType: z.enum(["destination_ride", "swarm"]).optional(),
  lifecycleStatus: z
    .enum(["draft", "active", "paused", "completed", "cancelled"])
    .optional(),
  vehicleTypeRequired: z.string().optional(),
  targetZones: z.array(z.string()).optional(),
  coverageGoal: z.string().optional(),
  visibilityTarget: z.string().optional(),
  maxRiders: z.number().int().optional(),
  signupDeadline: z.string().datetime().optional(),
  selectionStrategy: z.string().optional(),
  selectionParams: z.record(z.unknown()).optional(),
  requirements: z.record(z.unknown()).optional(),
  campaignMultiplier: z.number().optional(),
  campaignPointsCap: z.number().int().optional(),
  expectedMinDailyVerifiedMinutes: z.number().int().optional(),
  expectedMaxDailyVerifiedMinutes: z.number().int().optional(),
});

/**
 * Server action to fetch campaigns for the dashboard.
 */
export async function getCampaigns(
  filters?: CampaignFiltersSchema,
  advertiserUserIds: string[] = [],
): Promise<{ success: boolean; data?: Campaign[]; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: advertisers } = await supabaseAdmin
      .from("advertiser")
      .select("id, user_id, company_name")
      .order("created_at", { ascending: false });

    const advertiserById = new Map(
      (advertisers ?? []).map((adv) => [adv.id, adv]),
    );

    const allowedAdvertiserIds = advertiserUserIds.length
      ? (advertisers ?? [])
          .filter((adv) => advertiserUserIds.includes(adv.user_id))
          .map((adv) => adv.id)
      : null;

    let query = supabaseAdmin.from("campaign").select("*");

    if (filters?.status && filters.status !== "all") {
      query = query.eq("lifecycle_status", filters.status);
    }

    if (filters?.campaignType && filters.campaignType !== "all") {
      query = query.eq("campaign_type", filters.campaignType);
    }

    if (filters?.targetZones?.length) {
      query = query.contains("target_zones", filters.targetZones);
    }

    if (filters?.searchQuery) {
      const q = filters.searchQuery.trim();
      if (q) {
        query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
      }
    }

    if (allowedAdvertiserIds && allowedAdvertiserIds.length > 0) {
      query = query.in("advertiser_id", allowedAdvertiserIds);
    }

    const { data: campaigns, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const campaignIds = (campaigns ?? []).map((c) => c.id);

    const { data: routes } = campaignIds.length
      ? await supabaseAdmin
          .from("route")
          .select("id, name, status, campaign_id")
          .in("campaign_id", campaignIds)
      : { data: [] };

    const routesByCampaign = new Map<
      string,
      { id: string; name: string; status: string }[]
    >();
    (routes ?? []).forEach((route) => {
      if (!route.campaign_id) return;
      const list = routesByCampaign.get(route.campaign_id) ?? [];
      list.push({
        id: route.id,
        name: route.name,
        status: route.status ?? "pending",
      });
      routesByCampaign.set(route.campaign_id, list);
    });

    const { data: assignments } = campaignIds.length
      ? await supabaseAdmin
          .from("campaign_assignment")
          .select("campaign_id, rider_id")
          .in("campaign_id", campaignIds)
      : { data: [] };

    const assignmentsByCampaign = new Map<string, string[]>();
    (assignments ?? []).forEach((row) => {
      if (!row.campaign_id) return;
      const list = assignmentsByCampaign.get(row.campaign_id) ?? [];
      if (row.rider_id) list.push(row.rider_id);
      assignmentsByCampaign.set(row.campaign_id, list);
    });

    const mapped = (campaigns ?? []).map((campaign) => {
      const advertiser = advertiserById.get(campaign.advertiser_id);
      const impressions = Number(campaign.impressions ?? 0);
      const clicks = Number(campaign.clicks ?? 0);
      const conversions = Number(campaign.conversions ?? 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      return {
        id: campaign.id,
        advertiserId: campaign.advertiser_id,
        name: campaign.name,
        brand: advertiser?.company_name ?? undefined,
        description: campaign.description ?? "",
        status: normalizeLifecycleStatus(campaign.lifecycle_status),
        budget: Number(campaign.budget ?? 0),
        spent: 0,
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        impressionGoal: Number(campaign.visibility_target ?? 0) || 0,
        impressions,
        clicks,
        ctr,
        roi: Number(campaign.roi ?? 0),
        progress: computeProgress(campaign.start_date, campaign.end_date),
        campaignType: normalizeCampaignType(campaign.campaign_type),
        targetZones: campaign.target_zones ?? [],
        targetAudience:
          (campaign.requirements && campaign.requirements.targetAudience) || "",
        vehicleTypeRequired:
          (campaign.vehicle_type_required as Campaign["vehicleTypeRequired"]) ??
          "bike",
        ridersAssigned: assignmentsByCampaign.get(campaign.id) ?? [],
        daysActive: [],
        hoursActive: [],
        assets: [],
        deliveryMode: "manual",
        creativeAssets: toCreativeAssets(campaign.creative_assets),
        complianceStatus: "pending",
        _count: {
          impressions,
          clicks,
          conversions,
        },
        createdAt: campaign.created_at ?? new Date().toISOString(),
        updatedAt: campaign.updated_at ?? new Date().toISOString(),
        routes: routesByCampaign.get(campaign.id) ?? [],
        pauseReason: undefined,
        campaignAnalytics: undefined,
        topCity: (campaign.target_zones ?? [""])[0] ?? "",
        vehicle: campaign.vehicle_type_required ?? "",
        zones: campaign.target_zones ?? [],
        engagementRate: Number(campaign.engagement_rate ?? 0),
        clickRate: impressions > 0 ? (clicks / impressions) * 100 : 0,
        conversionRate: impressions > 0 ? (conversions / impressions) * 100 : 0,
        avgDuration:
          campaign.start_date && campaign.end_date
            ? Math.max(
                0,
                Math.ceil(
                  (new Date(campaign.end_date).getTime() -
                    new Date(campaign.start_date).getTime()) /
                    (1000 * 60 * 60 * 24),
                ),
              )
            : 0,
      } as Campaign;
    });

    return { success: true, data: mapped };
  } catch (error) {
    console.error("Get campaigns error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch campaigns",
    };
  }
}

/**
 * Server action to create a new campaign
 */
export async function createCampaign(
  data: z.infer<typeof createCampaignSchema> & {
    advertiserId: string;
    campaignType?: "destination_ride" | "swarm";
    targetZones?: string[];
    vehicleTypeRequired?: "bike" | "e-bike" | "cargo-bike";
    deliveryMode?: "manual" | "automated";
    impressionGoal?: number;
  },
): Promise<{ success: boolean; error?: string; data?: Campaign }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = createCampaignSchema.parse(data);

    const campaignData: Record<string, any> = {
      advertiser_id: data.advertiserId,
      name: validatedData.name,
      description: validatedData.description || "",
      budget: validatedData.budget,
      start_date: validatedData.startDate,
      end_date: validatedData.endDate,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      roi: 0,
      campaign_type: mapUiCampaignTypeToDb(data.campaignType),
      target_zones: data.targetZones || [],
      vehicle_type_required: data.vehicleTypeRequired || "bike",
      creative_assets: [],
      lifecycle_status: "draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: campaign, error } = await supabaseAdmin
      .from("campaign")
      .insert(campaignData)
      .select()
      .single();

    if (error) {
      console.error("Create campaign error:", error);
      return { success: false, error: error.message };
    }

    // Assign routes if provided
    if (validatedData.routeIds && validatedData.routeIds.length > 0) {
      await supabaseAdmin
        .from("route")
        .update({ campaign_id: campaign.id })
        .in("id", validatedData.routeIds);
    }

    revalidatePath("/campaigns");
    return { success: true, data: campaign as unknown as Campaign };
  } catch (error) {
    console.error("Create campaign error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create campaign",
    };
  }
}

/**
 * Server action to update campaign information
 */
export async function updateCampaign(
  data: z.infer<typeof updateCampaignSchema> & {
    advertiserId?: string;
    campaignType?: "destination_ride" | "swarm";
    targetZones?: string[];
    vehicleTypeRequired?: "bike" | "e-bike" | "cargo-bike";
    deliveryMode?: "manual" | "automated";
    status?: z.infer<typeof campaignStatusSchema>;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = updateCampaignSchema.parse(data);

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Only include fields that are provided
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined)
      updateData.description = validatedData.description;
    if (validatedData.budget !== undefined)
      updateData.budget = validatedData.budget;
    if (validatedData.startDate !== undefined)
      updateData.start_date = validatedData.startDate;
    if (validatedData.endDate !== undefined)
      updateData.end_date = validatedData.endDate;
    if (data.advertiserId !== undefined)
      updateData.advertiser_id = data.advertiserId;
    if (data.campaignType !== undefined)
      updateData.campaign_type = mapUiCampaignTypeToDb(data.campaignType);
    if (data.targetZones !== undefined)
      updateData.target_zones = data.targetZones;
    if (data.vehicleTypeRequired !== undefined)
      updateData.vehicle_type_required = data.vehicleTypeRequired;
    if (data.status !== undefined) updateData.lifecycle_status = data.status;

    const { error } = await supabaseAdmin
      .from("campaign")
      .update(updateData)
      .eq("id", validatedData.id);

    if (error) {
      console.error("Update campaign error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${validatedData.id}`);
    return { success: true };
  } catch (error) {
    console.error("Update campaign error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update campaign",
    };
  }
}

/**
 * Server action to update campaign lifecycle status
 */
export async function updateCampaignStatus(
  campaignId: string,
  status: z.infer<typeof campaignStatusSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { error } = await supabaseAdmin
      .from("campaign")
      .update({
        lifecycle_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    if (error) {
      console.error("Update campaign status error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: true };
  } catch (error) {
    console.error("Update campaign status error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update campaign status",
    };
  }
}

/**
 * Server action to run campaign selection
 */
export async function runCampaignSelection(
  campaignId: string,
  strategy: string = "first_come_first_served",
): Promise<{
  success: boolean;
  error?: string;
  data?: { selectedCount: number; rejectedCount: number };
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data, error } = await supabaseAdmin.rpc("run_campaign_selection", {
      p_campaign_id: campaignId,
      p_strategy: strategy,
    });

    if (error) {
      console.error("Run campaign selection error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      success: true,
      data: {
        selectedCount: data?.selectedCount || 0,
        rejectedCount: data?.rejectedCount || 0,
      },
    };
  } catch (error) {
    console.error("Run campaign selection error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to run campaign selection",
    };
  }
}

/**
 * Server action to delete a campaign
 */
export async function deleteCampaign(
  campaignId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { error } = await supabaseAdmin
      .from("campaign")
      .delete()
      .eq("id", campaignId);

    if (error) {
      console.error("Delete campaign error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/campaigns");
    return { success: true };
  } catch (error) {
    console.error("Delete campaign error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete campaign",
    };
  }
}

/**
 * Server action to duplicate a campaign
 */
export async function duplicateCampaign(
  campaignId: string,
): Promise<{ success: boolean; error?: string; data?: Campaign }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch the original campaign
    const { data: originalCampaign, error: fetchError } = await supabaseAdmin
      .from("campaign")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (fetchError || !originalCampaign) {
      return { success: false, error: "Campaign not found" };
    }

    // Create a new campaign with copied data
    const newCampaignData = {
      ...originalCampaign,
      id: undefined, // Let database generate new ID
      name: `${originalCampaign.name} (Copy)`,
      lifecycle_status: "draft",
      impressions: 0,
      clicks: 0,
      conversions: 0,
      roi: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: newCampaign, error: createError } = await supabaseAdmin
      .from("campaign")
      .insert(newCampaignData)
      .select()
      .single();

    if (createError) {
      console.error("Duplicate campaign error:", createError);
      return { success: false, error: createError.message };
    }

    revalidatePath("/campaigns");
    return { success: true, data: newCampaign as unknown as Campaign };
  } catch (error) {
    console.error("Duplicate campaign error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to duplicate campaign",
    };
  }
}

/**
 * Update campaign attributes tied to routing/eligibility.
 */
export async function updateCampaignAttributes(
  data: z.infer<typeof updateCampaignAttributesSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = updateCampaignAttributesSchema.parse(data);

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (validatedData.campaignType !== undefined) {
      updateData.campaign_type = validatedData.campaignType;
    }
    if (validatedData.lifecycleStatus !== undefined) {
      updateData.lifecycle_status = validatedData.lifecycleStatus;
    }
    if (validatedData.vehicleTypeRequired !== undefined) {
      updateData.vehicle_type_required = validatedData.vehicleTypeRequired;
    }
    if (validatedData.targetZones !== undefined) {
      updateData.target_zones = validatedData.targetZones;
    }
    if (validatedData.coverageGoal !== undefined) {
      updateData.coverage_goal = validatedData.coverageGoal;
    }
    if (validatedData.visibilityTarget !== undefined) {
      updateData.visibility_target = validatedData.visibilityTarget;
    }
    if (validatedData.maxRiders !== undefined) {
      updateData.max_riders = validatedData.maxRiders;
    }
    if (validatedData.signupDeadline !== undefined) {
      updateData.signup_deadline = validatedData.signupDeadline;
    }
    if (validatedData.selectionStrategy !== undefined) {
      updateData.selection_strategy = validatedData.selectionStrategy;
    }
    if (validatedData.selectionParams !== undefined) {
      updateData.selection_params = validatedData.selectionParams;
    }
    if (validatedData.requirements !== undefined) {
      updateData.requirements = validatedData.requirements;
    }
    if (validatedData.campaignMultiplier !== undefined) {
      updateData.campaign_multiplier = validatedData.campaignMultiplier;
    }
    if (validatedData.campaignPointsCap !== undefined) {
      updateData.campaign_points_cap = validatedData.campaignPointsCap;
    }
    if (validatedData.expectedMinDailyVerifiedMinutes !== undefined) {
      updateData.expected_min_daily_verified_minutes =
        validatedData.expectedMinDailyVerifiedMinutes;
    }
    if (validatedData.expectedMaxDailyVerifiedMinutes !== undefined) {
      updateData.expected_max_daily_verified_minutes =
        validatedData.expectedMaxDailyVerifiedMinutes;
    }

    const { error } = await supabaseAdmin
      .from("campaign")
      .update(updateData)
      .eq("id", validatedData.id);

    if (error) {
      console.error("Update campaign attributes error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${validatedData.id}`);
    return { success: true };
  } catch (error) {
    console.error("Update campaign attributes error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update campaign attributes",
    };
  }
}

export async function getCampaignZones(campaignId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  return supabaseAdmin
    .from("campaign_zone")
    .select("id, campaign_id, name, geom, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
}

export async function upsertCampaignZone(
  data: z.infer<typeof campaignZoneSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = campaignZoneSchema.parse(data);

    if (validatedData.id) {
      const { error } = await supabaseAdmin
        .from("campaign_zone")
        .update({
          name: validatedData.name,
          geom: validatedData.geom,
        })
        .eq("id", validatedData.id);

      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      const { error } = await supabaseAdmin.from("campaign_zone").insert({
        campaign_id: validatedData.campaignId,
        name: validatedData.name,
        geom: validatedData.geom,
      });

      if (error) {
        return { success: false, error: error.message };
      }
    }

    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${validatedData.campaignId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to upsert campaign zone",
    };
  }
}

export async function deleteCampaignZone(
  zoneId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin
      .from("campaign_zone")
      .delete()
      .eq("id", zoneId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/campaigns");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete campaign zone",
    };
  }
}

export async function getCampaignHotZones(campaignId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  return supabaseAdmin
    .from("campaign_hot_zone")
    .select(
      "id, campaign_id, name, bonus_percent, starts_at, ends_at, geom, created_at",
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
}

export async function upsertCampaignHotZone(
  data: z.infer<typeof campaignHotZoneSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = campaignHotZoneSchema.parse(data);

    if (validatedData.id) {
      const { error } = await supabaseAdmin
        .from("campaign_hot_zone")
        .update({
          name: validatedData.name,
          bonus_percent: validatedData.bonusPercent,
          starts_at: validatedData.startsAt,
          ends_at: validatedData.endsAt,
          geom: validatedData.geom,
        })
        .eq("id", validatedData.id);

      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      const { error } = await supabaseAdmin.from("campaign_hot_zone").insert({
        campaign_id: validatedData.campaignId,
        name: validatedData.name,
        bonus_percent: validatedData.bonusPercent,
        starts_at: validatedData.startsAt,
        ends_at: validatedData.endsAt,
        geom: validatedData.geom,
      });

      if (error) {
        return { success: false, error: error.message };
      }
    }

    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${validatedData.campaignId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to upsert campaign hot zone",
    };
  }
}

export async function deleteCampaignHotZone(
  zoneId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin
      .from("campaign_hot_zone")
      .delete()
      .eq("id", zoneId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/campaigns");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete campaign hot zone",
    };
  }
}
