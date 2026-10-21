import { readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { isPlatformBearerApiPath } from "@/lib/pathMatch";

const cookieAuth = vi.hoisted(() => vi.fn(() => { throw new Error("Admin cookie gate reached"); }));
vi.mock("@supabase/ssr", () => ({ createServerClient: cookieAuth }));
vi.mock("@/lib/env", () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" }));
import { proxy } from "@/proxy";

function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? routes(path.join(dir, entry.name)) : entry.name === "route.ts" ? [path.join(dir, entry.name)] : [],
  );
}
const registered = routes("app/api/v1").filter(file => !file.replaceAll("\\", "/").includes("/internal/"))
  .flatMap(file => {
    const route = "/" + file.replaceAll("\\", "/").replace(/^app\//, "").replace(/\/route.ts$/, "");
    return route.includes("[feature]") ? ["rides", "achievements", "accessories", "brands", "impact"].map(feature => route.replace("[feature]", feature)) : [route.replace(/\[[^\]]+\]/g, "example-id")];
  });

describe("registered Platform APIs reach their canonical bearer handlers", () => {
  it.each(registered)("%s passes ingress without an internal staff cookie", async route => {
    expect(isPlatformBearerApiPath(route)).toBe(true);
    const response = await proxy(new NextRequest("https://admin.movrr.test" + route));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(cookieAuth).not.toHaveBeenCalled();
  });
  it.each(["/users", "/api/v1/organisations/id/staff/unsafe", "/api/v1/campaigns/id/status/unsafe"])("%s retains the Admin gate", async route => {
    cookieAuth.mockClear();
    expect(isPlatformBearerApiPath(route)).toBe(false);
    await expect(proxy(new NextRequest("https://admin.movrr.test" + route))).rejects.toThrow("Admin cookie gate reached");
  });
});
