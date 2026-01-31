"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { RiderRoute, routeStatusSchema } from "@/schemas";
import { z } from "zod";

const updateRouteStatusSchema = z.object({
  routeId: z.string(),
  status: routeStatusSchema,
  reason: z.string().optional(),
});

const recalculateComplianceSchema = z.object({
  routeId: z.string(),
});

const exportRouteDataSchema = z.object({
  routeId: z.string(),
});

const deleteRouteSchema = z.object({
  routeId: z.string(),
});

const routePayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  campaignId: z.string().nullable().optional(),
  startLat: z.number().min(-90).max(90).optional(),
  startLng: z.number().min(-180).max(180).optional(),
  endLat: z.number().min(-90).max(90).optional(),
  endLng: z.number().min(-180).max(180).optional(),
  estimatedDurationMinutes: z.number().int().min(0).optional(),
  coverageKm: z.number().min(0).optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  status: z
    .enum(["pending", "active", "paused", "completed", "cancelled"])
    .optional(),
  tolerance: z.number().min(0).max(100).optional(),
});

const templateStatusSchema = z.enum(["active", "draft", "paused"]);

const routeTemplatePayloadSchema = z.object({
  name: z.string().min(3),
  city: z.string().min(2),
  zone: z.string().min(2),
  ridersTarget: z.number().int().min(1),
  estimatedDistanceKm: z.number().min(0.1),
  status: templateStatusSchema.optional(),
  notes: z.string().optional(),
});

const duplicateRouteTemplateSchema = z.object({
  templateId: z.string(),
  name: z.string().min(1).optional(),
});

const assignRouteToRidersSchema = z.object({
  routeId: z.string(),
  riderIds: z.array(z.string()).min(1),
});

const routeStopSchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  order: z.number().int().min(0),
  notes: z.string().optional(),
});

const createRouteStopsSchema = z.object({
  routeId: z.string(),
  stops: z.array(routeStopSchema).min(1),
});

const upsertRouteStopSchema = routeStopSchema.extend({
  id: z.string().optional(),
  routeId: z.string(),
});

const deleteRouteStopSchema = z.object({
  stopId: z.string(),
});

const unassignRouteSchema = z.object({
  riderRouteId: z.string(),
});

const normalizeDifficulty = (value?: string) => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (["easy", "medium", "hard"].includes(normalized)) {
    return normalized;
  }
  return undefined;
};

