import { beforeEach, expect, it, vi } from "vitest";
const { requireCapability, rpc } = vi.hoisted(() => ({ requireCapability: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability, requireAnyCapability: requireCapability }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));
import { changeShopOperatingState, recordShopReadiness, getShopOperatingControl } from "@/app/actions/shopOperatingControl";
const operation = "00000000-0000-4000-8000-000000000001";
const command = { state: "disabled" as const, expectedVersion: 8, reason: "Investigate delivery incident", operation };
beforeEach(() => { vi.clearAllMocks(); requireCapability.mockResolvedValue({ authUser: { id: "admin" } }); rpc.mockResolvedValue({ data: { state: "disabled", version: 9 }, error: null }); });
it("requires existing high-privilege capability and forwards the operator's version and durable identity", async () => {
  expect(await changeShopOperatingState(command)).toMatchObject({ data: { version: 9 } });
  expect(requireCapability).toHaveBeenCalledWith("settings.security", { mutation: true });
  expect(rpc).toHaveBeenCalledWith("shop_set_operating_state", { p_actor: "admin", p_state: "disabled", p_expected: 8, p_reason: command.reason, p_operation: operation });
});
it("never invokes the command for a denied session", async () => {
  requireCapability.mockRejectedValue(new Error("denied"));
  expect(await changeShopOperatingState(command)).toHaveProperty("error");expect(rpc).not.toHaveBeenCalled();
});
it.each(["40001", "55000", "42501", "08006"])("reports %s without claiming success or leaking infrastructure errors", async code => {
  rpc.mockResolvedValue({ data: null, error: { code, message: "private infrastructure details" } });
  const result = await changeShopOperatingState(command);expect(result).toHaveProperty("error");expect(JSON.stringify(result)).not.toContain("private infrastructure");
});
it("does not silently supply a missing reason or version", async () => {
  expect(await changeShopOperatingState({ ...command, reason: "" })).toHaveProperty("error");expect(rpc).not.toHaveBeenCalled();
});
it("records a separate evidence identity and never invokes activation", async () => {
  await recordShopReadiness({ criterion: "device", passed: true, reference: "acceptance://verified-device-report", revision: "a".repeat(40), validUntil: "2026-10-20T10:00:00.000Z", expectedVersion: 2, operation });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["shop_record_readiness"]);
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_actor: "admin", p_expected: 2, p_operation: operation });
});
it("fails closed when readiness cannot be read", async () => {
  rpc.mockResolvedValueOnce({ data: { canManage: true }, error: null }).mockResolvedValueOnce({ data: null, error: { code: "08006" } });
  expect(await getShopOperatingControl()).toHaveProperty("error");
});
