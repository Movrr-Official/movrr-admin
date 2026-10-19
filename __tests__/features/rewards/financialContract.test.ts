import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));
import { shopRpc } from "@/features/fulfilment/infrastructure/shopLifecycleApi";
beforeEach(() => rpc.mockReset());
describe("canonical lifecycle adapter", () => {
  it.each([["42501", "permission_denied"], ["40001", "ConcurrencyConflict"], ["P0002", "not_found"], ["55000", "unavailable"], ["22023", "BusinessFailure"], ["08006", "InfrastructureFailure"]])("preserves %s semantics", async (code, kind) => {
    rpc.mockResolvedValue({ error: { code, message: "failure" }, data: null });
    expect(await shopRpc("shop_redeem", {})).toMatchObject({ ok: false, kind });
  });
  it("preserves a free receipt without inventing a ledger reference", async () => {
    const receipt = { redemption: { pointsSpent: 0, ledgerTransactionId: null }, fulfilment: { state: "ready" } };
    rpc.mockResolvedValue({ data: receipt, error: null });
    expect(await shopRpc("shop_redeem", { p_expected_price: 0 })).toEqual({ ok: true, value: receipt });
  });
});