const toLocationLabel = (lat?: number | null, lng?: number | null) => {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return "Unknown";
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

const toWaypoints = (
  startLat?: number | null,
  startLng?: number | null,
  endLat?: number | null,
  endLng?: number | null,
) => {
  const waypoints = [] as RiderRoute["waypoints"];
  if (typeof startLat === "number" && typeof startLng === "number") {
    waypoints.push({ order: 0, lat: startLat, lng: startLng, name: "Start" });
  }
  if (typeof endLat === "number" && typeof endLng === "number") {
    waypoints.push({
      order: waypoints.length,
      lat: endLat,
      lng: endLng,
      name: "End",
    });
  }
  return waypoints;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) => {
  const R = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const extractGpsPoints = (path?: any[]) => {
  if (!Array.isArray(path)) return [];
  return path
    .map((point) => {
      const lat =
        point?.lat ??
        point?.latitude ??
        point?.coords?.latitude ??
        point?.location?.lat;
      const lng =
        point?.lng ??
        point?.longitude ??
        point?.coords?.longitude ??
        point?.location?.lng;
      const timestamp =
        point?.timestamp ??
        point?.recorded_at ??
        point?.recordedAt ??
        point?.time;

      if (typeof lat !== "number" || typeof lng !== "number") return null;

      return {
        lat,
        lng,
        timestamp: timestamp ? new Date(timestamp).toISOString() : undefined,
      };
    })
    .filter(Boolean) as Array<{ lat: number; lng: number; timestamp?: string }>;
};

const calculateDistanceKm = (points: Array<{ lat: number; lng: number }>) => {
  if (points.length < 2) return 0;
  let distance = 0;
  for (let i = 1; i < points.length; i += 1) {
    distance += haversineKm(points[i - 1], points[i]);
  }
  return distance;
};

const calculateDurationMinutes = (
  points: Array<{ timestamp?: string }>,
  fallbackStart?: string | null,
  fallbackEnd?: string | null,
) => {
  const timestamps = points
    .map((point) =>
      point.timestamp ? new Date(point.timestamp).getTime() : null,
    )
    .filter((value): value is number => typeof value === "number");

  if (timestamps.length >= 2) {
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    return Math.max(0, (max - min) / 60000);
  }

  if (fallbackStart && fallbackEnd) {
    const start = new Date(fallbackStart).getTime();
    const end = new Date(fallbackEnd).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      return Math.max(0, (end - start) / 60000);
    }
  }

  return 0;
};

const computeCompliance = (params: {
  expectedDistanceKm: number;
  actualDistanceKm: number;
  estimatedDurationMinutes?: number | null;
  actualDurationMinutes: number;
  averageSpeed?: number | null;
  maxSpeed?: number | null;
  storedCompliance?: number | null;
}) => {
  const expectedDistance = params.expectedDistanceKm || 0;
  const actualDistance = params.actualDistanceKm || 0;
  const estimatedDuration = params.estimatedDurationMinutes ?? 0;
  const actualDuration = params.actualDurationMinutes || 0;

  const computedCoverage =
    expectedDistance > 0
      ? Math.min(100, Math.round((actualDistance / expectedDistance) * 100))
      : 0;

  const waypointCoverage =
    params.storedCompliance && params.storedCompliance > 0
      ? Math.round(params.storedCompliance)
      : computedCoverage;

  const timeCompliance =
    estimatedDuration > 0 && actualDuration > 0
      ? actualDuration <= estimatedDuration
        ? 100
        : Math.max(0, Math.round((estimatedDuration / actualDuration) * 100))
      : 100;

  const expectedSpeed =
    estimatedDuration > 0 ? expectedDistance / (estimatedDuration / 60) : 0;
  const actualSpeed =
    params.averageSpeed && params.averageSpeed > 0
      ? params.averageSpeed
      : actualDuration > 0
        ? actualDistance / (actualDuration / 60)
        : 0;

  const speedCompliance =
    expectedSpeed > 0 && actualSpeed > 0
      ? Math.max(
          0,
          Math.round(
            100 - (Math.abs(actualSpeed - expectedSpeed) / expectedSpeed) * 100,
          ),
        )
      : 100;

  const routeDeviation = Math.max(0, 100 - waypointCoverage);
  const overallScore = Math.round(
    (waypointCoverage + timeCompliance + speedCompliance) / 3,
  );

  return {
    waypointCoverage,
    routeDeviation,
    timeCompliance,
    speedCompliance,
    overallScore,
    expectedDistanceKm: expectedDistance,
    actualDistanceKm: actualDistance,
    actualDurationMinutes: actualDuration,
    averageSpeed: actualSpeed,
    maxSpeed: params.maxSpeed ?? null,
  };
};

const toPerformanceBucket = (progress?: number | null) => {
  const value = Number(progress ?? 0);
  if (value >= 80) return "high";
  if (value >= 50) return "medium";
  return "low";
};

type TemplateStatus = z.infer<typeof templateStatusSchema>;

const toTemplateStatus = (status?: string | null): TemplateStatus => {
  switch (status) {
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "pending":
    default:
      return "draft";
  }
};

const toRouteStatus = (status?: TemplateStatus) => {
  switch (status) {
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "draft":
    default:
      return "pending";
  }
};

/**
 * Server action to fetch routes for the dashboard.
 */
export async function getRoutes(): Promise<{
  success: boolean;
  data?: RiderRoute[];
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: riderRoutes, error } = await supabaseAdmin
      .from("rider_route")
      .select(
        "id, rider_id, route_id, campaign_id, status, progress, impressions, assigned_at, completed_at, started_at, updated_at, route:route_id (id, name, description, start_lat, start_lng, end_lat, end_lng, difficulty, estimated_duration_minutes, coverage_km, city, country, tolerance, status, campaign_id, created_at)",
      )
      .order("assigned_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const mapped = (riderRoutes ?? []).map((row) => {
      const route = Array.isArray(row.route) ? row.route[0] : row.route || {};
      const startLat = route.start_lat ?? null;
      const startLng = route.start_lng ?? null;
      const endLat = route.end_lat ?? null;
      const endLng = route.end_lng ?? null;
      const startedAt = row.started_at ?? null;
      const completedAt = row.completed_at ?? null;

      let completionTime: number | undefined = undefined;
      if (startedAt && completedAt) {
        const diff =
          (new Date(completedAt).getTime() - new Date(startedAt).getTime()) /
          (1000 * 60);
        completionTime = Math.max(0, Math.round(diff));
      }

      return {
        id: row.id,
        routeId: row.route_id ?? undefined,
        name: route.name ?? "Route",
        description: route.description ?? undefined,
        brand: undefined,
        startLocation: toLocationLabel(startLat, startLng),
        endLocation: toLocationLabel(endLat, endLng),
        campaignId: [row.campaign_id ?? route.campaign_id].filter(Boolean),
        campaignIdPrimary: row.campaign_id ?? route.campaign_id ?? undefined,
        startLat: startLat ?? undefined,
        startLng: startLng ?? undefined,
        endLat: endLat ?? undefined,
        endLng: endLng ?? undefined,
        waypoints: toWaypoints(startLat, startLng, endLat, endLng),
        performance: toPerformanceBucket(row.progress),
        difficulty:
          typeof route.difficulty === "string"
            ? route.difficulty.charAt(0).toUpperCase() +
              route.difficulty.slice(1)
            : "Medium",
        templateStatus: route.status ?? undefined,
        assignedDate:
          row.assigned_at ?? route.created_at ?? new Date().toISOString(),
        assignedRiderId: row.rider_id ? [row.rider_id] : [],
        status: row.status,
        estimatedDuration: route.estimated_duration_minutes
          ? `${route.estimated_duration_minutes} minutes`
          : "",
        estimatedDurationMinutes: route.estimated_duration_minutes ?? undefined,
        coverage: row.progress ?? undefined,
        coverageKm: route.coverage_km ?? undefined,
        zone: route.city ?? "",
        city: route.city ?? "",
        country: route.country ?? undefined,
        tolerance: route.tolerance ?? undefined,
        startedAt: row.started_at ?? undefined,
        completedAt: row.completed_at ?? undefined,
        cancelledAt:
          row.status === "cancelled"
            ? (row.updated_at ?? undefined)
            : undefined,
        cancellationReason: undefined,
        completionTime,
      } as RiderRoute;
    });

    return { success: true, data: mapped };
  } catch (error) {
    console.error("Get routes error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch routes",
    };
  }
}

