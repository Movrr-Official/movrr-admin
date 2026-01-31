import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

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
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const MAX_LOCATIONS = 80;
const MAX_BODY_BYTES = 100_000;

const locationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

const penaltiesSchema = z.object({
  locations: z.array(locationSchema).min(1).max(MAX_LOCATIONS),
  preferences: z
    .object({
      avoid_traffic: z.boolean().optional(),
      weather_consideration: z.boolean().optional(),
      time_of_day: z.string().max(32).optional(),
      priority: z.string().max(32).optional(),
    })
    .partial()
    .optional(),
});

async function requireAdminOrDeny() {
  try {
    return await requireAdmin();
  } catch (err) {
    return null;
  }
}

export async function POST(req: Request) {
  const admin = await requireAdminOrDeny();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const payloadBytes = new TextEncoder().encode(JSON.stringify(body)).length;
    if (payloadBytes > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }

    const parsed = penaltiesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const locations = parsed.data.locations;
    const preferences = parsed.data.preferences ?? {};

    if (locations.length === 0) {
      return NextResponse.json({ edge_penalties: [] }, { status: 200 });
    }

    const basePenalty =
      (preferences.avoid_traffic ? 0.1 : 0) +
      (preferences.weather_consideration ? 0.05 : 0);

    const timeMultiplier =
      preferences.time_of_day === "peak"
        ? 0.12
        : preferences.time_of_day === "evening"
          ? 0.08
          : preferences.time_of_day === "midday"
            ? 0.04
            : 0;

    const priorityBias =
      preferences.priority === "duration" ||
      preferences.priority === "efficiency"
        ? 0.06
        : preferences.priority === "coverage"
          ? -0.03
          : 0;

    const penalty = Math.max(0, basePenalty + timeMultiplier + priorityBias);

    // Build distance-aware penalty matrix
    const edge_penalties = locations.map((from: any, i: number) =>
      locations.map((to: any, j: number) => {
        if (i === j) return 1.0;
        const distance = haversineKm(
          { lat: Number(from.lat), lng: Number(from.lng) },
          { lat: Number(to.lat), lng: Number(to.lng) },
        );
        const distanceFactor = clamp(distance / 3, 0.5, 1.5);
        const factor = 1.0 + penalty * distanceFactor;
        return Number(factor.toFixed(3));
      }),
    );

    return NextResponse.json({ edge_penalties }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "penalty_generation_failed" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS" },
  });
}
