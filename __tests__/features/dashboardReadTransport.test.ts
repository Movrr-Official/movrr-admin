import { afterEach, expect, it, vi } from "vitest";
import { dashboardRead } from "@/lib/dashboard/readTransport";
afterEach(()=>vi.unstubAllGlobals());
it.each([401,403,503])("reports HTTP %s without manufacturing empty data",async status=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("{}",{status})));
  await expect(dashboardRead("users")).rejects.toThrow(status===401?"session has expired":status===403?"Permission denied":"data unavailable");
});
it("recognizes a middleware login redirect instead of parsing sign-in HTML",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,status:200,redirected:true,json:()=>{throw new Error("must not parse HTML");}})));
  await expect(dashboardRead("users")).rejects.toThrow("Sign in again");
});
it("sends private no-store reads with a bounded timeout",async()=>{
  const fetcher=vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({success:true,data:[]})));
  vi.stubGlobal("fetch",fetcher);expect(await dashboardRead("users")).toEqual({success:true,data:[]});
  expect(fetcher.mock.calls[0][1]).toMatchObject({cache:"no-store",credentials:"same-origin",signal:expect.any(AbortSignal)});
});