/**
 * Server action to fetch route templates.
 */
export async function getRouteTemplates(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    name: string;
    city: string;
    zone: string;
    ridersTarget: number;
    estimatedDistanceKm: number;
    lastSent: string;
    status: TemplateStatus;
    notes?: string;
  }>;
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: routes, error } = await supabaseAdmin
      .from("route")
      .select("id, name, city, status, coverage_km, description, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const routeIds = (routes ?? []).map((route) => route.id);
    const { data: assignments, error: assignmentsError } = routeIds.length
      ? await supabaseAdmin
          .from("rider_route")
          .select("route_id, assigned_at")
          .in("route_id", routeIds)
      : { data: [], error: null };

    if (assignmentsError) {
      return { success: false, error: assignmentsError.message };
    }

    const assignmentStats = new Map<
      string,
      { count: number; lastSent: string | null }
    >();

    (assignments ?? []).forEach((assignment) => {
      const current = assignmentStats.get(assignment.route_id) ?? {
        count: 0,
        lastSent: null,
      };
      const assignedAt = assignment.assigned_at
        ? new Date(assignment.assigned_at).toISOString()
        : null;
      const lastSent =
        assignedAt && (!current.lastSent || assignedAt > current.lastSent)
          ? assignedAt
          : current.lastSent;
      assignmentStats.set(assignment.route_id, {
        count: current.count + 1,
        lastSent,
      });
    });

    const mapped = (routes ?? []).map((route) => {
      const stats = assignmentStats.get(route.id) ?? {
        count: 0,
        lastSent: null,
      };

      return {
        id: route.id,
        name: route.name,
        city: route.city ?? "Unknown",
        zone: route.city ?? "Unknown",
        ridersTarget: stats.count,
        estimatedDistanceKm: route.coverage_km ?? 0,
        lastSent: stats.lastSent ?? "Not sent yet",
        status: toTemplateStatus(route.status),
        notes: route.description ?? undefined,
      };
    });

    return { success: true, data: mapped };
  } catch (error) {
    console.error("Get route templates error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch route templates",
    };
  }
}

/**
 * Create a new route template based on an existing route in the same city.
 */
