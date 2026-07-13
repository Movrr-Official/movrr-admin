import { NextResponse, type NextRequest } from "next/server";
import { executePrivacyRetentionJob } from "@/lib/services/privacyRetention";
import { isAuthorizedMaintenanceRequest } from "@/lib/maintenanceAuth";
import { checkDistributedRateLimit } from "@/lib/distributedRateLimit";
import { getClientIp } from "@/lib/rateLimit";
import { applySecurityHeaders } from "@/lib/securityHeaders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkDistributedRateLimit(
      `privacy-retention:${getClientIp(request)}`,
      { max: 6, windowMs: 60 * 60_000 },
    );

    if (!rateLimit.allowed) {
      return applySecurityHeaders(
        NextResponse.json(
          { success: false, error: "rate_limited" },
          {
            status: 429,
            headers: {
              "cache-control": "no-store",
              "retry-after": String(rateLimit.retryAfterSeconds),
            },
          },
        ),
        request,
      );
    }

    if (!isAuthorizedMaintenanceRequest(request)) {
      return applySecurityHeaders(
        NextResponse.json(
          { success: false, error: "unauthorized" },
          { status: 401, headers: { "cache-control": "no-store" } },
        ),
        request,
      );
    }

    const result = await executePrivacyRetentionJob();
    return applySecurityHeaders(
      NextResponse.json(result, {
        headers: { "cache-control": "no-store" },
      }),
      request,
    );
  } catch (error) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to execute privacy retention job",
        },
        { status: 500, headers: { "cache-control": "no-store" } },
      ),
      request,
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS" },
  });
}
