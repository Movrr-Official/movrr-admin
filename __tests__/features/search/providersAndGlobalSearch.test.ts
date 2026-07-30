import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const createSupabaseAdminClient = vi.fn();

vi.mock("@/lib/admin", () => ({
  requireCapability: (...args: unknown[]) => requireCapability(...args),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => createSupabaseAdminClient(),
}));

import { globalSearch } from "@/app/actions/search";
import { SEARCH_PROVIDERS } from "@/lib/search/providers";
import { SEARCHABLE_ENTITY_REGISTRY } from "@/lib/search/registry";

type QueryResult = { data: unknown; error: null | { message: string } };

function createThenableBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const methods = [
    "select",
    "or",
    "ilike",
    "eq",
    "neq",
    "in",
    "limit",
    "order",
    "range",
  ] as const;

  for (const method of methods) {
    builder[method] = vi.fn(() => builder);
  }

  // Terminal: await builder / .limit() resolves.
  (builder.limit as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const terminal = Object.assign(Promise.resolve(result), builder);
    return terminal;
  });

  return builder as {
    select: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
    ilike: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    neq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
}

describe("search providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("organisation provider excludes reward_partner rows", async () => {
    const builder = createThenableBuilder({ data: [], error: null });
    const client = {
      from: vi.fn(() => builder),
    };

    await SEARCH_PROVIDERS.organisation!(client as never, "acme", 8);

    expect(client.from).toHaveBeenCalledWith("organisation");
    expect(builder.neq).toHaveBeenCalledWith("type", "reward_partner");
    expect(builder.ilike).toHaveBeenCalledWith("name", "%acme%");
  });

  it("partner provider only queries reward_partner organisations", async () => {
    const builder = createThenableBuilder({ data: [], error: null });
    const client = {
      from: vi.fn(() => builder),
    };

    await SEARCH_PROVIDERS.partner!(client as never, "cafe", 8);

    expect(builder.eq).toHaveBeenCalledWith("type", "reward_partner");
  });

  it("rider provider searches city and matching user identities", async () => {
    const cityBuilder = createThenableBuilder({ data: [], error: null });
    const userBuilder = createThenableBuilder({
      data: [{ id: "user-1" }],
      error: null,
    });
    const identityBuilder = createThenableBuilder({
      data: [
        {
          id: "rider-1",
          status: "active",
          city: "Stockholm",
          user_id: "user-1",
          user: { name: "Ada Lovelace", email: "ada@example.com", avatar_url: null },
        },
      ],
      error: null,
    });

    const client = {
      from: vi.fn((table: string) => {
        if (table === "user") return userBuilder;
        // First rider call = city; subsequent = identity
        if ((client.from as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === "rider").length <= 1) {
          return cityBuilder;
        }
        return identityBuilder;
      }),
    };

    // Reset call accounting with a clearer mock
    let riderCalls = 0;
    client.from = vi.fn((table: string) => {
      if (table === "user") return userBuilder;
      riderCalls += 1;
      return riderCalls === 1 ? cityBuilder : identityBuilder;
    });

    const hits = await SEARCH_PROVIDERS.rider!(client as never, "Ada", 8);

    expect(userBuilder.or).toHaveBeenCalled();
    expect(identityBuilder.in).toHaveBeenCalledWith("user_id", ["user-1"]);
    expect(hits.some((hit) => hit.id === "rider-1" && hit.title === "Ada Lovelace")).toBe(
      true,
    );
  });
});

describe("globalSearch result contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapability.mockResolvedValue({
      adminUser: { role: "admin" },
    });
  });

  it("attaches registry href and never returns path-param user destinations", async () => {
    const userBuilder = createThenableBuilder({
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Ada",
          email: "ada@example.com",
          avatar_url: null,
          role: "rider",
          status: "active",
        },
      ],
      error: null,
    });
    const emptyBuilder = createThenableBuilder({ data: [], error: null });

    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "user") return userBuilder;
        return emptyBuilder;
      }),
    });

    const results = await globalSearch("Ada");
    const userHit = results.find((r) => r.type === "user");

    expect(userHit).toBeTruthy();
    expect(userHit?.href).toBe(
      SEARCHABLE_ENTITY_REGISTRY.user.navigation.href(
        "11111111-1111-1111-1111-111111111111",
      ),
    );
    expect(userHit?.href).toBe(
      "/users?id=11111111-1111-1111-1111-111111111111",
    );
    expect(userHit?.href).not.toMatch(/^\/users\/[^?]+$/);
  });

  it("returns empty when role cannot access any searchable entity", async () => {
    requireCapability.mockResolvedValue({
      adminUser: { role: "government" },
    });
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => createThenableBuilder({ data: [], error: null })),
    });

    // government has users:read in ROLE_PERMISSIONS but not sidebar roles for users
    // Registry gates users to admin/super_admin only — government should get no active entities
    // Actually government has users:read but access.roles is admin/super_admin only
    const results = await globalSearch("Ada");
    expect(results).toEqual([]);
  });
});
