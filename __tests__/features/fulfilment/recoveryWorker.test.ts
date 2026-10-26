import { beforeEach, expect, it, vi } from "vitest";
const { rpc, send, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), invoke:vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc,functions:{invoke} }) }));
vi.mock("@/features/notifications/infrastructure/resendTransactionalEmailPort", () => ({ createResendTransactionalEmailPort: () => ({ sendRewardLifecycle: send }) }));
import { runShopRecovery } from "@/features/fulfilment/application/commands/runShopRecovery";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "shop_recover" ? { recovered: 0, failed: 0 } : name === "notification_push_health" ? { held: 0, backlog: 0, failed: 0 } : name === "shop_claim_outbox" ? [{ id: "intent", kind: "email", lease_token: "lease", fulfilment_id: "reward", payload: { state: "ready", pointsSpent: 0 } }] : null }));
  send.mockResolvedValue(undefined);
  invoke.mockResolvedValue({error:null});
});
it("acknowledges delivery with a stable provider identity and no repeated financial command", async () => {
  expect(await runShopRecovery()).toMatchObject({ delivered: 1, notificationFailures: 0 });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "shop:intent", pointsSpent: 0 }));
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["shop_recover", "shop_claim_outbox", "shop_ack_email", "shop_pending_push", "notification_push_health", "shop_finish_recovery"]);
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
it("leaves unprocessed leases for durable recovery when its execution budget expires", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(40001);
  try {
    expect(await runShopRecovery()).toMatchObject({ delivered: 0, notificationFailures: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["shop_recover", "shop_claim_outbox", "shop_pending_push", "notification_push_health", "shop_finish_recovery"]);
  } finally { now.mockRestore(); }
});
it("fails closed when the worker outcome cannot be persisted", async () => {
  const normal = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (...args) => args[0] === "shop_finish_recovery" ? { error: { code: "08006" } } : normal(...args));
  await expect(runShopRecovery()).rejects.toThrow("outcome persistence failed");
});

it("includes durable held/backlog health even when HTTP invocations succeed", async () => {
 const normal = rpc.getMockImplementation()!;
 rpc.mockImplementation(async (...args) => args[0] === "notification_push_health" ? { data: { held: 1, backlog: 2 }, error: null } : normal(...args));
 expect(await runShopRecovery()).toMatchObject({ pushDispatchFailures: 0, pushHealth: { held: 1, backlog: 2 } });
});
it("counts provider-reported failure even when the Edge HTTP request succeeds", async () => {
 const normal = rpc.getMockImplementation()!;
 rpc.mockImplementation(async (...args) => args[0] === "shop_pending_push" ? { data: [{ id: "notice" }], error: null } : normal(...args));
 invoke.mockResolvedValue({ data: { unknown: 1 }, error: null });
 expect(await runShopRecovery()).toMatchObject({ pushDispatchFailures: 1 });
});
