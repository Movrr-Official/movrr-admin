import { safeEqualBearerToken, safeEqualString } from "@/lib/secureCompare";

/**
 * Internal job auth: prefer `x-internal-job-secret`, also accept Bearer
 * for Vercel cron (INTERNAL_JOB_SECRET / CRON_SECRET / MAINTENANCE_JOB_TOKEN).
 * Reads process.env at call time so tests can set secrets without module reload.
 */
export function isAuthorizedInternalJobRequest(request: Request): boolean {
  const expected =
    process.env.INTERNAL_JOB_SECRET ||
    process.env.CRON_SECRET ||
    process.env.MAINTENANCE_JOB_TOKEN ||
    "";

  if (!expected) {
    return false;
  }

  const headerSecret = request.headers.get("x-internal-job-secret") ?? "";
  if (safeEqualString(headerSecret, expected)) {
    return true;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  return safeEqualBearerToken(authHeader, expected);
}
