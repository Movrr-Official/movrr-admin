import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
vi.mock("@/lib/env", () => ({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54339", NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-test-only", ROUTE_OPTIMIZER_KEY: "", ROUTE_OPTIMIZER_OLD_TOKEN: "", ROUTE_OPTIMIZER_PREV_TOKEN: "", ROUTE_OPTIMIZER_TOKEN: "" }));
import { proxy } from "@/proxy";
describe("Partner discovery proxy delegation", () => {
  beforeEach(() => { vi.clearAllMocks(); auth.getUser.mockResolvedValue({ data: { user: null }, error: null }); });
  it.each([undefined, "Bearer rider-token"])("delegates exact discovery authentication to its handler (%s)", async authorization => {
    const response = await proxy(new NextRequest("http://localhost/api/v1/partners/locations?south=52&north=52.1&west=4&east=4.1", { headers: authorization ? { authorization } : {} }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(auth.getUser).not.toHaveBeenCalled();
  });
  it.each(["/api/v1/partners/locations/private", "/api/v1/partners/locations-other", "/api/v1/organisations/11111111-1111-4111-8111-111111111111/locations", "/organisations"])("retains dashboard protection for %s", async path => {
    const response = await proxy(new NextRequest("http://localhost" + path));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/signin");
    expect(auth.getUser).toHaveBeenCalledOnce();
  });
});
