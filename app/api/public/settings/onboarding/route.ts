import { NextResponse } from "next/server";
import { getPublicOnboardingSettings } from "@/app/actions/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await getPublicOnboardingSettings();

  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error || "Failed to load onboarding settings" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(result.data, {
    headers: { "cache-control": "no-store" },
  });
}
