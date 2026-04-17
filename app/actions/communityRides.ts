"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { shouldUseMockData } from "@/lib/dataSource";
import { writeUserActivity } from "@/lib/userActivity";
import { mockCommunityRides } from "@/data/mockCommunityRides";
import {
  CommunityRide,
  CommunityRideFiltersSchema,
  CreateCommunityRideFormData,
  UpdateCommunityRideFormData,
  createCommunityRideSchema,
} from "@/schemas";

// Flat selects — no FK-hint joins to avoid PGRST200 schema-cache misses.
// Rider names are resolved in a second batched query.
const RIDE_SELECT = `
  id,
  created_by_user_id,
  organizer_type,
  organizer_user_id,
  organizer_rider_id,
  organizer_name,
  title,
  description,
  scheduled_at,
  meeting_point_name,
  meeting_point_lat,
  meeting_point_lng,
  route_id,
  max_participants,
  distance_km,
  bike_types_allowed,
  category,
  status,
  is_public,
  created_at,
  updated_at
`;

const PARTICIPANT_SELECT = `
  id, community_ride_id, rider_id, status, joined_at
`;

type RiderNameMap = Record<string, string>; // riderId -> full name

type ActivityUserRefs = {
  userId?: string;
  actorUserId?: string | null;
};

/** Batch-fetch display names for a set of rider IDs. */
async function fetchRiderNames(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  riderIds: string[],
): Promise<RiderNameMap> {
  if (riderIds.length === 0) return {};

  const { data } = await supabase
    .from("rider")
    .select("id, user:user(first_name, last_name)")
    .in("id", riderIds);

  const map: RiderNameMap = {};
  for (const row of data ?? []) {
    const u = (
      row as {
        user?: { first_name?: string | null; last_name?: string | null } | null;
      }
    ).user;
    const name = u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : "";
    map[row.id as string] = name || (row.id as string);
  }
  return map;
}

