"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import {
  fetchLatestUserActivitySignalMap,
  resolveLatestIsoTimestamp,
} from "@/lib/activitySignals";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { Rider, RiderFiltersSchema, updateRiderSchema } from "@/schemas";
import { z } from "zod";

const ACTIVE_ROUTE_STATUSES = ["assigned", "in-progress"];
const ACTIVE_CAMPAIGN_STATUSES = ["active", "paused"];

const toAvailability = (isAvailable: boolean) => ({
  monday: isAvailable,
  tuesday: isAvailable,
  wednesday: isAvailable,
  thursday: isAvailable,
  friday: isAvailable,
  saturday: isAvailable,
  sunday: isAvailable,
});

const toVehicleType = (value?: string | null): Rider["vehicle"]["type"] => {
  const normalized = value?.toLowerCase();
  if (normalized === "e-bike" || normalized === "ebike") return "e-bike";
  if (normalized === "cargo" || normalized === "cargo-bike") return "cargo";
  if (normalized === "scooter") return "scooter";
  return "bike";
};

const mapDbStatusToUi = (value?: string | null): Rider["status"] => {
  if (!value) return "active";
  if (value === "suspended") return "inactive";
  if (value === "pending") return "pending";
  if (value === "inactive") return "inactive";
  return "active";
};

const mapUiStatusToDb = (value?: Rider["status"]) => {
  if (!value) return undefined;
  if (value === "inactive") return "suspended";
  return value;
};

