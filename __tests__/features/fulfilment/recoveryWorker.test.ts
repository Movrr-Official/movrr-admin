import { beforeEach, expect, it, vi } from "vitest";
const { rpc, send } = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));
vi.mock("@/features/notifications/infrastructure/resendTransactionalEmailPort", () => ({ createResendTransactionalEmailPort: () => ({ sendRewardLifecycle: send }) }));
import { runShopRecovery } from "@/features/fulfilment/application/commands/runShopRecovery";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "shop_recover" ? { recovered: 0, failed: 0 } : name === "shop_claim_outbox" ? [{ id: "intent", kind: "email", lease_token: "lease", fulfilment_id: "reward", payload: { state: "ready", pointsSpent: 0 } }] : null }));
  send.mockResolvedValue(undefined);
});
it("acknowledges delivery with a stable provider identity and no repeated financial command", async () => {
  expect(await runShopRecovery()).toMatchObject({ delivered: 1, notificationFailures: 0 });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "shop:intent", pointsSpent: 0 }));
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["shop_recover", "shop_claim_outbox", "shop_ack_email"]);
});
it("persists failed delivery for retry instead of acknowledging success", async () => {
  send.mockRejectedValue(new Error("provider unavailable"));
  expect(await runShopRecovery()).toMatchObject({ delivered: 0, notificationFailures: 1 });
  expect(rpc).toHaveBeenCalledWith("shop_retry_outbox", { p_id: "intent", p_lease: "lease", p_error: "email_delivery_failed" });
  expect(rpc.mock.calls.some(([name]) => name === "shop_ack_email")).toBe(false);
});
it("delivers the validation intent rather than silently acknowledging an unsent message", async () => {
  const normal = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (...args) => {
    const response = await normal(...args);
    if (args[0] === "shop_claim_outbox") response.data[0].payload.state = "validated";
    return response;
  });
  await runShopRecovery();
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: "validated" }));
});
it("surfaces a retry-persistence failure; the durable lease remains recoverable", async () => {
  send.mockRejectedValue(new Error("provider unavailable"));
  const normal = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (...args) => args[0] === "shop_retry_outbox" ? { error: { code: "08006" } } : normal(...args));
  await expect(runShopRecovery()).rejects.toThrow("retry persistence failed");
});
