"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
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
    [
      "draft",
      "open_for_signup",
      "selection_in_progress",
      "confirmed",
      "active",
      "paused",
      "completed",
      "cancelled",
    ].includes(status)
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
    .enum([
      "draft",
      "open_for_signup",
      "selection_in_progress",
      "confirmed",
      "active",
      "paused",
      "completed",
      "cancelled",
    ])
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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

    if (filters?.dateRange?.from) {
      query = query.gte("end_date", filters.dateRange.from.toISOString());
    }

    if (filters?.dateRange?.to) {
      query = query.lte("start_date", filters.dateRange.to.toISOString());
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
      const qrScans = Number(campaign.qr_scans ?? 0);
      const conversions = Number(campaign.conversions ?? 0);
      const scanRate = impressions > 0 ? (qrScans / impressions) * 100 : 0;

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
        qrScans,
        conversions,
        scanRate,
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
        deliveryMode:
          campaign.requirements &&
          typeof campaign.requirements === "object" &&
          "deliveryMode" in campaign.requirements &&
          ["manual", "automated"].includes(
            String((campaign.requirements as Record<string, unknown>).deliveryMode),
          )
            ? (String(
                (campaign.requirements as Record<string, unknown>).deliveryMode,
              ) as Campaign["deliveryMode"])
            : "manual",
        creativeAssets: toCreativeAssets(campaign.creative_assets),
        complianceStatus: "pending",
        _count: {
          impressions,
          qrScans,
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
        scanRatePercent: impressions > 0 ? (qrScans / impressions) * 100 : 0,
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = createCampaignSchema.parse(data);

    const campaignData: Record<string, any> = {
      advertiser_id: data.advertiserId,
      name: validatedData.name,
      description: validatedData.description || "",
      budget: validatedData.budget,
      start_date: validatedData.startDate,
      end_date: validatedData.endDate,
      visibility_target:
        data.impressionGoal !== undefined ? String(data.impressionGoal) : null,
      impressions: 0,
      qr_scans: 0,
      conversions: 0,
      campaign_type: mapUiCampaignTypeToDb(data.campaignType),
      target_zones: data.targetZones || [],
      vehicle_type_required: data.vehicleTypeRequired || "bike",
      requirements: data.deliveryMode
        ? { deliveryMode: data.deliveryMode }
        : undefined,
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
  data: z.infer<typeof updateCampaignSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
    if (validatedData.impressionGoal !== undefined)
      updateData.visibility_target = String(validatedData.impressionGoal);
    if (validatedData.advertiserId !== undefined)
      updateData.advertiser_id = validatedData.advertiserId;
    if (validatedData.campaignType !== undefined)
      updateData.campaign_type = mapUiCampaignTypeToDb(validatedData.campaignType);
    if (validatedData.targetZones !== undefined)
      updateData.target_zones = validatedData.targetZones;
    if (validatedData.vehicleTypeRequired !== undefined)
      updateData.vehicle_type_required = validatedData.vehicleTypeRequired;
    if (validatedData.status !== undefined)
      updateData.lifecycle_status = validatedData.status;
    if (validatedData.deliveryMode !== undefined) {
      const { data: existingCampaign } = await supabaseAdmin
        .from("campaign")
        .select("requirements")
        .eq("id", validatedData.id)
        .maybeSingle();

      const existingRequirements =
        existingCampaign?.requirements &&
        typeof existingCampaign.requirements === "object"
          ? (existingCampaign.requirements as Record<string, unknown>)
          : {};

      updateData.requirements = {
        ...existingRequirements,
        deliveryMode: validatedData.deliveryMode,
      };
    }

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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
      qr_scans: 0,
      conversions: 0,
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
  await requireAdminRoles(ADMIN_ONLY_ROLES);
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
  await requireAdminRoles(ADMIN_ONLY_ROLES);
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
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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

/**
 * Real campaign analytics derived from Supabase data.
 *
 * Sources of truth (mobile-aligned):
 *  - Daily impressions  → ride_session.campaign_impact_impressions summed per day
 *  - Engagement by city → ride_session sessions grouped by city
 *  - Rider allocation   → campaign_assignment + rider_route live state
 *
 * Replaces the former seed-based getCampaignAnalytics() generator which
 * returned fabricated data unrelated to actual ride activity.
 */
export async function getCampaignAnalyticsData(
  campaignIds?: string[],
  days: number = 30,
): Promise<{
  success: boolean;
  data?: {
    dailyImpressions: Array<{ date: string; impressions: number }>;
    engagementByCity: Array<{
      city: string;
      engagement: number;
      campaigns: number;
    }>;
    riderAllocation: Array<{ name: string; value: number; color: string }>;
    totalImpressions: number;
    activeRiders: number;
  };
  error?: string;
}> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // ── Daily impressions ──────────────────────────────────────────────────────
    // Sum campaign_impact_impressions per calendar day from completed sessions.
    // Falls back to counting sessions if the column is absent (graceful degradation).
    let sessionsQuery = supabaseAdmin
      .from("ride_session")
      .select("campaign_id, ended_at, campaign_impact_impressions, city")
      .not("ended_at", "is", null)
      .gte("ended_at", since);

    if (campaignIds && campaignIds.length > 0) {
      sessionsQuery = sessionsQuery.in("campaign_id", campaignIds);
    } else {
      sessionsQuery = sessionsQuery.not("campaign_id", "is", null);
    }

    const { data: sessionRows } = await sessionsQuery.limit(5000);
    const rows = sessionRows ?? [];

    // Build day buckets (last `days` days)
    const dailyMap = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dailyMap.set(d.toISOString().split("T")[0], 0);
    }

    let totalImpressions = 0;
    rows.forEach((row) => {
      if (!row.ended_at) return;
      const day = new Date(row.ended_at).toISOString().split("T")[0];
      const imp = Number(row.campaign_impact_impressions ?? 1);
      totalImpressions += imp;
      if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + imp);
    });

    const dailyImpressions = Array.from(dailyMap.entries()).map(
      ([date, impressions]) => ({ date, impressions }),
    );

    // ── Engagement by city ─────────────────────────────────────────────────────
    // Count distinct campaign sessions per city; engagement = sessions / active days
    const cityMap = new Map<string, { sessions: number; campaignSet: Set<string> }>();
    rows.forEach((row) => {
      if (!row.city) return;
      const entry = cityMap.get(row.city) ?? { sessions: 0, campaignSet: new Set() };
      entry.sessions += 1;
      if (row.campaign_id) entry.campaignSet.add(row.campaign_id);
      cityMap.set(row.city, entry);
    });

    const engagementByCity = Array.from(cityMap.entries())
      .map(([city, { sessions, campaignSet }]) => ({
        city,
        engagement: Math.round((sessions / Math.max(days, 1)) * 10) / 10,
        campaigns: campaignSet.size,
        _sessions: sessions,
      }))
      .sort((a, b) => b._sessions - a._sessions)
      .slice(0, 8)
      .map(({ _sessions: _s, ...rest }) => rest);

    // ── Rider allocation ───────────────────────────────────────────────────────
    // Derives live rider state from campaign_assignment and rider_route tables.
    const [
      { count: totalActiveRiders },
      { data: assignmentRows },
      { data: onRouteRows },
    ] = await Promise.all([
      supabaseAdmin
        .from("rider")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("campaign_assignment")
        .select("rider_id")
        .in("campaign_id", campaignIds && campaignIds.length > 0 ? campaignIds : ["none"])
        .not("rider_id", "is", null),
      supabaseAdmin
        .from("rider_route")
        .select("rider_id")
        .eq("status", "in-progress")
        .not("rider_id", "is", null),
    ]);

    const total = totalActiveRiders ?? 0;
    const assignedSet = new Set((assignmentRows ?? []).map((r) => r.rider_id));
    const onRouteSet = new Set((onRouteRows ?? []).map((r) => r.rider_id));
    const onRouteCount = onRouteSet.size;
    const assignedCount = Math.max(0, assignedSet.size - onRouteCount);
    const availableCount = Math.max(0, total - assignedSet.size);
    const activeRiders = assignedSet.size;

    const riderAllocation = [
      { name: "Available", value: availableCount, color: "var(--chart-1)" },
      { name: "Assigned", value: assignedCount, color: "var(--chart-3)" },
      { name: "On Route", value: onRouteCount, color: "var(--chart-2)" },
    ].filter((r) => r.value > 0);

    return {
      success: true,
      data: {
        dailyImpressions,
        engagementByCity,
        riderAllocation,
        totalImpressions,
        activeRiders,
      },
    };
  } catch (error) {
    console.error("Get campaign analytics error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch campaign analytics",
    };
  }
}

export async function deleteCampaignHotZone(
  zoneId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
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
