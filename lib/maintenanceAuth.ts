import { CRON_SECRET, MAINTENANCE_JOB_TOKEN } from "@/lib/env";
import { safeEqualBearerToken } from "@/lib/secureCompare";

export function isAuthorizedMaintenanceRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization") || "";

  if (MAINTENANCE_JOB_TOKEN && safeEqualBearerToken(authHeader, MAINTENANCE_JOB_TOKEN)) {
    return true;
  }

  if (CRON_SECRET && safeEqualBearerToken(authHeader, CRON_SECRET)) {
    return true;
  }

  return false;
}
