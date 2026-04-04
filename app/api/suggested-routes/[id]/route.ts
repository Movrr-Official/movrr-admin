import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_MODERATOR_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── Validation ───────────────────────────────────────────────────────────────

const waypointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

const patchRouteSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    geometry: z.array(waypointSchema).min(2).max(500),
    city: z.string().trim().max(100).nullable(),
    zones: z.array(z.string().trim().min(1)),
    difficulty: z.enum(["easy", "moderate", "challenging"]),
    estimatedDurationMinutes: z.coerce.number().int().min(1).max(600),
    estimatedDistanceMeters: z.coerce.number().int().min(100).max(500_000),
    rewardType: z.enum(["multiplier", "bonus"]),
    rewardValue: z.coerce.number().min(0).max(100),
    maxBonusPerRide: z.coerce.number().int().min(0).nullable(),
    maxTotalRewards: z.coerce.number().int().min(0).nullable(),
    active: z.boolean(),
    startAt: z.string().datetime().nullable(),
    endAt: z.string().datetime().nullable(),
  })
  .partial();

// ─── GET /api/suggested-routes/[id] ──────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await requireAdminRoles(ADMIN_MODERATOR_ROLES);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("suggested_routes")
    .select("*")
    .eq("id", id)
    .single();

  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (error) {
    console.error("[suggested-routes/[id]] GET failed", error);
    return NextResponse.json(
      { error: "Failed to fetch suggested route" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { route: data },
    { headers: { "cache-control": "no-store" } },
  );
}

// ─── PATCH /api/suggested-routes/[id] ────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await requireAdminRoles(ADMIN_MODERATOR_ROLES);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchRouteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const d = parsed.data;
  const supabase = createSupabaseAdminClient();

  // Build update payload from provided fields only
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.name !== undefined) update.name = d.name;
  if (d.description !== undefined) update.description = d.description;
  if (d.geometry !== undefined) update.geometry = d.geometry;
  if (d.city !== undefined) update.city = d.city;
  if (d.zones !== undefined) update.zones = d.zones;
  if (d.difficulty !== undefined) update.difficulty = d.difficulty;
  if (d.estimatedDurationMinutes !== undefined)
    update.estimated_duration_minutes = d.estimatedDurationMinutes;
  if (d.estimatedDistanceMeters !== undefined)
    update.estimated_distance_meters = d.estimatedDistanceMeters;
  if (d.rewardType !== undefined) update.reward_type = d.rewardType;
  if (d.rewardValue !== undefined) update.reward_value = d.rewardValue;
  if (d.maxBonusPerRide !== undefined) update.max_bonus_per_ride = d.maxBonusPerRide;
  if (d.maxTotalRewards !== undefined) update.max_total_rewards = d.maxTotalRewards;
  if (d.active !== undefined) update.active = d.active;
  if (d.startAt !== undefined) update.start_at = d.startAt;
  if (d.endAt !== undefined) update.end_at = d.endAt;

  const { data, error } = await supabase
    .from("suggested_routes")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (error) {
    console.error("[suggested-routes/[id]] PATCH failed", error);
    return NextResponse.json(
      { error: "Failed to update suggested route" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { route: data },
    { headers: { "cache-control": "no-store" } },
  );
}

// ─── DELETE /api/suggested-routes/[id] ───────────────────────────────────────
// Soft-delete: sets active=false rather than hard-deleting rows that may be
// referenced by historical ride_session records.

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await requireAdminRoles(ADMIN_MODERATOR_ROLES);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("suggested_routes")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, active, updated_at")
    .single();

  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (error) {
    console.error("[suggested-routes/[id]] DELETE failed", error);
    return NextResponse.json(
      { error: "Failed to deactivate suggested route" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { deactivated: true, route: data },
    { headers: { "cache-control": "no-store" } },
  );
}