export async function createRouteTemplate(
  data: z.infer<typeof routeTemplatePayloadSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = routeTemplatePayloadSchema.parse(data);

    const { data: seedRoute, error: seedError } = await supabaseAdmin
      .from("route")
      .select(
        "start_lat, start_lng, end_lat, end_lng, country, difficulty, estimated_duration_minutes, tolerance",
      )
      .eq("city", validatedData.city)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seedError) {
      return { success: false, error: seedError.message };
    }

    if (!seedRoute) {
      return {
        success: false,
        error:
          "No base route found for this city. Create a route with coordinates first.",
      };
    }

    const { error } = await supabaseAdmin.from("route").insert({
      name: validatedData.name,
      description: validatedData.notes ?? null,
      campaign_id: null,
      start_lat: seedRoute.start_lat,
      start_lng: seedRoute.start_lng,
      end_lat: seedRoute.end_lat,
      end_lng: seedRoute.end_lng,
      estimated_duration_minutes: seedRoute.estimated_duration_minutes ?? null,
      coverage_km: validatedData.estimatedDistanceKm,
      city: validatedData.city,
      country: seedRoute.country ?? null,
      difficulty: seedRoute.difficulty ?? "easy",
      status: toRouteStatus(validatedData.status),
      tolerance: seedRoute.tolerance ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create route template",
    };
  }
}

/**
 * Duplicate an existing route template.
 */
export async function duplicateRouteTemplate(
  data: z.infer<typeof duplicateRouteTemplateSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = duplicateRouteTemplateSchema.parse(data);

    const { data: templateRoute, error: templateError } = await supabaseAdmin
      .from("route")
      .select(
        "name, description, campaign_id, start_lat, start_lng, end_lat, end_lng, estimated_duration_minutes, coverage_km, city, country, difficulty, tolerance",
      )
      .eq("id", validatedData.templateId)
      .single();

    if (templateError) {
      return { success: false, error: templateError.message };
    }

    const { error } = await supabaseAdmin.from("route").insert({
      name: validatedData.name ?? `${templateRoute.name} (Copy)`,
      description: templateRoute.description ?? null,
      campaign_id: templateRoute.campaign_id ?? null,
      start_lat: templateRoute.start_lat,
      start_lng: templateRoute.start_lng,
      end_lat: templateRoute.end_lat,
      end_lng: templateRoute.end_lng,
      estimated_duration_minutes:
        templateRoute.estimated_duration_minutes ?? null,
      coverage_km: templateRoute.coverage_km ?? null,
      city: templateRoute.city ?? null,
      country: templateRoute.country ?? null,
      difficulty: templateRoute.difficulty ?? "easy",
      status: toRouteStatus("draft"),
      tolerance: templateRoute.tolerance ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to duplicate route template",
    };
  }
}

/**
 * Assign a route to one or more riders.
 */
export async function assignRouteToRiders(
  data: z.infer<typeof assignRouteToRidersSchema>,
): Promise<{
  success: boolean;
  assignedCount?: number;
  skippedCount?: number;
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = assignRouteToRidersSchema.parse(data);

    const { data: route, error: routeError } = await supabaseAdmin
      .from("route")
      .select("id, campaign_id")
      .eq("id", validatedData.routeId)
      .single();

    if (routeError) {
      return { success: false, error: routeError.message };
    }

    const { data: existingAssignments, error: existingError } =
      await supabaseAdmin
        .from("rider_route")
        .select("rider_id")
        .eq("route_id", validatedData.routeId)
        .in("rider_id", validatedData.riderIds);

    if (existingError) {
      return { success: false, error: existingError.message };
    }

    const existingRiderIds = new Set(
      (existingAssignments ?? [])
        .map((assignment) => assignment.rider_id)
        .filter(Boolean),
    );

    const riderIdsToAssign = validatedData.riderIds.filter(
      (riderId) => !existingRiderIds.has(riderId),
    );

    if (riderIdsToAssign.length === 0) {
      return {
        success: true,
        assignedCount: 0,
        skippedCount: validatedData.riderIds.length,
      };
    }

    const now = new Date().toISOString();
    const payload = riderIdsToAssign.map((riderId) => ({
      rider_id: riderId,
      route_id: route.id,
      campaign_id: route.campaign_id ?? null,
      status: "assigned",
      assigned_at: now,
      updated_at: now,
    }));

    const { error } = await supabaseAdmin.from("rider_route").insert(payload);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return {
      success: true,
      assignedCount: riderIdsToAssign.length,
      skippedCount: validatedData.riderIds.length - riderIdsToAssign.length,
    };
  } catch (error) {
    console.error("Assign route to riders error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to assign route to riders",
    };
  }
}

/**
 * Create a new route template.
 */
