"use server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { Rider, RiderFiltersSchema } from "@/schemas";

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

const toRiderStatus = (value?: string | null): Rider["status"] => {
  if (!value) return "active";
  if (value === "suspended") return "suspended";
  if (value === "inactive") return "inactive";
  return "active";
};

export async function getRiders(
  filters?: RiderFiltersSchema,
): Promise<{ success: boolean; data?: Rider[]; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    let query = supabaseAdmin.from("rider").select("*");

    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    if (filters?.vehicleType && filters.vehicleType !== "all") {
      query = query.eq("vehicle_type", filters.vehicleType);
    }

    const { data: riders, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const userIds = (riders ?? []).map((rider) => rider.user_id);

    const { data: users } = userIds.length
      ? await supabaseAdmin
          .from("user")
          .select(
            "id, name, email, phone, avatar_url, language_preference, is_verified",
          )
          .in("id", userIds)
      : { data: [] };

    const userById = new Map((users ?? []).map((user) => [user.id, user]));

    const riderIds = (riders ?? []).map((rider) => rider.id);

    const { data: activeRoutes } = riderIds.length
      ? await supabaseAdmin
          .from("rider_route")
          .select("id, rider_id, status, route:route_id (id, name)")
          .in("rider_id", riderIds)
          .in("status", ["assigned", "in-progress"])
      : { data: [] };

    const activeRouteByRider = new Map<string, { id: string; name?: string }>();
    (activeRoutes ?? []).forEach((route) => {
      if (!route.rider_id) return;
      if (!activeRouteByRider.has(route.rider_id)) {
        const routeName = (route as { route?: { name?: string } }).route?.name;
        activeRouteByRider.set(route.rider_id, {
          id: route.id,
          name: routeName,
        });
      }
    });

    const mapped = (riders ?? []).map((rider) => {
      const user = userById.get(rider.user_id);
      const currentRoute = activeRouteByRider.get(rider.id);

      return {
        id: rider.id,
        userId: rider.user_id,
        name: user?.name ?? "Unknown Rider",
        email: user?.email ?? "",
        phone: user?.phone ?? undefined,
        avatarUrl: user?.avatar_url ?? undefined,
        role: "rider",
        status: toRiderStatus(rider.status),
        isVerified: Boolean(user?.is_verified ?? false),
        isCertified: Boolean(rider.is_certified),
        createdAt: rider.created_at ?? new Date().toISOString(),
        updatedAt:
          rider.updated_at ?? rider.created_at ?? new Date().toISOString(),
        languagePreference: user?.language_preference ?? "en",
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
              assignedDate:
                rider.updated_at ??
                rider.created_at ??
                new Date().toISOString(),
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
        routeProgress: rider.route_progress ?? undefined,
        impressionsDelivered: Number(rider.impressions_delivered ?? 0),
        campaignsCompleted: Number(rider.total_campaigns ?? 0),
        availability: toAvailability(Boolean(rider.availability)),
        preferredHours: "flexible",
        schedule: [],
        vehicle: {
          type: toVehicleType(rider.vehicle_type),
          model: undefined,
          year: undefined,
          lastInspection: undefined,
          inspectionStatus: "pending",
        },
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
        routeCompletionRate: Number(rider.route_progress ?? 0),
      } as Rider;
    });

    let filtered = mapped;
    if (filters?.searchQuery) {
      const queryText = filters.searchQuery.toLowerCase();
      filtered = mapped.filter(
        (rider) =>
          rider.name.toLowerCase().includes(queryText) ||
          rider.email.toLowerCase().includes(queryText),
      );
    }

    if (filters?.minRating && filters.minRating !== "all") {
      const minRating = Number(filters.minRating);
      filtered = filtered.filter((rider) => rider.rating >= minRating);
    }

    return { success: true, data: filtered };
  } catch (error) {
    console.error("Get riders error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch riders",
    };
  }
}
