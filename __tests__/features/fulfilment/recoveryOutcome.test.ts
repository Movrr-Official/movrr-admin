import { expect, it, vi } from "vitest";
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/internalJobAuth", () => ({ isAuthorizedInternalJobRequest: async () => true }));
vi.mock("@/features/fulfilment/application/commands/runShopRecovery", () => ({ runShopRecovery: run }));
import { shopRecoveryRoute } from "@/features/fulfilment/infrastructure/shopRecoveryRoute";
it.each([{ failed: 1, notificationFailures: 0 }, { failed: 0, notificationFailures: 1 },{failed:0,notificationFailures:0,pushDispatchFailures:1}])("reports unsuccessful execution instead of HTTP 200: %o", async result => {
  run.mockResolvedValue({ ...result, recovered: 0, delivered: 0 });
  const response = await shopRecoveryRoute(new Request("https://isolated/worker"));
  expect(response.status).toBe(503);expect((await response.json()).success).toBe(false);
});
it("reports a completed bounded batch honestly", async () => {
  run.mockResolvedValue({ failed: 0, notificationFailures: 0, recovered: 3, delivered: 4 });
  const response = await shopRecoveryRoute(new Request("https://isolated/worker"));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ success: true, recovered: 3, delivered: 4 });
});
