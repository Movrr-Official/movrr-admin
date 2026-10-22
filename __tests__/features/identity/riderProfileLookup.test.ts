import { beforeEach, describe, expect, it, vi } from "vitest";

// Rows the isolated Supabase double serves; filters are applied like PostgREST eq().
const tables: Record<string, Array<Record<string, unknown>>> = { user: [], rider: [] };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (!(table in tables)) throw new Error(`Unexpected data access: ${table}`);
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
        maybeSingle: async () => {
          const rows = tables[table].filter(row => filters.every(([column, value]) => row[column] === value));
          return rows.length > 1
            ? { data: null, error: { message: "multiple rows" } }
            : { data: rows[0] ?? null, error: null };
        },
      };
      return query;
    },
  }),
}));
import { findRiderProfile } from "@/features/identity/infrastructure/supabaseRiderProfileLookup";

describe("findRiderProfile", () => {
  beforeEach(() => {
    tables.user = [{ id: "u1", status: "active" }];
    tables.rider = [{ id: "r1", user_id: "u1", status: "active" }];
  });

  it("resolves an active Rider profile on an active User", async () => {
    await expect(findRiderProfile("u1")).resolves.toEqual({ id: "r1", userId: "u1" });
  });

  it("denies Rider authority for an inactive Rider profile on an active User", async () => {
    tables.rider = [{ id: "r1", user_id: "u1", status: "inactive" }];
    await expect(findRiderProfile("u1")).resolves.toBeNull();
  });

  it("denies Rider authority for a suspended Rider profile", async () => {
    tables.rider = [{ id: "r1", user_id: "u1", status: "suspended" }];
    await expect(findRiderProfile("u1")).resolves.toBeNull();
  });

  it("denies an active Rider profile when the User account is not active", async () => {
    tables.user = [{ id: "u1", status: "suspended" }];
    await expect(findRiderProfile("u1")).resolves.toBeNull();
  });

  it("does not resolve another User's Rider profile", async () => {
    tables.user.push({ id: "u2", status: "active" });
    await expect(findRiderProfile("u2")).resolves.toBeNull();
  });
});
