import { Receiver } from "@upstash/qstash";
import { safeEqualBearerToken, safeEqualString } from "@/lib/secureCompare";

/**
 * Internal job auth: prefer `x-internal-job-secret`, also accept Bearer
 * for Vercel cron / manual ops (INTERNAL_JOB_SECRET / CRON_SECRET /
 * MAINTENANCE_JOB_TOKEN), and valid Upstash QStash signatures when signing
 * keys are configured.
 *
 * Reads process.env at call time so tests can set secrets without module reload.
 */
export async function isAuthorizedInternalJobRequest(
  request: Request,
): Promise<boolean> {
  const expected =
    process.env.INTERNAL_JOB_SECRET ||
    process.env.CRON_SECRET ||
    process.env.MAINTENANCE_JOB_TOKEN ||
    "";

  if (expected) {
    const headerSecret = request.headers.get("x-internal-job-secret") ?? "";
    if (safeEqualString(headerSecret, expected)) {
      return true;
    }

    const authHeader = request.headers.get("authorization") ?? "";
    if (safeEqualBearerToken(authHeader, expected)) {
      return true;
    }
  }

  return verifyQstashSignature(request);
}

async function verifyQstashSignature(request: Request): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY ?? "";
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY ?? "";
  const signature = request.headers.get("upstash-signature") ?? "";

  if (!currentSigningKey || !nextSigningKey || !signature) {
    return false;
  }

  try {
    const receiver = new Receiver({
      currentSigningKey,
      nextSigningKey,
    });
    const body = await request.clone().text();
    return await receiver.verify({
      signature,
      body,
      url: request.url,
    });
  } catch {
    return false;
  }
}
