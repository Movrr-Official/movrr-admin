"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { shouldUseMockData } from "@/lib/dataSource";
import { mockCommunityRides } from "@/data/mockCommunityRides";
import {
  CommunityRide,
  CommunityRideFiltersSchema,
  UpdateCommunityRideFormData,
} from "@/schemas";

// Flat selects — no FK-hint joins to avoid PGRST200 schema-cache misses.
// Rider names are resolved in a second batched query.
const RIDE_SELECT = `
  id,
  organizer_rider_id,
  title,
  description,
  scheduled_at,
  meeting_point_name,
  meeting_point_lat,
  meeting_point_lng,
  route_id,
  max_participants,
  bike_types_allowed,
  difficulty,
  status,
  is_public,
  created_at,
  updated_at
`;

const PARTICIPANT_SELECT = `
  id, community_ride_id, rider_id, status, joined_at
`;

type RiderNameMap = Record<string, string>; // riderId -> full name

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
    const u = (row as { user?: { first_name?: string | null; last_name?: string | null } | null }).user;
    const name = u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : "";
    map[row.id as string] = name || (row.id as string);
  }
  return map;
}

function buildRide(
  row: Record<string, unknown>,
  nameMap: RiderNameMap,
  participants: Array<{ id: string; rider_id: string; status: string; joined_at: string }>,
): CommunityRide {
  const orgId = String(row.organizer_rider_id ?? "");
  const activeParticipants = participants.filter((p) => p.status === "joined");

  return {
    id: String(row.id ?? ""),
    organizerRiderId: orgId,
    organizerName: nameMap[orgId] ?? orgId,
    title: String(row.title ?? ""),
    description: row.description ? String(row.description) : undefined,
    scheduledAt: String(row.scheduled_at ?? ""),
    meetingPointName: row.meeting_point_name ? String(row.meeting_point_name) : undefined,
    meetingPointLat: row.meeting_point_lat != null ? Number(row.meeting_point_lat) : undefined,
    meetingPointLng: row.meeting_point_lng != null ? Number(row.meeting_point_lng) : undefined,
    routeId: row.route_id ? String(row.route_id) : undefined,
    maxParticipants: Number(row.max_participants ?? 0),
    participantCount: activeParticipants.length,
    bikeTypesAllowed: Array.isArray(row.bike_types_allowed) ? (row.bike_types_allowed as string[]) : undefined,
    difficulty: (row.difficulty as CommunityRide["difficulty"]) ?? "easy",
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
    if (filters?.difficulty && filters.difficulty !== "all") {
      query = query.eq("difficulty", filters.difficulty);
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

    // 3. Batch-fetch rider names for organizers + participants
    const allRiderIds = Array.from(
      new Set([
        ...rows.map((r) => String(r.organizer_rider_id)),
        ...allParticipants.map((p) => p.rider_id),
      ]),
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
      error: err instanceof Error ? err.message : "Failed to fetch community rides",
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

    const [{ data: rideData, error: rideError }, { data: partData, error: partError }] =
      await Promise.all([
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
      new Set([String(row.organizer_rider_id), ...participants.map((p) => p.rider_id)]),
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

export async function updateCommunityRide(
  input: UpdateCommunityRideFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/community-rides");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.status !== undefined) updates.status = input.status;
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.maxParticipants !== undefined) updates.max_participants = input.maxParticipants;

    const { error } = await supabase
      .from("community_ride")
      .update(updates)
      .eq("id", input.id);

    if (error) throw error;
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
  await requireAdminRoles(ADMIN_ONLY_ROLES);

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
    revalidatePath("/community-rides");
    return { success: true };
  } catch (err) {
    console.error("removeParticipant error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to remove participant",
    };
  }
}

export async function deleteCommunityRide(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/community-rides");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("community_ride")
      .delete()
      .eq("id", id);

    if (error) throw error;
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