async function resolveActivityUserRefs(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    targetUserIds?: Array<string | null | undefined>;
    actorUserIds?: Array<string | null | undefined>;
  },
): Promise<ActivityUserRefs> {
  const candidates = Array.from(
    new Set(
      [...(input.targetUserIds ?? []), ...(input.actorUserIds ?? [])].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );

  if (candidates.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("user")
    .select("id")
    .in("id", candidates);

  if (error) {
    console.warn("Failed to resolve activity user refs:", error.message);
    return {};
  }

  const existingIds = new Set((data ?? []).map((row) => row.id as string));

  return {
    userId: (input.targetUserIds ?? []).find(
      (value): value is string =>
        typeof value === "string" && existingIds.has(value),
    ),
    actorUserId:
      (input.actorUserIds ?? []).find(
        (value): value is string =>
          typeof value === "string" && existingIds.has(value),
      ) ?? null,
  };
}

function buildRide(
  row: Record<string, unknown>,
  nameMap: RiderNameMap,
  participants: Array<{
    id: string;
    rider_id: string;
    status: string;
    joined_at: string;
  }>,
): CommunityRide {
  const orgId =
    row.organizer_rider_id != null ? String(row.organizer_rider_id) : undefined;
  const activeParticipants = participants.filter((p) => p.status === "joined");

  return {
    id: String(row.id ?? ""),
    organizerType:
      (row.organizer_type as CommunityRide["organizerType"]) ?? "movrr",
    organizerUserId: row.organizer_user_id
      ? String(row.organizer_user_id)
      : undefined,
    organizerRiderId: orgId,
    organizerName:
      row.organizer_name && String(row.organizer_name).trim().length > 0
        ? String(row.organizer_name)
        : orgId
          ? (nameMap[orgId] ?? orgId)
          : "MOVRR",
    title: String(row.title ?? ""),
    description: row.description ? String(row.description) : undefined,
    scheduledAt: String(row.scheduled_at ?? ""),
    meetingPointName: row.meeting_point_name
      ? String(row.meeting_point_name)
      : undefined,
    meetingPointLat:
      row.meeting_point_lat != null ? Number(row.meeting_point_lat) : undefined,
    meetingPointLng:
      row.meeting_point_lng != null ? Number(row.meeting_point_lng) : undefined,
    routeId: row.route_id ? String(row.route_id) : undefined,
    maxParticipants: Number(row.max_participants ?? 0),
    participantCount: activeParticipants.length,
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    bikeTypesAllowed: Array.isArray(row.bike_types_allowed)
      ? (row.bike_types_allowed as string[])
      : undefined,
    category: (row.category as CommunityRide["category"]) ?? "social",
    status: (row.status as CommunityRide["status"]) ?? "upcoming",
    isPublic: Boolean(row.is_public),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    participants: participants.map((p) => ({
      id: p.id,
      riderId: p.rider_id,
      riderName: nameMap[p.rider_id] ?? p.rider_id,
      status: (p.status ?? "joined") as "joined" | "left" | "removed",
      joinedAt: p.joined_at,
    })),
  };
}

export async function createCommunityRide(
  input: CreateCommunityRideFormData,
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/community-rides");
    return { success: true, data: { id: "mock-id" } };
  }

  const parsed = createCommunityRideSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const {
    title,
    description,
    scheduledAt,
    meetingPointName,
    meetingPointLat,
    meetingPointLng,
    maxParticipants,
    distanceKm,
    bikeTypesAllowed,
    category,
    isPublic,
    organizerType,
    organizerName,
    organizerRiderId,
  } = parsed.data;

  try {
    const supabase = createSupabaseAdminClient();
    let resolvedOrganizerUserId: string | null = auth.authUser.id;
    let resolvedOrganizerRiderId: string | null = null;

    if (organizerType === "rider") {
      if (!organizerRiderId) {
        return {
          success: false,
          error: "A rider organizer requires a rider ID.",
        };
      }

      const { data: riderRow, error: riderError } = await supabase
        .from("rider")
        .select("id, user_id")
        .eq("id", organizerRiderId)
        .maybeSingle();

      if (riderError) throw riderError;

      if (!riderRow?.id || !riderRow.user_id) {
        return {
          success: false,
          error: "Selected organizer rider could not be found.",
        };
      }

      resolvedOrganizerRiderId = riderRow.id as string;
      resolvedOrganizerUserId = riderRow.user_id as string;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("community_ride")
      .insert({
        created_by_user_id: auth.authUser.id,
        organizer_type: organizerType,
        organizer_user_id: resolvedOrganizerUserId,
        organizer_rider_id: resolvedOrganizerRiderId,
        organizer_name: organizerName,
        title,
        description: description ?? null,
        scheduled_at: scheduledAt,
        meeting_point_name: meetingPointName ?? null,
        meeting_point_lat: meetingPointLat ?? null,
        meeting_point_lng: meetingPointLng ?? null,
        max_participants: maxParticipants,
        distance_km: distanceKm ?? null,
        bike_types_allowed: bikeTypesAllowed ?? null,
        category,
        status: "upcoming",
        is_public: isPublic,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error) throw error;

    // For movrr-organized rides the organizer IS the platform, not a specific user.
    // We log the activity against the admin actor only (not a misleading self-target).
    const auditTargetUserId =
      organizerType !== "movrr" ? resolvedOrganizerUserId : null;

    const activityRefs = await resolveActivityUserRefs(supabase, {
      targetUserIds: [auditTargetUserId, auth.authUser.id],
      actorUserIds: [auth.authUser.id],
    });

    const auditAction =
      organizerType === "movrr"
        ? "MOVRR community ride created"
        : "Community ride created";
    const auditDescription =
      organizerType === "movrr"
        ? `Admin created a MOVRR-organised community ride "${title}" scheduled for ${scheduledAt}.`
        : `Admin created community ride "${title}" for organiser "${organizerName}", scheduled for ${scheduledAt}.`;

    if (activityRefs.userId) {
      await writeUserActivity(supabase, {
        user_id: activityRefs.userId,
        actor_user_id: activityRefs.actorUserId,
        source: "web",
        action: auditAction,
        description: auditDescription,
        related_entity_type: "community_ride",
        related_entity_id: (data as { id: string }).id,
        metadata: {
          title,
          category,
          maxParticipants,
          isPublic,
          organizerType,
          organizerName,
          organizerUserId: resolvedOrganizerUserId,
          organizerRiderId: resolvedOrganizerRiderId,
        },
      }).catch((err) =>
        console.warn("Community ride creation audit write failed:", err),
      );
    }

    revalidatePath("/community-rides");
    return { success: true, data: { id: (data as { id: string }).id } };
  } catch (err) {
    console.error("createCommunityRide error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create ride",
    };
  }
}

export async function getCommunityRides(
  filters?: CommunityRideFiltersSchema,
): Promise<{ success: boolean; data?: CommunityRide[]; error?: string }> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    return { success: true, data: [...mockCommunityRides] };
  }

  try {
    const supabase = createSupabaseAdminClient();

    // 1. Fetch rides (flat)
    let query = supabase
      .from("community_ride")
      .select(RIDE_SELECT)
      .order("scheduled_at", { ascending: false });

    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters?.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }
    if (filters?.dateRange?.from) {
      query = query.gte("scheduled_at", filters.dateRange.from.toISOString());
    }
    if (filters?.dateRange?.to) {
      query = query.lte("scheduled_at", filters.dateRange.to.toISOString());
    }

    const { data: ridesData, error: ridesError } = await query;
    if (ridesError) throw ridesError;

    const rows = (ridesData ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return { success: true, data: [] };

    const rideIds = rows.map((r) => String(r.id));

    // 2. Fetch participants for all rides in one query
    const { data: participantsData, error: partError } = await supabase
      .from("community_ride_participant")
      .select(PARTICIPANT_SELECT)
      .in("community_ride_id", rideIds);

    if (partError) throw partError;

    const allParticipants = (participantsData ?? []) as Array<{
      id: string;
      community_ride_id: string;
      rider_id: string;
      status: string;
      joined_at: string;
    }>;

    // 3. Batch-fetch rider names for rider organizers + participants
    const allRiderIds = Array.from(
      new Set(
        [
          ...rows.map((r) =>
            r.organizer_rider_id ? String(r.organizer_rider_id) : undefined,
          ),
          ...allParticipants.map((p) => p.rider_id),
        ].filter((value): value is string => Boolean(value)),
      ),
    );
    const nameMap = await fetchRiderNames(supabase, allRiderIds);

    // 4. Build result
    let rides = rows.map((row) => {
      const rideParticipants = allParticipants.filter(
        (p) => p.community_ride_id === String(row.id),
      );
      return buildRide(row, nameMap, rideParticipants);
    });

    if (filters?.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      rides = rides.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.organizerName.toLowerCase().includes(q),
      );
    }

    return { success: true, data: rides };
  } catch (err) {
    console.error("getCommunityRides error:", err);
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to fetch community rides",
    };
  }
}

