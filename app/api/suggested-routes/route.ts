import { NextResponse } from "next/server";
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

const createRouteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  geometry: z.array(waypointSchema).min(2).max(500),
  city: z.string().trim().max(100).optional().nullable(),
  zones: z.array(z.string().trim().min(1)).default([]),
  difficulty: z.enum(["easy", "moderate", "challenging"]).default("easy"),
  estimatedDurationMinutes: z.coerce.number().int().min(1).max(600),
  estimatedDistanceMeters: z.coerce.number().int().min(100).max(500_000),
  rewardType: z.enum(["multiplier", "bonus"]),
  rewardValue: z.coerce.number().min(0).max(100),
  maxBonusPerRide: z.coerce.number().int().min(0).optional().nullable(),
  maxTotalRewards: z.coerce.number().int().min(0).optional().nullable(),
  active: z.boolean().default(true),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
});

const listQuerySchema = z.object({
  active: z
    .enum(["true", "false", "all"])
    .optional()
    .transform((v) => (v === "all" ? undefined : v === "true")),
  city: z.string().trim().max(100).optional(),
  difficulty: z.enum(["easy", "moderate", "challenging"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── GET /api/suggested-routes ────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    await requireAdminRoles(ADMIN_MODERATOR_ROLES);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const queryResult = listQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", issues: queryResult.error.issues },
      { status: 400 },
    );
  }

  const { active, city, difficulty, limit, offset } = queryResult.data;
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("suggested_routes")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (active !== undefined) {
    query = query.eq("active", active);
  }
  if (city) {
    query = query.ilike("city", `%${city}%`);
  }
  if (difficulty) {
    query = query.eq("difficulty", difficulty);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[suggested-routes] GET list failed", error);
    return NextResponse.json(
      { error: "Failed to fetch suggested routes" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { routes: data ?? [], total: count ?? 0, limit, offset },
    { headers: { "cache-control": "no-store" } },
  );
}

// ─── POST /api/suggested-routes ───────────────────────────────────────────────

export async function POST(request: Request) {
  let user;
  try {
    user = await requireAdminRoles(ADMIN_MODERATOR_ROLES);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createRouteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const d = parsed.data;
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("suggested_routes")
    .insert({
      name: d.name,
      description: d.description ?? null,
      geometry: d.geometry,
      city: d.city ?? null,
      zones: d.zones,
      difficulty: d.difficulty,
      estimated_duration_minutes: d.estimatedDurationMinutes,
      estimated_distance_meters: d.estimatedDistanceMeters,
      reward_type: d.rewardType,
      reward_value: d.rewardValue,
      max_bonus_per_ride: d.maxBonusPerRide ?? null,
      max_total_rewards: d.maxTotalRewards ?? null,
      active: d.active,
      start_at: d.startAt ?? null,
      end_at: d.endAt ?? null,
      created_by: user.authUser.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[suggested-routes] POST create failed", error);
    return NextResponse.json(
      { error: "Failed to create suggested route" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { route: data },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
