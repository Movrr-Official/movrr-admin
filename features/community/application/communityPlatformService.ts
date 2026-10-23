import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { z } from "zod";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";

export type CommunityRideCreateInput = {
  title: string;
  description?: string;
  scheduledAt: string;
  meetingPoint?: string;
  category?: string;
  maxParticipants?: number;
  operationId: string;
};

async function resolveRiderId(ctx: RequestContext): Promise<string | null> {
  return ctx.principal.type === "rider" ? ctx.principal.riderId : null;
}
export const communityInput = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().max(10000).optional(),
    scheduledAt: z.string().datetime({ offset: true }),
    meetingPoint: z.string().max(500).optional(),
    category: z.enum(["beginner", "intermediate", "challenging", "social"]).optional(),
    maxParticipants: z.number().int().min(1).max(500).optional(),
  })
  .strict();
export async function listCommunityRides(
  ctx: RequestContext,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown[]>> {
  if (ctx.principal.type !== "rider") return fail("permission_denied", "Rider required");
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("community_ride")
      .select("*,community_ride_participant(rider_id,status)")
      .in("status", ["upcoming", "active"])
      .order("scheduled_at")
      .order("id")
      .range(offset, offset + 499);
    if (error) return fail("InfrastructureFailure", "Community rides unavailable");
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  await Promise.all(all.map(async row => {
    if (row.cover_image_url) return;
    row.cover_image_url = null;
    if (typeof row.cover_image_path !== "string") return;
    const { data } = await supabase.storage.from("community-rides").createSignedUrl(row.cover_image_path, 60);
    row.cover_image_url = data?.signedUrl ?? null;
  }));
  return ok(
    all.map((row) => ({
      ...row,
      isOrganizer: row.organizer_user_id === ctx.principal.userId,
      isJoined: (
        (row.community_ride_participant as Array<{ rider_id: string; status: string }>) ??
        []
      ).some(
        (p) =>
          ctx.principal.type === "rider" &&
          p.rider_id === ctx.principal.riderId &&
          p.status === "joined",
      ),
      community_ride_participant: undefined,
    })),
  );
}

export async function createCommunityRide(
  ctx: RequestContext,
  input: CommunityRideCreateInput,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown>> {
  const operationId = input.operationId;
  const { operationId: _operation, ...fields } = input;
  const parsed = communityInput.safeParse(fields);
  if (!parsed.success)
    return fail("validation", "Check the ride title and future schedule");
  const riderId = await resolveRiderId(ctx);
  if (!riderId) return fail("permission_denied", "Rider profile required");

  if (!z.string().uuid().safeParse(operationId).success)
    return fail("validation", "Operation required");
  const { data, error } = await supabase.rpc("create_my_community_ride", {
    p_operation: operationId,
    p_input: {
      ...parsed.data,
      description: parsed.data.description ?? "",
      meetingPoint: parsed.data.meetingPoint ?? "",
      category: parsed.data.category ?? "social",
      maxParticipants: parsed.data.maxParticipants ?? 20,
    },
  });
  if (error)
    return fail(
      error.code === "42501"
        ? "permission_denied"
        : error.code === "40001"
          ? "ConcurrencyConflict"
          : "InfrastructureFailure",
      "Community ride creation unavailable. Retry the same operation.",
    );
  return ok(data);
}

export async function joinCommunityRide(
  ctx: RequestContext,
  communityRideId: string,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown>> {
  const riderId = await resolveRiderId(ctx);
  if (!riderId) return fail("permission_denied", "Rider profile required");

  const { data, error } = await supabase.rpc("join_community_ride", {
    p_community_ride_id: communityRideId,
    p_rider_id: riderId,
  });

  if (error) return fail("BusinessFailure", error.message);
  if (data?.success !== true)
    return fail("BusinessFailure", data?.error ?? "Community participation failed");
  return ok(data);
}

export async function leaveCommunityRide(
  ctx: RequestContext,
  communityRideId: string,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown>> {
  const riderId = await resolveRiderId(ctx);
  if (!riderId) return fail("permission_denied", "Rider profile required");

  const { data, error } = await supabase.rpc("leave_community_ride", {
    p_community_ride_id: communityRideId,
    p_rider_id: riderId,
  });

  if (error) return fail("BusinessFailure", error.message);
  if (data?.success !== true)
    return fail("BusinessFailure", data?.error ?? "Community participation failed");
  return ok(data);
}

export async function updateCommunityRide(
  ctx: RequestContext,
  id: string,
  input: unknown,
  db: SupabaseClient,
) {
  if (ctx.principal.type !== "rider") return fail("permission_denied", "Rider required");
  const parsed = communityInput
    .extend({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
    .safeParse(input);
  if (!z.string().uuid().safeParse(id).success || !parsed.success)
    return fail("validation", "Invalid ride changes");
  const current = await db
    .from("community_ride")
    .select("*")
    .eq("id", id)
    .eq("organizer_user_id", ctx.principal.userId)
    .maybeSingle();
  if (current.error || !current.data)
    return fail("permission_denied", "Organizer access required");
  const p = parsed.data,
    c = current.data;
  const result = await db.rpc("update_community_ride", {
    p_ride_id: id,
    p_expected_updated_at: p.expectedUpdatedAt,
    p_title: p.title,
    p_description: p.description ?? null,
    p_scheduled_at: p.scheduledAt,
    p_meeting_point_name: p.meetingPoint ?? null,
    p_category: p.category ?? c.category,
    p_max_participants: p.maxParticipants ?? c.max_participants,
    p_distance_km: c.distance_km,
    p_cover_image_url: null,
    p_cover_image_path: null,
    p_meeting_point_lat: c.meeting_point_lat,
    p_meeting_point_lng: c.meeting_point_lng,
    p_meeting_point_address: c.meeting_point_address,
  });
  if (result.error) return fail("InfrastructureFailure", "Ride update unavailable");
  const row = result.data?.[0];
  return row?.success === true
    ? ok(row)
    : fail(
        row?.error_code === "conflict" ? "ConcurrencyConflict" : "BusinessFailure",
        row?.error_code ?? "Ride update unavailable",
      );
}
