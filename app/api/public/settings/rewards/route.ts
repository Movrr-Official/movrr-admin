import { NextResponse } from "next/server";
import { getPublicPlatformConfig } from "@/lib/platformSettings";

// Mobile fetches this at app startup to hydrate the reward engine and check
// operational state. 60 s revalidation balances freshness against DB load.
export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  try {
    const platform = await getPublicPlatformConfig();
    return NextResponse.json(
      { success: true, ...platform },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      },
    );
  } catch (err) {
    console.error("[platform-config/rewards] Failed to load platform config", err);
    return NextResponse.json(
      { success: false, error: "Failed to load platform configuration" },
      { status: 500 },
    );
  }
}