export async function createRoute(
  data: z.infer<typeof routePayloadSchema>,
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = routePayloadSchema.parse(data);

    if (
      validatedData.startLat === undefined ||
      validatedData.startLng === undefined ||
      validatedData.endLat === undefined ||
      validatedData.endLng === undefined
    ) {
      return {
        success: false,
        error: "Start/end coordinates are required",
      };
    }

    const { data: created, error } = await supabaseAdmin
      .from("route")
      .insert({
        name: validatedData.name ?? "New Route",
        description: validatedData.description ?? null,
        campaign_id: validatedData.campaignId ?? null,
        start_lat: validatedData.startLat,
        start_lng: validatedData.startLng,
        end_lat: validatedData.endLat,
        end_lng: validatedData.endLng,
        estimated_duration_minutes:
          validatedData.estimatedDurationMinutes ?? null,
        coverage_km: validatedData.coverageKm ?? null,
        city: validatedData.city ?? null,
        country: validatedData.country ?? null,
        difficulty: normalizeDifficulty(validatedData.difficulty) ?? "easy",
        status: validatedData.status ?? "pending",
        tolerance: validatedData.tolerance ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true, data: created };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create route",
    };
  }
}

/**
 * Create strategic stops for a route.
 */
export async function createRouteStops(
  data: z.infer<typeof createRouteStopsSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = createRouteStopsSchema.parse(data);

    const payload = validatedData.stops.map((stop) => ({
      route_id: validatedData.routeId,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      stop_order: stop.order,
      notes: stop.notes ?? null,
      created_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin.from("route_stop").insert(payload);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    console.error("Create route stops error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create route stops",
    };
  }
}

/**
 * Fetch strategic stops for a route.
 */
export async function getRouteStops(routeId: string): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    routeId: string;
    name: string;
    lat: number;
    lng: number;
    order: number;
    notes?: string | null;
  }>;
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin
      .from("route_stop")
      .select("id, route_id, name, lat, lng, stop_order, notes")
      .eq("route_id", routeId)
      .order("stop_order", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    const mapped = (data ?? []).map((stop) => ({
      id: stop.id,
      routeId: stop.route_id,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      order: stop.stop_order ?? 0,
      notes: stop.notes ?? undefined,
    }));

    return { success: true, data: mapped };
  } catch (error) {
    console.error("Get route stops error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch route stops",
    };
  }
}

/**
 * Create or update a strategic stop.
 */
export async function upsertRouteStop(
  data: z.infer<typeof upsertRouteStopSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = upsertRouteStopSchema.parse(data);

    if (validatedData.id) {
      const { error } = await supabaseAdmin
        .from("route_stop")
        .update({
          name: validatedData.name,
          lat: validatedData.lat,
          lng: validatedData.lng,
          stop_order: validatedData.order,
          notes: validatedData.notes ?? null,
        })
        .eq("id", validatedData.id);

      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      const { error } = await supabaseAdmin.from("route_stop").insert({
        route_id: validatedData.routeId,
        name: validatedData.name,
        lat: validatedData.lat,
        lng: validatedData.lng,
        stop_order: validatedData.order,
        notes: validatedData.notes ?? null,
        created_at: new Date().toISOString(),
      });

      if (error) {
        return { success: false, error: error.message };
      }
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    console.error("Upsert route stop error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to upsert route stop",
    };
  }
}

/**
 * Delete a strategic stop.
 */
export async function deleteRouteStop(
  data: z.infer<typeof deleteRouteStopSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = deleteRouteStopSchema.parse(data);

    const { error } = await supabaseAdmin
      .from("route_stop")
      .delete()
      .eq("id", validatedData.stopId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    console.error("Delete route stop error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete route stop",
    };
  }
}

/**
 * Unassign a rider route assignment.
 */
export async function unassignRouteAssignment(
  data: z.infer<typeof unassignRouteSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = unassignRouteSchema.parse(data);

    const { error } = await supabaseAdmin
      .from("rider_route")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", validatedData.riderRouteId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    console.error("Unassign route error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to unassign route",
    };
  }
}

/**
 * Update a route template.
 */
