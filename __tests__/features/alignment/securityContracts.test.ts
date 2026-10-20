import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ status: "active", error: false, valid: true }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  NEXT_PUBLIC_SUPABASE_URL: "https://isolated.test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.valid ? { id: "user", email: "test@isolated.test" } : null },
        error: null,
      }),
    },
  }),
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data: { status: state.status },
        error: state.error ? { message: "offline" } : null,
      }),
    }),
  }),
}));
import { verifySupabaseAccessToken } from "@/features/identity/infrastructure/supabaseJwtVerifier";
import { mapLedgerEntry } from "@/features/wallet/infrastructure/supabaseLedgerRepository";
beforeEach(() => Object.assign(state, { status: "active", error: false, valid: true }));
describe("existing-session account enforcement", () => {
  it.each(["active", "pending"])("allows eligible %s accounts", async (status) => {
    state.status = status;
    expect(await verifySupabaseAccessToken("existing-token")).toMatchObject({
      userId: "user",
    });
  });
  it.each(["suspended", "blocked", "deleted", "inactive", "unknown", ""])(
    "denies %s even with a valid existing JWT",
    async (status) => {
      state.status = status;
      expect(await verifySupabaseAccessToken("existing-token")).toBeNull();
    },
  );
  it("rechecks suspension after an earlier successful request", async () => {
    expect(await verifySupabaseAccessToken("same-token")).not.toBeNull();
    state.status = "suspended";
    expect(await verifySupabaseAccessToken("same-token")).toBeNull();
  });
  it("fails closed when account eligibility cannot be read", async () => {
    state.error = true;
    expect(await verifySupabaseAccessToken("token")).toBeNull();
  });
  it("denies invalid JWTs", async () => {
    state.valid = false;
    expect(await verifySupabaseAccessToken("token")).toBeNull();
  });
});
describe("canonical signed ledger projection", () => {
  const row = {
    id: "id",
    rider_id: "rider",
    source: "adjustment",
    created_at: "2026-10-19T00:00:00Z",
    metadata: {},
  };
  it("preserves redemption debit sign and meaning", () =>
    expect(
      mapLedgerEntry({
        ...row,
        points_earned: -50,
        metadata: { settlement_kind: "debit", redemption_id: "redemption" },
      }),
    ).toMatchObject({ points: -50, category: "redemption" }));
  it("preserves compensating refunds as credits", () =>
    expect(
      mapLedgerEntry({
        ...row,
        points_earned: 50,
        metadata: { settlement_kind: "compensating_refund" },
      }),
    ).toMatchObject({ points: 50, category: "refund" }));
  it("keeps manual adjustments distinct", () =>
    expect(mapLedgerEntry({ ...row, points_earned: -5 })).toMatchObject({
      points: -5,
      category: "adjustment",
    }));
  it("rejects invalid amounts rather than fabricating zero", () =>
    expect(() => mapLedgerEntry({ ...row, points_earned: NaN })).toThrow());
  it.each(["standard_ride", "standard_ride_bonus", "free_ride_bonus", "bonus"])(
    "classifies %s as ride earning",
    (source) =>
      expect(mapLedgerEntry({ ...row, source, points_earned: 4 }).category).toBe("route"),
  );
});
