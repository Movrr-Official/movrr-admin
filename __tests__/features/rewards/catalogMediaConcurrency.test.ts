import { beforeEach, expect, it, vi } from "vitest";
const { objects } = vi.hoisted(() => ({ objects: new Map<string, ArrayBuffer>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ storage: { from: () => ({
  upload: async (key: string, bytes: ArrayBuffer, options: { upsert: boolean }) => {
    if (objects.has(key) && !options.upsert) return { error: new Error("Object already exists") };
    objects.set(key, bytes);return { error: null };
  },
  getPublicUrl: (key: string) => ({ data: { publicUrl: `https://isolated/storage/v1/object/public/reward-catalog/${key}` } }),
  remove: async (keys: string[]) => { keys.forEach(key => objects.delete(key));return { error: null }; },
}) } }) }));
import { uploadRewardCatalogThumbnail, uploadRewardCatalogGalleryImage, deleteRewardCatalogImage } from "@/lib/rewardCatalogImage";
beforeEach(() => objects.clear());
it.each(["thumbnail", "gallery"])("losing a catalog precondition cannot overwrite/delete the winner's %s", async kind => {
  const upload = (bytes: ArrayBuffer) => kind === "thumbnail" ? uploadRewardCatalogThumbnail(bytes, "image/webp", "product") : uploadRewardCatalogGalleryImage(bytes, "image/webp", "product", 1);
  const firstBytes = new Uint8Array([1]).buffer, secondBytes = new Uint8Array([2]).buffer;
  const [winner, loser] = await Promise.all([upload(firstBytes), upload(secondBytes)]);
  expect(winner.path).not.toBe(loser.path);expect(objects.size).toBe(2);
  await deleteRewardCatalogImage(loser.path);
  expect(objects.get(winner.path)).toBe(firstBytes);expect(objects.size).toBe(1);
});