export async function getCommunityRideById(
  id: string,
): Promise<{ success: boolean; data?: CommunityRide; error?: string }> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    const ride = mockCommunityRides.find((r) => r.id === id);
    if (!ride) return { success: false, error: "Ride not found" };
    return { success: true, data: ride };
  }

  try {
    const supabase = createSupabaseAdminClient();

    const [
      { data: rideData, error: rideError },
      { data: partData, error: partError },
    ] = await Promise.all([
      supabase.from("community_ride").select(RIDE_SELECT).eq("id", id).single(),
      supabase
        .from("community_ride_participant")
        .select(PARTICIPANT_SELECT)
        .eq("community_ride_id", id),
    ]);

    if (rideError) throw rideError;
    if (partError) throw partError;

    const row = rideData as Record<string, unknown>;
    const participants = (partData ?? []) as Array<{
      id: string;
      community_ride_id: string;
      rider_id: string;
      status: string;
      joined_at: string;
    }>;

    const allRiderIds = Array.from(
      new Set(
        [
          row.organizer_rider_id ? String(row.organizer_rider_id) : undefined,
          ...participants.map((p) => p.rider_id),
        ].filter((value): value is string => Boolean(value)),
      ),
    );
    const nameMap = await fetchRiderNames(supabase, allRiderIds);

    return { success: true, data: buildRide(row, nameMap, participants) };
  } catch (err) {
    console.error("getCommunityRideById error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch ride",
    };
  }
}