const computeProfileCompleteness = (
  rider: {
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    emergency_contact?: string | null;
    emergency_phone?: string | null;
    vehicle_type?: string | null;
  },
  user?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
  },
) => {
  const checks = [
    Boolean(user?.name?.trim()),
    Boolean(user?.email?.trim()),
    Boolean(user?.phone?.trim() || rider.phone?.trim()),
    Boolean(rider.city?.trim()),
    Boolean(rider.country?.trim()),
    Boolean(rider.vehicle_type?.trim()),
    Boolean(rider.emergency_contact?.trim()),
    Boolean(rider.emergency_phone?.trim()),
    Boolean(user?.avatar_url?.trim()),
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
};

type RiderRow = {
  id: string;
  user_id: string;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  is_certified?: boolean | null;
  availability?: boolean | null;
  vehicle_type?: string | null;
  route_progress?: number | null;
  impressions_delivered?: number | null;
  total_campaigns?: number | null;
  rating?: number | null;
  current_campaign?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  status?: string | null;
};

const mapRiderRow = ({
  rider,
  user,
  currentRoute,
  activeRoutesCount,
  campaignsCompleted,
  activeCampaignsCount,
  pointsBalance,
  lifetimePointsEarned,
}: {
  rider: RiderRow;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    language_preference?: string | null;
    is_verified?: boolean | null;
    status?: string | null;
    last_login?: string | null;
    account_notes?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  currentRoute?: { id: string; name?: string | null };
  activeRoutesCount: number;
  campaignsCompleted: number;
  activeCampaignsCount: number;
  pointsBalance: number;
  lifetimePointsEarned: number;
}): Rider => {
  const createdAt =
    rider.created_at ?? user?.created_at ?? new Date().toISOString();
  const updatedAt =
    rider.updated_at ??
    user?.updated_at ??
    rider.created_at ??
    new Date().toISOString();
  const lastActivityAt = resolveLatestIsoTimestamp(
    user?.last_login ?? undefined,
    rider.updated_at ?? undefined,
    createdAt,
  );
  const routeProgress = Number(rider.route_progress ?? 0);
  const vehicleType = toVehicleType(rider.vehicle_type);

  return {
    id: rider.id,
    userId: rider.user_id,
    name: user?.name ?? "Unknown Rider",
    email: user?.email ?? "",
    phone: user?.phone ?? rider.phone ?? undefined,
    avatarUrl: user?.avatar_url ?? undefined,
    role: "rider",
    status: mapDbStatusToUi(user?.status ?? rider.status),
    isVerified: Boolean(user?.is_verified ?? false),
    city: rider.city ?? undefined,
    country: rider.country ?? undefined,
    isCertified: Boolean(rider.is_certified),
    createdAt,
    updatedAt,
    lastActive: user?.last_login ?? undefined,
    lastActivityAt,
    profileCompleteness: computeProfileCompleteness(rider, user),
    languagePreference: user?.language_preference ?? "en",
    accountNotes: user?.account_notes ?? undefined,
    currentCampaign: rider.current_campaign ?? undefined,
    currentRoute: currentRoute
      ? {
          id: currentRoute.id,
          name: currentRoute.name ?? "Assigned route",
          brand: undefined,
          startLocation: "",
          endLocation: "",
          campaignId: [],
          waypoints: [],
          performance: "medium",
          difficulty: "Medium",
          assignedDate: updatedAt,
          assignedRiderId: [rider.id],
          status: "assigned",
          estimatedDuration: "",
          coverage: undefined,
          zone: rider.city ?? "",
          city: rider.city ?? "",
          startedAt: undefined,
          completedAt: undefined,
          cancelledAt: undefined,
          cancellationReason: undefined,
          completionTime: undefined,
        }
      : undefined,
    routeProgress: routeProgress || undefined,
    impressionsDelivered: Number(rider.impressions_delivered ?? 0),
    campaignsCompleted,
    activeCampaignsCount,
    activeRoutesCount,
    pointsBalance,
    lifetimePointsEarned,
    availability: toAvailability(Boolean(rider.availability)),
    preferredHours: "flexible",
    schedule: [],
    vehicle: {
      type: vehicleType,
      model: undefined,
      year: undefined,
      lastInspection: undefined,
      inspectionStatus: "pending",
    },
    vehicleType,
    hasHelmet: false,
    gearCertified: false,
    recentActivity: [],
    contact: {
      phone: rider.phone ?? user?.phone ?? "",
      emergencyContact: rider.emergency_contact ?? undefined,
      emergencyPhone: rider.emergency_phone ?? undefined,
    },
    assignedAdvertiserId: "",
    regionsCovered: rider.city ? [rider.city] : [],
    complianceWarnings: [],
    rating: Number(rider.rating ?? 0),
    weeklyEarnings: 0,
    totalEarnings: 0,
    totalRides: 0,
    routeCompletionRate: Math.min(100, Math.max(0, routeProgress)),
  };
};

export async function getRiders(
  filters?: RiderFiltersSchema,
): Promise<{ success: boolean; data?: Rider[]; error?: string }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    let query = supabaseAdmin.from("rider").select("*");

    if (filters?.vehicleType && filters.vehicleType !== "all") {
      query = query.eq("vehicle_type", filters.vehicleType);
    }

    const { data: riderRows, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const riders = (riderRows ?? []) as RiderRow[];
    const userIds = riders.map((rider) => rider.user_id).filter(Boolean);
    const riderIds = riders.map((rider) => rider.id);
    const lastActivitySignalMap = await fetchLatestUserActivitySignalMap(
      supabaseAdmin,
      userIds,
    );

    const [
      { data: users },
      { data: routeRows },
      { data: assignmentRows },
      { data: signupRows },
      { data: balanceRows },
    ] = await Promise.all([
      userIds.length
        ? supabaseAdmin
            .from("user")
            .select(
              "id, name, email, phone, avatar_url, language_preference, is_verified, status, last_login, account_notes, created_at, updated_at",
            )
            .in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      riderIds.length
        ? supabaseAdmin
            .from("rider_route")
            .select("rider_id, status, route:route_id (id, name)")
            .in("rider_id", riderIds)
        : Promise.resolve({ data: [] as any[] }),
      riderIds.length
        ? supabaseAdmin
            .from("campaign_assignment")
            .select(
              "rider_id, campaign:campaign_id (id, name, lifecycle_status)",
            )
            .in("rider_id", riderIds)
        : Promise.resolve({ data: [] as any[] }),
      riderIds.length
        ? supabaseAdmin
            .from("campaign_signup")
            .select(
              "rider_id, campaign:campaign_id (id, name, lifecycle_status)",
            )
            .in("rider_id", riderIds)
        : Promise.resolve({ data: [] as any[] }),
      riderIds.length
        ? supabaseAdmin
            .from("rider_reward_balance")
            .select("rider_id, points_balance, lifetime_points_earned")
            .in("rider_id", riderIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const userById = new Map((users ?? []).map((user) => [user.id, user]));
    const routeRowsByRider = new Map<string, any[]>();
    (routeRows ?? []).forEach((row) => {
      if (!row.rider_id) return;
      const existing = routeRowsByRider.get(row.rider_id) ?? [];
      existing.push(row);
      routeRowsByRider.set(row.rider_id, existing);
    });

    const campaignsByRider = new Map<
      string,
      Map<string, { id: string; lifecycle_status?: string | null }>
    >();
    [...(assignmentRows ?? []), ...(signupRows ?? [])].forEach((row) => {
      if (!row.rider_id) return;
      const campaign = Array.isArray(row.campaign) ? row.campaign[0] : row.campaign;
      if (!campaign?.id) return;
      const existing = campaignsByRider.get(row.rider_id) ?? new Map();
      existing.set(campaign.id, campaign);
      campaignsByRider.set(row.rider_id, existing);
    });

    const balanceByRider = new Map(
      (balanceRows ?? []).map((row) => [
        row.rider_id,
        {
          pointsBalance: Number(row.points_balance ?? 0),
          lifetimePointsEarned: Number(row.lifetime_points_earned ?? 0),
        },
      ]),
    );

    let mapped = riders.map((rider) => {
      const user = userById.get(rider.user_id);
      const riderRouteRows = routeRowsByRider.get(rider.id) ?? [];
      const activeRoutes = riderRouteRows.filter((row) =>
        ACTIVE_ROUTE_STATUSES.includes(row.status),
      );
      const currentRouteRow = activeRoutes[0];
      const currentRoute = currentRouteRow
        ? Array.isArray(currentRouteRow.route)
          ? currentRouteRow.route[0]
          : currentRouteRow.route
        : undefined;

      const riderCampaigns = campaignsByRider.get(rider.id) ?? new Map();
      const allCampaigns = [...riderCampaigns.values()];
      const activeCampaignsCount = allCampaigns.filter((campaign) =>
        ACTIVE_CAMPAIGN_STATUSES.includes(
          String(campaign.lifecycle_status ?? "").toLowerCase(),
        ),
      ).length;

      const balance = balanceByRider.get(rider.id);
      const lastActive = resolveLatestIsoTimestamp(
        lastActivitySignalMap.get(rider.user_id),
        user?.last_login ?? undefined,
      );

      const mappedRider = mapRiderRow({
        rider,
        user: user
          ? {
              ...user,
              last_login: lastActive ?? user.last_login,
            }
          : undefined,
        currentRoute,
        activeRoutesCount: activeRoutes.length,
        campaignsCompleted: Number(rider.total_campaigns ?? allCampaigns.length),
        activeCampaignsCount,
        pointsBalance: balance?.pointsBalance ?? 0,
        lifetimePointsEarned: balance?.lifetimePointsEarned ?? 0,
      });

      return {
        ...mappedRider,
        lastActive,
        lastActivityAt: resolveLatestIsoTimestamp(
          lastActive,
          rider.updated_at ?? undefined,
          mappedRider.createdAt,
        ),
      };
    });

    if (filters?.status && filters.status !== "all") {
      mapped = mapped.filter((rider) => rider.status === filters.status);
    }

    if (filters?.searchQuery) {
      const queryText = filters.searchQuery.trim().toLowerCase();
      mapped = mapped.filter(
        (rider) =>
          rider.name.toLowerCase().includes(queryText) ||
          rider.email.toLowerCase().includes(queryText) ||
          rider.city?.toLowerCase().includes(queryText) ||
          rider.country?.toLowerCase().includes(queryText),
      );
    }

    if (filters?.minRating && filters.minRating !== "all") {
      const minRating = Number(filters.minRating);
      mapped = mapped.filter((rider) => rider.rating >= minRating);
    }

    return { success: true, data: mapped };
  } catch (error) {
    console.error("Get riders error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch riders",
    };
  }
}

export async function getRiderById(
  riderId: string,
): Promise<{ success: boolean; data?: Rider | null; error?: string }> {
  const result = await getRiders();
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const rider =
    result.data?.find((entry) => entry.id === riderId || entry.userId === riderId) ??
    null;
  return { success: true, data: rider };
}

export async function updateRiderProfile(
  data: z.infer<typeof updateRiderSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = updateRiderSchema.parse(data);

    const { data: riderRow, error: riderLookupError } = await supabaseAdmin
      .from("rider")
      .select("id, user_id")
      .eq("id", validatedData.id)
      .single();

    if (riderLookupError || !riderRow?.user_id) {
      return {
        success: false,
        error: riderLookupError?.message || "Rider profile not found",
      };
    }

    const userUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const riderUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (validatedData.name !== undefined) userUpdate.name = validatedData.name;
    if (validatedData.email !== undefined) userUpdate.email = validatedData.email;
    if (validatedData.phone !== undefined) {
      userUpdate.phone = validatedData.phone;
      riderUpdate.phone = validatedData.phone;
    }
    if (validatedData.status !== undefined) {
      userUpdate.status = mapUiStatusToDb(validatedData.status);
      riderUpdate.status = mapUiStatusToDb(validatedData.status);
    }
    if (validatedData.languagePreference !== undefined) {
      userUpdate.language_preference = validatedData.languagePreference;
    }
    if (validatedData.accountNotes !== undefined) {
      userUpdate.account_notes = validatedData.accountNotes;
    }
    if (validatedData.avatarUrl !== undefined) {
      userUpdate.avatar_url = validatedData.avatarUrl;
    }
    if (validatedData.city !== undefined) riderUpdate.city = validatedData.city;
    if (validatedData.country !== undefined) {
      riderUpdate.country = validatedData.country;
    }
    if (validatedData.isCertified !== undefined) {
      riderUpdate.is_certified = validatedData.isCertified;
    }
    if (validatedData.vehicleType !== undefined) {
      riderUpdate.vehicle_type = validatedData.vehicleType;
    }
    if (validatedData.contact?.emergencyContact !== undefined) {
      riderUpdate.emergency_contact = validatedData.contact.emergencyContact;
    }
    if (validatedData.contact?.emergencyPhone !== undefined) {
      riderUpdate.emergency_phone = validatedData.contact.emergencyPhone;
    }
    if (validatedData.availability !== undefined) {
      const anyAvailable = Object.values(validatedData.availability).some(Boolean);
      riderUpdate.availability = anyAvailable;
    }

    const [{ error: userError }, { error: riderError }] = await Promise.all([
      Object.keys(userUpdate).length > 1
        ? supabaseAdmin.from("user").update(userUpdate).eq("id", riderRow.user_id)
        : Promise.resolve({ error: null }),
      Object.keys(riderUpdate).length > 1
        ? supabaseAdmin.from("rider").update(riderUpdate).eq("id", validatedData.id)
        : Promise.resolve({ error: null }),
    ]);

    if (userError || riderError) {
      return {
        success: false,
        error: userError?.message || riderError?.message || "Failed to update rider",
      };
    }

    revalidatePath("/riders");
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Update rider error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update rider",
    };
  }
}