export async function updateRoute(
  data: z.infer<typeof routePayloadSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = routePayloadSchema.parse(data);

    if (!validatedData.id) {
      return { success: false, error: "Route id is required" };
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined)
      updateData.description = validatedData.description;
    if (validatedData.campaignId !== undefined)
      updateData.campaign_id = validatedData.campaignId;
    if (validatedData.startLat !== undefined)
      updateData.start_lat = validatedData.startLat;
    if (validatedData.startLng !== undefined)
      updateData.start_lng = validatedData.startLng;
    if (validatedData.endLat !== undefined)
      updateData.end_lat = validatedData.endLat;
    if (validatedData.endLng !== undefined)
      updateData.end_lng = validatedData.endLng;
    if (validatedData.estimatedDurationMinutes !== undefined)
      updateData.estimated_duration_minutes =
        validatedData.estimatedDurationMinutes;
    if (validatedData.coverageKm !== undefined)
      updateData.coverage_km = validatedData.coverageKm;
    if (validatedData.city !== undefined) updateData.city = validatedData.city;
    if (validatedData.country !== undefined)
      updateData.country = validatedData.country;
    if (validatedData.difficulty !== undefined)
      updateData.difficulty = normalizeDifficulty(validatedData.difficulty);
    if (validatedData.status !== undefined)
      updateData.status = validatedData.status;
    if (validatedData.tolerance !== undefined)
      updateData.tolerance = validatedData.tolerance;

    const { error } = await supabaseAdmin
      .from("route")
      .update(updateData)
      .eq("id", validatedData.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update route",
    };
  }
}

/**
 * Server action to approve a route
 */
export async function approveRoute(
  routeId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { error } = await supabaseAdmin
      .from("rider_route")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", routeId);

    if (error) {
      console.error("Error approving route:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    console.error("Error approving route:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to approve route",
    };
  }
}

/**
 * Server action to reject a route
 */
export async function rejectRoute(
  routeId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { error } = await supabaseAdmin
      .from("rider_route")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", routeId);

    if (error) {
      console.error("Error rejecting route:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    console.error("Error rejecting route:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reject route",
    };
  }
}

/**
 * Server action to update route status
 */
