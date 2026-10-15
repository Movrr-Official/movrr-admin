import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));
import { createSupabaseRedemptionRepository } from "@/features/rewards/infrastructure/supabaseRedemptionRepository";
import { createSupabaseLedgerRepository } from "@/features/wallet/infrastructure/supabaseLedgerRepository";
import { createSupabaseGeneratedDigitalResourceProvider } from "@/features/fulfilment/infrastructure/supabaseGeneratedDigitalResourceProvider";
beforeEach(() => rpc.mockReset());
describe("authoritative financial adapters", () => {
  it("commits only server-selected pricing with the caller identity and stable operation", async () => {
    rpc.mockResolvedValue({
      data: { redemption: { id: "red", ledgerTransactionId: "tx" } },
      error: null,
    });
    await createSupabaseRedemptionRepository().commit({
      riderId: "rider",
      actorId: "actor",
      catalogItemId: "reward",
      operationId: "operation",
      correlationId: "correlation",
    });
    expect(rpc).toHaveBeenCalledWith("wallet_settle_debit", {
      p_rider_id: "rider",
      p_actor_id: "actor",
      p_catalog_item_id: "reward",
      p_operation_id: "operation",
      p_correlation_id: "correlation",
    });
  });
  it.each([
    ["22023", "BusinessFailure"],
    ["42501", "permission_denied"],
    ["08006", "InfrastructureFailure"],
  ])("preserves %s error semantics", async (code, kind) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "failure" } });
    expect(
      await createSupabaseRedemptionRepository().commit({
        riderId: "r",
        actorId: "a",
        catalogItemId: "c",
        operationId: "o",
        correlationId: "x",
      }),
    ).toMatchObject({ ok: false, kind });
  });
  it("refund retries keep the operation ID even when the reason changes", async () => {
    rpc.mockResolvedValue({
      data: { transactionId: "tx", balanceAfter: 100 },
      error: null,
    });
    const ledger = createSupabaseLedgerRepository();
    for (const reason of ["failed", "retry"])
      await ledger.credit({
        riderId: "r",
        points: 40,
        fulfilmentId: "f",
        reason,
        correlationId: "c",
      });
    expect(rpc.mock.calls.map((call) => call[1].p_operation_id)).toEqual([
      "refund:f",
      "refund:f",
    ]);
    expect(ledger).not.toHaveProperty("debit");
  });
  it("allocates through the transaction that persists the reservation atomically", async () => {
    rpc.mockResolvedValue({
      data: { allocationId: "a", status: "reserved" },
      error: null,
    });
    expect(
      await createSupabaseGeneratedDigitalResourceProvider().allocate({
        fulfilmentId: "f",
        resourceId: "r",
      }),
    ).toMatchObject({ ok: true, value: { allocationId: "a" } });
    expect(rpc).toHaveBeenCalledWith("allocate_reward_resource", {
      p_fulfilment_id: "f",
      p_resource_id: "r",
    });
  });
});
