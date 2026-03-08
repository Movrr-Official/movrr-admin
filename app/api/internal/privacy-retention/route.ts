import { NextResponse } from "next/server";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
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
      await requireAdminRoles(ADMIN_ONLY_ROLES);
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
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
}
