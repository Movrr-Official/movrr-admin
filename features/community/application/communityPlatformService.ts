import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";

export type CommunityRideCreateInput = {
  title: string;
  description?: string;
  scheduledAt: string;
  meetingPoint?: string;
  category?: string;
  maxParticipants?: number;
};

async function resolveRiderId(ctx: RequestContext): Promise<string | null> {
  if (ctx.principal.type === "rider") return ctx.principal.riderId;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("rider")
    .select("id")
    .eq("user_id", ctx.principal.userId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function listCommunityRides(
  ctx: RequestContext,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown[]>> {
  const { data, error } = await supabase
    .from("community_ride")
    .select("*")
    .in("status", ["upcoming", "active"])
    .order("scheduled_at", { ascending: true })
    .limit(100);

  if (error) return fail("BusinessFailure", error.message);
  return ok(data ?? []);
}

export async function createCommunityRide(
  ctx: RequestContext,
  input: CommunityRideCreateInput,
  supabase: SupabaseClient,
): Promise<ApplicationResult<unknown>> {
  const riderId = await resolveRiderId(ctx);
  if (!riderId) return fail("permission_denied", "Rider profile required");

  const { data: access, error: accessError } = await supabase.rpc(
    "can_create_community_ride",
  );
  if (accessError) return fail("InfrastructureFailure", accessError.message);
  if (access !== true) {
    return fail("permission_denied", "Not eligible to create community rides");
  }

  const { data, error } = await supabase
    .from("community_ride")
    .insert({
      title: input.title,
      description: input.description ?? "",
      scheduled_at: input.scheduledAt,
      meeting_point_name: input.meetingPoint ?? null,
      category: input.category ?? "social",
      max_participants: input.maxParticipants ?? 20,
      organizer_rider_id: riderId,
      organizer_user_id: ctx.principal.userId,
      created_by_user_id: ctx.principal.userId,
      organizer_type: "rider",
      status: "upcoming",
    })
    .select()
    .single();

  if (error) return fail("BusinessFailure", error.message);
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
    return fail(
      "BusinessFailure",
      data?.error ?? "Community participation failed",
    );
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
    return fail(
      "BusinessFailure",
      data?.error ?? "Community participation failed",
    );
  return ok(data);
}
