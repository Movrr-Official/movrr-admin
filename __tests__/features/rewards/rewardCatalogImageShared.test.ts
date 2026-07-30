import { describe, expect, it } from "vitest";

import {
  buildRewardCatalogGalleryPath,
  buildRewardCatalogThumbnailPath,
  detectRewardCatalogImageMime,
  nextRewardCatalogGallerySlot,
  parseOwnedRewardCatalogMediaPath,
  parseRewardCatalogGallerySlot,
  resolveRewardCatalogGalleryReplaceSlot,
  resolveRewardCatalogUploadMime,
  rewardCatalogMediaIdentity,
  sameRewardCatalogMediaSet,
  unreferencedOwnedRewardCatalogPaths,
  validateRewardCatalogImage,
} from "@/lib/rewardCatalogImageShared";

const OWNED = (path: string, v = "1") =>
  `https://abc.supabase.co/storage/v1/object/public/reward-catalog/${path}?v=${v}`;

describe("rewardCatalogImageShared", () => {
  it("builds deterministic thumbnail and gallery paths", () => {
    expect(
      buildRewardCatalogThumbnailPath("rid-1", "image/webp"),
    ).toBe("rewards/rid-1/thumbnail.webp");
    expect(
      buildRewardCatalogGalleryPath("rid-1", 3, "image/jpeg"),
    ).toBe("rewards/rid-1/gallery/3.jpg");
  });

  it("parses owned paths and ignores external hotlinks", () => {
    expect(
      parseOwnedRewardCatalogMediaPath(
        OWNED("rewards/rid-1/thumbnail.webp"),
      ),
    ).toBe("rewards/rid-1/thumbnail.webp");
    expect(
      parseOwnedRewardCatalogMediaPath(
        "https://images.unsplash.com/photo-123",
      ),
    ).toBeNull();
  });

  it("allocates gallery slots from owned paths, not visual index", () => {
    const gallery = [
      OWNED("rewards/rid-1/gallery/2.webp"),
      OWNED("rewards/rid-1/gallery/5.webp"),
      "https://images.pexels.com/external.jpg",
    ];
    expect(nextRewardCatalogGallerySlot(gallery)).toBe(6);
    expect(resolveRewardCatalogGalleryReplaceSlot(gallery, 0)).toBe(2);
    expect(resolveRewardCatalogGalleryReplaceSlot(gallery, 2)).toBe(6);
    expect(parseRewardCatalogGallerySlot("rewards/rid-1/gallery/5.webp")).toBe(
      5,
    );
  });

  it("compares media identity by path so cache-bust query differs are equal", () => {
    const a = OWNED("rewards/rid-1/thumbnail.webp", "111");
    const b = OWNED("rewards/rid-1/thumbnail.webp", "222");
    expect(rewardCatalogMediaIdentity(a)).toBe(rewardCatalogMediaIdentity(b));
    expect(sameRewardCatalogMediaSet([a], [b])).toBe(true);
  });

  it("finds unreferenced owned paths by path, not exact URL string", () => {
    const previous = [
      OWNED("rewards/rid-1/thumbnail.webp", "1"),
      OWNED("rewards/rid-1/gallery/1.webp", "1"),
      "https://images.unsplash.com/keep-me",
    ];
    const next = [
      OWNED("rewards/rid-1/thumbnail.webp", "999"),
      "https://images.unsplash.com/keep-me",
    ];
    expect(
      unreferencedOwnedRewardCatalogPaths("rid-1", previous, next),
    ).toEqual(["rewards/rid-1/gallery/1.webp"]);
  });

  it("validates MIME/size and detects magic bytes", () => {
    expect(validateRewardCatalogImage("image/gif", 100).valid).toBe(false);
    expect(validateRewardCatalogImage("image/png", 0).valid).toBe(false);

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
      .buffer;
    expect(detectRewardCatalogImageMime(jpeg)).toBe("image/jpeg");
    expect(resolveRewardCatalogUploadMime("image/jpeg", jpeg).valid).toBe(true);
    expect(resolveRewardCatalogUploadMime("image/png", jpeg).valid).toBe(false);

    const corrupt = new Uint8Array(16).buffer;
    expect(resolveRewardCatalogUploadMime("image/jpeg", corrupt).valid).toBe(
      false,
    );
  });
});
