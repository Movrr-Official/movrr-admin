import { beforeEach, expect, it, vi } from "vitest";
const { from, rpc, queries } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  queries: [] as Array<{ table: string; calls: Array<[string, unknown[]]> }>,
}));
vi.mock("@/lib/admin", () => ({
  requireCapability: vi.fn(async () => ({ authUser: { id: "admin" } })),
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ from, rpc }),
}));
import { getRewardTransactions } from "@/app/actions/rewards";
import { getDistanceStats, getRideSessions } from "@/app/actions/rideSessions";
import { getRiderPerformanceMetrics } from "@/app/actions/riderPerformance";
import { getSessionAnalytics } from "@/app/actions/sessionAnalytics";
const ride = {
  id: "ride",
  rider_id: "rider",
  status: "completed",
  started_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  verification_result: { status: "verified", reasonCodes: [] },
};
let ledgerError: { message: string } | null = null;
let ledger = [] as Array<Record<string, unknown>>;
beforeEach(() => {
  queries.length = 0;
  rpc.mockImplementation(async (name: string) => ({
    data:
      name === "ops_ride_session_page"
        ? [{ ...ride, _settlement: { status: "pending", completeness: "unresolved" } }]
        : name === "get_impact_summary"
          ? [{ total_rides: 1, total_distance_km: 1, co2_saved_kg: 0.19 }]
          : [],
    error: null,
  }));
  ledgerError = null;
  ledger = [
    { source: "standard_ride", points_earned: 20 },
    { source: "campaign_ride", points_earned: 10 },
    { source: "bonus", points_earned: 3 },
    { source: "standard_ride_bonus", points_earned: 2 },
    { source: "adjustment", points_earned: -1 },
    { source: "redemption", points_earned: -100 },
  ].map((row) => ({
    ...row,
    rider_id: "rider",
    metadata: { rideSessionId: "ride", verifiedMinutes: 20 },
  }));
  from.mockImplementation((table: string) => {
    const calls: Array<[string, unknown[]]> = [];
    queries.push({ table, calls });
    const q: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "in",
      "gte",
      "lte",
      "not",
      "neq",
      "order",
      "limit",
      "range",
    ])
      q[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return q;
      };
    q.then = (resolve: (value: unknown) => unknown) => {
      let data: unknown[] =
        table === "ride_session"
          ? [ride]
          : table === "reward_transactions"
            ? ledger
            : table === "reward_redemptions"
              ? [
                  {
                    id: "red",
                    rider_id: "rider",
                    points_spent: 40,
                    status: "requested",
                    requested_at: ride.created_at,
                    metadata: { wallet_contract: 2 },
                  },
                ]
              : [];
      for (const [name, args] of calls) {
        if (name === "neq")
          data = data.filter(
            (row) => (row as Record<string, unknown>)[String(args[0])] !== args[1],
          );
        if (name === "range") data = data.slice(Number(args[0]), Number(args[1]) + 1);
      }
      return Promise.resolve({
        data,
        error: table === "reward_transactions" ? ledgerError : null,
      }).then(resolve);
    };
    return q;
  });
});
it("preserves the authoritative impact aggregate above the default row limit", async () => {
  rpc.mockResolvedValueOnce({ data: [{ total_rides: "1502", total_distance_km: "1505", co2_saved_kg: "285.95" }], error: null });
  expect(await getDistanceStats()).toEqual({ success: true, data: { totalDistanceKm: 1505, co2SavedKg: 285.95, sessionCount: 1502 } });
  expect(rpc).toHaveBeenCalledWith("get_impact_summary", { p_rider: null });
  expect(from).not.toHaveBeenCalled();
});
it("matches the summary ledger contract, including bonuses and linked adjustments", async () => {
  const result = await getRideSessions();
  expect(result.success).toBe(true);
  expect(result.data?.[0]).toMatchObject({
    pointsAwarded: 34,
    verifiedMinutes: 20,
    verificationStatus: "verified",
    verificationSource: "machine",
  });
  expect(queries.some((q) => q.table === "ride_verification")).toBe(false);
});
it("does not silently truncate ledger components at the API page limit", async () => {
  ledger = Array.from({ length: 1001 }, () => ({
    points_earned: 1,
    source: "bonus",
    metadata: { rideSessionId: "ride" },
  }));
  expect((await getRideSessions()).data?.[0].pointsAwarded).toBe(1001);
});
it("surfaces a ledger failure instead of reporting zero earned points", async () => {
  ledgerError = { message: "ledger unavailable" };
  expect(await getRideSessions()).toMatchObject({
    success: false,
    error: "ledger unavailable",
  });
});
it("uses authoritative verdicts for rider performance and trends", async () => {
  expect((await getRiderPerformanceMetrics("rider")).data).toMatchObject({
    verificationSuccessRate: 100,
    completionRate: 100,
  });
  const result = await getSessionAnalytics();
  expect(result.data?.verificationTrend.reduce((n, p) => n + p.verified, 0)).toBe(1);
  expect(queries.some((q) => q.table === "ride_verification")).toBe(false);
});

it("reports one signed financial effect for a ledger-backed redemption", async () => {
  ledger = [
    {
      id: "debit",
      rider_id: "rider",
      source: "adjustment",
      points_earned: -40,
      created_at: ride.created_at,
      metadata: {
        wallet_contract: 2,
        settlement_kind: "debit",
        adjustment_direction: "debit",
      },
    },
  ];
  const result = await getRewardTransactions();
  expect(result.success).toBe(true);
  expect(result.data).toHaveLength(1);
  expect(result.data?.[0]).toMatchObject({
    id: "debit",
    points: -40,
    type: "redeemed",
  });
});
