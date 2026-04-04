import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// Mobile fetches active suggested routes for Free Ride Mode discovery.
// No auth required — routes are public by design (like campaign listings).
// Short cache: routes change infrequently but deactivations should propagate quickly.
export const dynamic = "force-dynamic";
export const revalidate = 60;

const querySchema = z.object({
  city: z.string().trim().max(100).optional(),
  difficulty: z.enum(["easy", "moderate", "challenging"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const queryResult = querySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const { city, difficulty, limit, offset } = queryResult.data;
  const now = new Date().toISOString();
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("suggested_routes")
    .select(
      "id, name, description, geometry, city, zones, difficulty, " +
        "estimated_duration_minutes, estimated_distance_meters, " +
        "reward_type, reward_value, max_bonus_per_ride, max_total_rewards, " +
        "start_at, end_at, created_at, updated_at",
      { count: "exact" },
    )
    .eq("active", true)
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (city) {
    query = query.ilike("city", `%${city}%`);
  }
  if (difficulty) {
    query = query.eq("difficulty", difficulty);
  }

  const { data, error, count } = await query;

  if (error) {
    // If the table doesn't exist yet (pre-migration), return empty list gracefully
    if (error.code === "42P01") {
      return NextResponse.json(
        { routes: [], total: 0, limit, offset },
        {
          status: 200,
          headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
        },
      );
    }

    console.error("[public/suggested-routes] GET failed", error);
    return NextResponse.json(
      { error: "Failed to fetch suggested routes" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { routes: data ?? [], total: count ?? 0, limit, offset },
    {
      status: 200,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    },
  );
}