// Valid status transitions an admin may perform.
const VALID_TRANSITIONS: Record<string, string[]> = {
  upcoming: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function updateCommunityRide(
  input: UpdateCommunityRideFormData,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/community-rides");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();

    // Fetch current state before updating.
    const { data: currentRow } = await supabase
      .from("community_ride")
      .select(
        "status, title, organizer_type, organizer_user_id, organizer_rider_id, organizer_name",
      )
      .eq("id", input.id)
      .maybeSingle();

    const currentStatus =
      (currentRow?.status as string | undefined) ?? "upcoming";

    // Guard: enforce valid status transitions.
    if (input.status !== undefined && input.status !== currentStatus) {
      const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(input.status)) {
        return {
          success: false,
          error: `Cannot transition a ${currentStatus} ride to ${input.status}.`,
        };
      }
    }

    // Server-side guard: cannot reduce maxParticipants below current joined count.
    if (input.maxParticipants !== undefined) {
      const { count: joinedCount, error: countError } = await supabase
        .from("community_ride_participant")
        .select("id", { count: "exact", head: true })
        .eq("community_ride_id", input.id)
        .eq("status", "joined");

      if (countError) throw countError;

      if (input.maxParticipants < (joinedCount ?? 0)) {
        return {
          success: false,
          error: `Cannot set max participants to ${input.maxParticipants} — there are already ${joinedCount} joined riders.`,
        };
      }
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.status !== undefined) updates.status = input.status;
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined)
      updates.description = input.description;
    if (input.maxParticipants !== undefined)
      updates.max_participants = input.maxParticipants;
    if (input.scheduledAt !== undefined)
      updates.scheduled_at = input.scheduledAt;
    if (input.meetingPointName !== undefined)
      updates.meeting_point_name = input.meetingPointName || null;
    if (input.meetingPointLat !== undefined)
      updates.meeting_point_lat = input.meetingPointLat ?? null;
    if (input.meetingPointLng !== undefined)
      updates.meeting_point_lng = input.meetingPointLng ?? null;
    if (input.bikeTypesAllowed !== undefined)
      updates.bike_types_allowed =
        input.bikeTypesAllowed.length > 0 ? input.bikeTypesAllowed : null;
    if (input.distanceKm !== undefined)
      updates.distance_km = input.distanceKm ?? null;
    if (input.category !== undefined) updates.category = input.category;
    if (input.isPublic !== undefined) updates.is_public = input.isPublic;

    const { error } = await supabase
      .from("community_ride")
      .update(updates)
      .eq("id", input.id);

    if (error) throw error;

    // Audit log — status transitions and field edits.
    const organizerUserId = currentRow?.organizer_user_id as string | undefined;
    const organizerRiderId = currentRow?.organizer_rider_id as
      | string
      | undefined;
    const rideTitle = (input.title ??
      currentRow?.title ??
      "Untitled") as string;

    const isStatusChange =
      input.status !== undefined && input.status !== currentStatus;
    const isFieldEdit = !isStatusChange && Object.keys(updates).length > 1; // more than just updated_at

    if (isStatusChange || isFieldEdit) {
      const auditPayload = isStatusChange
        ? {
            action: `Community ride ${input.status}`,
            description: `Admin changed ride "${rideTitle}" status from "${currentStatus}" to "${input.status}".`,
            metadata: {
              rideId: input.id,
              previousStatus: currentStatus,
              newStatus: input.status,
              organizerType: currentRow?.organizer_type ?? null,
              organizerName: currentRow?.organizer_name ?? null,
            },
          }
        : {
            action: "Community ride edited",
            description: `Admin edited community ride "${rideTitle}".`,
            metadata: {
              rideId: input.id,
              updatedFields: Object.keys(updates).filter(
                (k) => k !== "updated_at",
              ),
              organizerType: currentRow?.organizer_type ?? null,
              organizerName: currentRow?.organizer_name ?? null,
              organizerRiderId: organizerRiderId ?? null,
            },
          };

      const activityRefs = await resolveActivityUserRefs(supabase, {
        targetUserIds: [organizerUserId, auth.authUser.id],
        actorUserIds: [auth.authUser.id],
      });

      if (activityRefs.userId) {
        await writeUserActivity(supabase, {
          user_id: activityRefs.userId,
          actor_user_id: activityRefs.actorUserId,
          source: "web",
          related_entity_type: "community_ride",
          related_entity_id: input.id,
          ...auditPayload,
        }).catch((err) =>
          console.warn("Community ride update audit write failed:", err),
        );
      }
    }

    revalidatePath("/community-rides");
    return { success: true };
  } catch (err) {
    console.error("updateCommunityRide error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update ride",
    };
  }
}

