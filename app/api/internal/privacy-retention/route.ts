import { NextResponse } from "next/server";
import { MAINTENANCE_JOB_TOKEN } from "@/lib/env";
import { executePrivacyRetentionJob } from "@/app/actions/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const isAuthorizedJobRequest = (request: Request) => {
  if (!MAINTENANCE_JOB_TOKEN) return false;
  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${MAINTENANCE_JOB_TOKEN}`;
};

export async function POST(request: Request) {
  try {
    if (!isAuthorizedJobRequest(request)) {
      return NextResponse.json(
        { success: false, error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }

    const result = await executePrivacyRetentionJob();
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to execute privacy retention job",
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS" },
  });
}
