import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isAuthorizedInternalJobRequest } from "@/lib/internalJobAuth";
beforeEach(() => {
  for (const name of ["SHOP_RECOVERY_SECRET", "INTERNAL_JOB_SECRET", "CRON_SECRET", "MAINTENANCE_JOB_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"]) vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());
it("denies unconfigured and unauthenticated recovery requests", async () => {
  expect(await isAuthorizedInternalJobRequest(new Request("https://isolated/job"))).toBe(false);
});
it("accepts the private Shop secret alongside a separately configured daily cron secret", async () => {
  vi.stubEnv("SHOP_RECOVERY_SECRET", "isolated-shop-secret");vi.stubEnv("CRON_SECRET", "isolated-other-secret");
  expect(await isAuthorizedInternalJobRequest(new Request("https://isolated/job", { headers: { "x-internal-job-secret": "isolated-shop-secret" } }))).toBe(true);
});
it("denies altered scheduler authentication", async () => {
  vi.stubEnv("SHOP_RECOVERY_SECRET", "isolated-shop-secret");
  expect(await isAuthorizedInternalJobRequest(new Request("https://isolated/job", { headers: { "x-internal-job-secret": "isolated-shop-secret-altered" } }))).toBe(false);
});