export async function removeParticipant(
  rideId: string,
  riderId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/community-rides");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("community_ride_participant")
      .update({ status: "removed" })
      .eq("community_ride_id", rideId)
      .eq("rider_id", riderId);

    if (error) throw error;

    // Resolve participant's user_id for audit trail.
    const { data: riderRow } = await supabase
      .from("rider")
      .select("user_id")
      .eq("id", riderId)
      .maybeSingle();

    const activityRefs = await resolveActivityUserRefs(supabase, {
      targetUserIds: [riderRow?.user_id as string | undefined],
      actorUserIds: [auth.authUser.id],
    });

    if (activityRefs.userId) {
      await writeUserActivity(supabase, {
        user_id: activityRefs.userId,
        actor_user_id: activityRefs.actorUserId,
        source: "web",
        action: "Removed from community ride",
        description: `Admin removed rider from community ride.`,
        related_entity_type: "community_ride",
        related_entity_id: rideId,
        metadata: { rideId, riderId },
      }).catch((err) =>
        console.warn("Remove participant audit write failed:", err),
      );
    }

    revalidatePath("/community-rides");
    return { success: true };
  } catch (err) {
    console.error("removeParticipant error:", err);
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to remove participant",
    };
  }
}

export async function deleteCommunityRide(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/community-rides");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();

    // Fetch ride title + organizer before deleting for audit record.
    const { data: rideRow } = await supabase
      .from("community_ride")
      .select(
        "title, organizer_type, organizer_user_id, organizer_rider_id, organizer_name",
      )
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase
      .from("community_ride")
      .delete()
      .eq("id", id);

    if (error) throw error;

    // Audit log against admin actor.
    const activityRefs = await resolveActivityUserRefs(supabase, {
      targetUserIds: [
        rideRow?.organizer_user_id as string | undefined,
        auth.authUser.id,
      ],
      actorUserIds: [auth.authUser.id],
    });

    if (activityRefs.userId) {
      await writeUserActivity(supabase, {
        user_id: activityRefs.userId,
        actor_user_id: activityRefs.actorUserId,
        source: "web",
        action: "Community ride deleted",
        description: `Admin permanently deleted community ride "${(rideRow?.title as string | undefined) ?? id}".`,
        related_entity_type: "community_ride",
        related_entity_id: id,
        metadata: {
          rideId: id,
          organizerType: rideRow?.organizer_type ?? null,
          organizerUserId: rideRow?.organizer_user_id ?? null,
          organizerRiderId: rideRow?.organizer_rider_id ?? null,
          organizerName: rideRow?.organizer_name ?? null,
        },
      }).catch((err) =>
        console.warn("Community ride deletion audit write failed:", err),
      );
    }

    revalidatePath("/community-rides");
    return { success: true };
  } catch (err) {
    console.error("deleteCommunityRide error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete ride",
    };
  }
}
