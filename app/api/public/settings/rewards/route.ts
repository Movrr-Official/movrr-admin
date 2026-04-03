import { NextResponse } from "next/server";
import { getPublicRewardsConfig } from "@/lib/platformSettings";

// Short-lived cache: mobile fetches this at session start; 60-second revalidation
// balances freshness against DB load.
export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  try {
    const config = await getPublicRewardsConfig();
    return NextResponse.json(
      { success: true, config },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      },
    );
  } catch (err) {
    console.error("[platform-config/rewards] Failed to load reward config", err);
    return NextResponse.json(
      { success: false, error: "Failed to load reward configuration" },
      { status: 500 },
    );
  }
}
