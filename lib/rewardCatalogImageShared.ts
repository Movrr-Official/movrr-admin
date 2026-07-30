/**
 * Client-safe Reward Catalog media helpers (no Supabase admin client).
 * Server upload/delete live in `rewardCatalogImage.ts` (server-only).
 */

export const REWARD_CATALOG_IMAGE_BUCKET = "reward-catalog";

/** 5 MB — matches the bucket file_size_limit in 049_reward_catalog_storage.sql */
export const REWARD_CATALOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const REWARD_CATALOG_GALLERY_MAX_ITEMS = 12;

/** GIF excluded — match community ride + bucket allowlist. */
export const REWARD_CATALOG_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type RewardCatalogAllowedMimeType =
  (typeof REWARD_CATALOG_ALLOWED_MIME_TYPES)[number];

export type RewardCatalogImageValidation =
  | { valid: true; mimeType: RewardCatalogAllowedMimeType }
  | { valid: false; error: string };

export function extensionForRewardCatalogMime(
  mimeType: RewardCatalogAllowedMimeType,
): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

export function buildRewardCatalogThumbnailPath(
  rewardId: string,
  mimeType: RewardCatalogAllowedMimeType,
): string {
  return `rewards/${rewardId}/thumbnail.${extensionForRewardCatalogMime(mimeType)}`;
}

/** 1-based gallery slot — `rewards/{id}/gallery/{n}.{ext}` */
export function buildRewardCatalogGalleryPath(
  rewardId: string,
  slot: number,
  mimeType: RewardCatalogAllowedMimeType,
): string {
  if (!Number.isInteger(slot) || slot < 1) {
    throw new Error("Gallery slot must be a positive integer.");
  }
  return `rewards/${rewardId}/gallery/${slot}.${extensionForRewardCatalogMime(mimeType)}`;
}

/**
 * Validate declared MIME + size (usability gate). Server also checks magic bytes.
 */
export function validateRewardCatalogImage(
  mimeType: string,
  fileSizeBytes: number,
): RewardCatalogImageValidation {
  const normalised = mimeType.toLowerCase();

  if (
    !REWARD_CATALOG_ALLOWED_MIME_TYPES.includes(
      normalised as RewardCatalogAllowedMimeType,
    )
  ) {
    return {
      valid: false,
      error: `Unsupported file type "${mimeType}". Choose a JPEG, PNG, or WebP image.`,
    };
  }

  if (fileSizeBytes > REWARD_CATALOG_IMAGE_MAX_BYTES) {
    const maxMb = (REWARD_CATALOG_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    const actualMb = (fileSizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Image is too large (${actualMb} MB). The maximum is ${maxMb} MB.`,
    };
  }

  if (fileSizeBytes <= 0) {
    return { valid: false, error: "Image file is empty." };
  }

  return {
    valid: true,
    mimeType: normalised as RewardCatalogAllowedMimeType,
  };
}

/**
 * Detect image MIME from magic bytes. Returns null if the payload is not a
 * supported image (corrupt, truncated, or spoofed extension).
 */
export function detectRewardCatalogImageMime(
  bytes: ArrayBuffer,
): RewardCatalogAllowedMimeType | null {
  const u8 = new Uint8Array(bytes);
  if (u8.length < 12) return null;

  // JPEG SOI
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG signature
  if (
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47 &&
    u8[4] === 0x0d &&
    u8[5] === 0x0a &&
    u8[6] === 0x1a &&
    u8[7] === 0x0a
  ) {
    return "image/png";
  }

  // RIFF....WEBP
  if (
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46 &&
    u8[8] === 0x57 &&
    u8[9] === 0x45 &&
    u8[10] === 0x42 &&
    u8[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Prefer magic-byte MIME when it conflicts with the browser-declared type.
 */
export function resolveRewardCatalogUploadMime(
  declaredMime: string,
  bytes: ArrayBuffer,
): RewardCatalogImageValidation {
  const declared = validateRewardCatalogImage(declaredMime, bytes.byteLength);
  if (!declared.valid) return declared;

  const detected = detectRewardCatalogImageMime(bytes);
  if (!detected) {
    return {
      valid: false,
      error:
        "File contents are not a valid JPEG, PNG, or WebP image (corrupt or unsupported).",
    };
  }

  if (detected !== declared.mimeType) {
    return {
      valid: false,
      error: `File content (${detected}) does not match the declared type (${declared.mimeType}).`,
    };
  }

  return declared;
}

/**
 * If `url` points at this project's reward-catalog bucket, return the object path.
 * External hotlinks return null.
 */
export function parseOwnedRewardCatalogMediaPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${REWARD_CATALOG_IMAGE_BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    const path = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    return path || null;
  } catch {
    return null;
  }
}

export function isOwnedRewardCatalogMediaUrl(url: string): boolean {
  return parseOwnedRewardCatalogMediaPath(url) !== null;
}

/** Stable identity for compare/reorder — owned URLs key by path, others by full URL. */
export function rewardCatalogMediaIdentity(url: string): string {
  return parseOwnedRewardCatalogMediaPath(url) ?? url;
}

/** Extract 1-based gallery slot from an owned path, or null. */
export function parseRewardCatalogGallerySlot(path: string): number | null {
  const match = path.match(/\/gallery\/(\d+)\.[^/]+$/);
  if (!match) return null;
  const slot = Number(match[1]);
  return Number.isInteger(slot) && slot >= 1 ? slot : null;
}

/**
 * Next free gallery slot = max(owned slots) + 1.
 * Never uses visual array index (safe after reorder/remove).
 */
export function nextRewardCatalogGallerySlot(galleryUrls: string[]): number {
  let max = 0;
  for (const url of galleryUrls) {
    const path = parseOwnedRewardCatalogMediaPath(url);
    if (!path) continue;
    const slot = parseRewardCatalogGallerySlot(path);
    if (slot && slot > max) max = slot;
  }
  return max + 1;
}

/**
 * Slot for a replace: reuse the item's owned path slot when present,
 * otherwise allocate a new slot.
 */
export function resolveRewardCatalogGalleryReplaceSlot(
  galleryUrls: string[],
  replaceIndex: number,
): number {
  const previousUrl = galleryUrls[replaceIndex];
  const previousPath = previousUrl
    ? parseOwnedRewardCatalogMediaPath(previousUrl)
    : null;
  if (previousPath) {
    const slot = parseRewardCatalogGallerySlot(previousPath);
    if (slot) return slot;
  }
  return nextRewardCatalogGallerySlot(galleryUrls);
}

/**
 * Paths that are owned for this reward in `previousUrls` but not referenced
 * (by path) in `nextUrls`.
 */
export function unreferencedOwnedRewardCatalogPaths(
  rewardId: string,
  previousUrls: string[],
  nextUrls: string[],
): string[] {
  const prefix = `rewards/${rewardId}/`;
  const nextPaths = new Set<string>();

  for (const url of nextUrls) {
    if (!url) continue;
    const path = parseOwnedRewardCatalogMediaPath(url);
    if (path) nextPaths.add(path);
  }

  const orphaned: string[] = [];
  const seen = new Set<string>();

  for (const url of previousUrls) {
    if (!url) continue;
    const path = parseOwnedRewardCatalogMediaPath(url);
    if (!path || !path.startsWith(prefix) || nextPaths.has(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    orphaned.push(path);
  }

  return orphaned;
}

export function sameRewardCatalogMediaSet(
  left: string[],
  right: string[],
): boolean {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(rewardCatalogMediaIdentity).sort();
  const rightKeys = right.map(rewardCatalogMediaIdentity).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}
