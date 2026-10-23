import { expect, it, vi } from "vitest";
import { coordinatedManagedFetch } from "@/lib/managedWritePermit";
it.each(["/storage/v1/object/sign/community-rides/owner/ride/cover.png", "/storage/v1/object/sign/community-rides"])("treats authenticated private signing as a read: %s", async path => {
  const rpc = vi.fn(), actor = vi.fn(), transport = vi.fn(async () => new Response('{"signedURL":"temporary"}'));
  const fetch = coordinatedManagedFetch({ rpc, actor, fetch: transport });
  const response = await fetch("https://isolated.invalid" + path, { method: "POST", body: "{}" });
  expect(response.ok).toBe(true); expect(transport).toHaveBeenCalledOnce();
  expect(rpc).not.toHaveBeenCalled(); expect(actor).not.toHaveBeenCalled();
});
it("does not exempt upload signing or other storage mutations", async () => {
  const transport = vi.fn(), rpc = vi.fn();
  const fetch = coordinatedManagedFetch({ rpc, actor: vi.fn(), fetch: transport });
  await expect(fetch("https://isolated.invalid/storage/v1/object/upload/sign/community-rides/path", { method: "POST" })).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