export async function updateRouteStatus(
  data: z.infer<typeof updateRouteStatusSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = updateRouteStatusSchema.parse(data);

    const updateData: Record<string, any> = {
      status: validatedData.status,
      updated_at: new Date().toISOString(),
    };

    if (validatedData.status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    if (validatedData.status === "in-progress" && !updateData.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from("rider_route")
      .update(updateData)
      .eq("id", validatedData.routeId);

    if (error) {
      console.error("Error updating route status:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    console.error("Error updating route status:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update route status",
    };
  }
}

/**
 * Server action to delete a route and related records.
 */
export async function deleteRoute(
  data: z.infer<typeof deleteRouteSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = deleteRouteSchema.parse(data);

    const { data: trackingRows } = await supabaseAdmin
      .from("route_tracking")
      .select("id")
      .eq("route_id", validatedData.routeId);

    const trackingIds = (trackingRows ?? []).map((row) => row.id);

    if (trackingIds.length) {
      await supabaseAdmin
        .from("impression_events")
        .delete()
        .in("route_tracking_id", trackingIds);
      await supabaseAdmin
        .from("reward_transactions")
        .delete()
        .in("route_tracking_id", trackingIds);
    }

    await supabaseAdmin
      .from("route_stop")
      .delete()
      .eq("route_id", validatedData.routeId);
    await supabaseAdmin
      .from("rider_route")
      .delete()
      .eq("route_id", validatedData.routeId);
    await supabaseAdmin
      .from("route_tracking")
      .delete()
      .eq("route_id", validatedData.routeId);
    await supabaseAdmin.from("route").delete().eq("id", validatedData.routeId);

    revalidatePath("/routes");
    return { success: true };
  } catch (error) {
    console.error("Delete route error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete route",
    };
  }
}

/**
 * Server action to recalculate route compliance
 */
export async function recalculateRouteCompliance(
  data: z.infer<typeof recalculateComplianceSchema>,
): Promise<{ success: boolean; compliance?: number; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = recalculateComplianceSchema.parse(data);

    const { data: routeRow, error: routeError } = await supabaseAdmin
      .from("rider_route")
      .select("route_id, progress")
      .eq("id", validatedData.routeId)
      .single();

    if (routeError) {
      return { success: false, error: routeError.message };
    }

    const { data: routeData } = await supabaseAdmin
      .from("route")
      .select(
        "coverage_km, estimated_duration_minutes, start_lat, start_lng, end_lat, end_lng",
      )
      .eq("id", routeRow.route_id)
      .maybeSingle();

    const { data: trackingRow } = await supabaseAdmin
      .from("route_tracking")
      .select(
        "id, path, total_distance, average_speed, max_speed, route_compliance, start_time, end_time",
      )
      .eq("route_id", routeRow.route_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pathPoints = extractGpsPoints(trackingRow?.path ?? []);
    const actualDistanceKm =
      typeof trackingRow?.total_distance === "number" &&
      trackingRow.total_distance > 0
        ? Number(trackingRow.total_distance)
        : calculateDistanceKm(pathPoints);

    const expectedDistanceKm =
      typeof routeData?.coverage_km === "number" && routeData.coverage_km > 0
        ? Number(routeData.coverage_km)
        : routeData?.start_lat &&
            routeData?.start_lng &&
            routeData?.end_lat &&
            routeData?.end_lng
          ? haversineKm(
              { lat: routeData.start_lat, lng: routeData.start_lng },
              { lat: routeData.end_lat, lng: routeData.end_lng },
            )
          : 0;

    const actualDurationMinutes = calculateDurationMinutes(
      pathPoints,
      trackingRow?.start_time ?? null,
      trackingRow?.end_time ?? null,
    );

    const metrics = computeCompliance({
      expectedDistanceKm,
      actualDistanceKm,
      estimatedDurationMinutes: routeData?.estimated_duration_minutes ?? null,
      actualDurationMinutes,
      averageSpeed: trackingRow?.average_speed ?? null,
      maxSpeed: trackingRow?.max_speed ?? null,
      storedCompliance: trackingRow?.route_compliance ?? null,
    });

    const { error: updateError } = await supabaseAdmin
      .from("rider_route")
      .update({
        progress: metrics.overallScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", validatedData.routeId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    if (trackingRow?.id) {
      await supabaseAdmin
        .from("route_tracking")
        .update({ route_compliance: metrics.overallScore })
        .eq("id", trackingRow.id);
    }

    revalidatePath("/routes");
    return { success: true, compliance: metrics.overallScore };
  } catch (error) {
    console.error("Error recalculating compliance:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to recalculate compliance",
    };
  }
}

/**
 * Server action to get route GPS tracking data
 */
export async function getRouteGPSTracking(
  routeId: string,
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch GPS tracking data from route_tracking path
    const { data, error } = await supabaseAdmin
      .from("route_tracking")
      .select("path, created_at, updated_at")
      .eq("route_id", routeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching GPS tracking:", error);
      return { success: false, error: error.message };
    }

    const points = (data?.path as any[]) ?? [];
    return { success: true, data: points };
  } catch (error) {
    console.error("Error fetching GPS tracking:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch GPS tracking",
    };
  }
}

/**
 * Server action to get route compliance breakdown
 */
export async function getRouteComplianceBreakdown(
  routeId: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: riderRoute, error } = await supabaseAdmin
      .from("rider_route")
      .select("route_id, progress")
      .eq("id", routeId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const { data: routeData } = await supabaseAdmin
      .from("route")
      .select(
        "coverage_km, estimated_duration_minutes, start_lat, start_lng, end_lat, end_lng",
      )
      .eq("id", riderRoute.route_id)
      .maybeSingle();

    const { data: trackingRow } = await supabaseAdmin
      .from("route_tracking")
      .select(
        "path, total_distance, average_speed, max_speed, route_compliance, start_time, end_time",
      )
      .eq("route_id", riderRoute.route_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pathPoints = extractGpsPoints(trackingRow?.path ?? []);
    const actualDistanceKm =
      typeof trackingRow?.total_distance === "number" &&
      trackingRow.total_distance > 0
        ? Number(trackingRow.total_distance)
        : calculateDistanceKm(pathPoints);

    const expectedDistanceKm =
      typeof routeData?.coverage_km === "number" && routeData.coverage_km > 0
        ? Number(routeData.coverage_km)
        : routeData?.start_lat &&
            routeData?.start_lng &&
            routeData?.end_lat &&
            routeData?.end_lng
          ? haversineKm(
              { lat: routeData.start_lat, lng: routeData.start_lng },
              { lat: routeData.end_lat, lng: routeData.end_lng },
            )
          : 0;

    const actualDurationMinutes = calculateDurationMinutes(
      pathPoints,
      trackingRow?.start_time ?? null,
      trackingRow?.end_time ?? null,
    );

    const breakdown = computeCompliance({
      expectedDistanceKm,
      actualDistanceKm,
      estimatedDurationMinutes: routeData?.estimated_duration_minutes ?? null,
      actualDurationMinutes,
      averageSpeed: trackingRow?.average_speed ?? null,
      maxSpeed: trackingRow?.max_speed ?? null,
      storedCompliance:
        trackingRow?.route_compliance ?? riderRoute.progress ?? null,
    });

    return { success: true, data: breakdown };
  } catch (error) {
    console.error("Error fetching compliance breakdown:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch compliance breakdown",
    };
  }
}

/**
 * Server action to get route points awarded
 */
export async function getRoutePointsAwarded(
  routeId: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: trackingRows } = await supabaseAdmin
      .from("route_tracking")
      .select("id")
      .eq("route_id", routeId);

    const trackingIds = (trackingRows ?? []).map((row) => row.id);

    const { data, error } = trackingIds.length
      ? await supabaseAdmin
          .from("reward_transactions")
          .select("*")
          .in("route_tracking_id", trackingIds)
      : { data: [], error: null };

    if (error) {
      console.error("Error fetching route points:", error);
      return { success: false, error: error.message };
    }

    const totalPoints =
      data?.reduce((sum, transaction) => sum + (transaction.points || 0), 0) ||
      0;

    return {
      success: true,
      data: {
        totalPoints,
        transactions: data || [],
      },
    };
  } catch (error) {
    console.error("Error fetching route points:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch route points",
    };
  }
}

/**
 * Server action to get route timeline
 */
export async function getRouteTimeline(
  routeId: string,
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: routeData, error: routeError } = await supabaseAdmin
      .from("rider_route")
      .select("assigned_at, started_at, completed_at, updated_at, status")
      .eq("id", routeId)
      .single();

    if (routeError) {
      return { success: false, error: routeError.message };
    }

    const { data: trackingRow } = await supabaseAdmin
      .from("route_tracking")
      .select("start_time, end_time, created_at, updated_at")
      .eq("route_id", routeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build timeline from route data
    const timeline = [];
    if (routeData?.assigned_at) {
      timeline.push({
        type: "assigned",
        timestamp: routeData.assigned_at,
        description: "Route assigned to rider",
      });
    }
    if (routeData?.started_at) {
      timeline.push({
        type: "started",
        timestamp: routeData.started_at,
        description: "Route started",
      });
    }
    if (trackingRow?.start_time) {
      timeline.push({
        type: "tracking_started",
        timestamp: trackingRow.start_time,
        description: "GPS tracking started",
      });
    }
    if (routeData?.completed_at) {
      timeline.push({
        type: "completed",
        timestamp: routeData.completed_at,
        description: "Route completed",
      });
    }
    if (trackingRow?.end_time) {
      timeline.push({
        type: "tracking_completed",
        timestamp: trackingRow.end_time,
        description: "GPS tracking completed",
      });
    }
    if (routeData?.status === "cancelled" && routeData?.updated_at) {
      timeline.push({
        type: "cancelled",
        timestamp: routeData.updated_at,
        description: "Route cancelled",
      });
    }

    return {
      success: true,
      data: timeline.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    };
  } catch (error) {
    console.error("Error fetching route timeline:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch route timeline",
    };
  }
}

/**
 * Server action to export route data
 */
export async function exportRouteData(
  data: z.infer<typeof exportRouteDataSchema>,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = exportRouteDataSchema.parse(data);

    // Fetch route data
    const { data: routeData, error: routeError } = await supabaseAdmin
      .from("rider_route")
      .select("*")
      .eq("id", validatedData.routeId)
      .single();

    if (routeError) {
      return { success: false, error: routeError.message };
    }

    // Fetch related data
    const [gpsData, complianceData, pointsData, timelineData] =
      await Promise.all([
        getRouteGPSTracking(validatedData.routeId),
        getRouteComplianceBreakdown(validatedData.routeId),
        getRoutePointsAwarded(validatedData.routeId),
        getRouteTimeline(validatedData.routeId),
      ]);

    const exportData = {
      route: routeData,
      gpsTracking: gpsData.data || [],
      compliance: complianceData.data || {},
      points: pointsData.data || {},
      timeline: timelineData.data || [],
      exportedAt: new Date().toISOString(),
    };

    return { success: true, data: exportData };
  } catch (error) {
    console.error("Error exporting route data:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to export route data",
    };
  }
}

/**
 * Server action to get route details
 */
export async function getRouteDetails(
  routeId: string,
): Promise<{ success: boolean; data?: RiderRoute; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data, error } = await supabaseAdmin
      .from("rider_route")
      .select("*")
      .eq("id", routeId)
      .single();

    if (error) {
      console.error("Error fetching route details:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as RiderRoute };
  } catch (error) {
    console.error("Error fetching route details:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch route details",
    };
  }
}
