/**
 * Reward Catalog product media — server-side Storage operations.
 *
 * Path contract:
 *   bucket : reward-catalog
 *   thumb  : rewards/{rewardId}/thumbnail.{jpg|png|webp}
 *   gallery: rewards/{rewardId}/gallery/{n}.{jpg|png|webp}   (stable slot, not visual index)
 *
 * Client UI must import helpers from `rewardCatalogImageShared.ts` only.
 */

import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";
import {
  buildRewardCatalogGalleryPath,
  buildRewardCatalogThumbnailPath,
  type RewardCatalogAllowedMimeType,
  REWARD_CATALOG_IMAGE_BUCKET,
  unreferencedOwnedRewardCatalogPaths,
} from "@/lib/rewardCatalogImageShared";

export {
  REWARD_CATALOG_IMAGE_BUCKET,
  REWARD_CATALOG_IMAGE_MAX_BYTES,
  REWARD_CATALOG_GALLERY_MAX_ITEMS,
  REWARD_CATALOG_ALLOWED_MIME_TYPES,
  buildRewardCatalogThumbnailPath,
  buildRewardCatalogGalleryPath,
  validateRewardCatalogImage,
  detectRewardCatalogImageMime,
  resolveRewardCatalogUploadMime,
  parseOwnedRewardCatalogMediaPath,
  isOwnedRewardCatalogMediaUrl,
  rewardCatalogMediaIdentity,
  parseRewardCatalogGallerySlot,
  nextRewardCatalogGallerySlot,
  resolveRewardCatalogGalleryReplaceSlot,
  unreferencedOwnedRewardCatalogPaths,
  sameRewardCatalogMediaSet,
  type RewardCatalogAllowedMimeType,
  type RewardCatalogImageValidation,
} from "@/lib/rewardCatalogImageShared";

export interface RewardCatalogImageUploadResult {
  path: string;
  publicUrl: string;
}

async function uploadRewardCatalogObject(
  bytes: ArrayBuffer,
  mimeType: RewardCatalogAllowedMimeType,
  path: string,
): Promise<RewardCatalogImageUploadResult> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.storage
    .from(REWARD_CATALOG_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (error) {
    logger.error("Reward catalog media upload failed", error, { path });
    throw new Error(`Image could not be uploaded: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(REWARD_CATALOG_IMAGE_BUCKET)
    .getPublicUrl(path);

  // Cache-bust so deterministic path upserts refresh in admin/mobile browsers.
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  return { path, publicUrl };
}

export async function uploadRewardCatalogThumbnail(
  bytes: ArrayBuffer,
  mimeType: RewardCatalogAllowedMimeType,
  rewardId: string,
): Promise<RewardCatalogImageUploadResult> {
  const path = buildRewardCatalogThumbnailPath(rewardId, mimeType);
  return uploadRewardCatalogObject(bytes, mimeType, path);
}

export async function uploadRewardCatalogGalleryImage(
  bytes: ArrayBuffer,
  mimeType: RewardCatalogAllowedMimeType,
  rewardId: string,
  slot: number,
): Promise<RewardCatalogImageUploadResult> {
  const path = buildRewardCatalogGalleryPath(rewardId, slot, mimeType);
  return uploadRewardCatalogObject(bytes, mimeType, path);
}

/**
 * Soft-fail delete — orphaned objects are untidy; broken DB URLs are worse.
 */
export async function deleteRewardCatalogImage(path: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage
      .from(REWARD_CATALOG_IMAGE_BUCKET)
      .remove([path]);

    if (error) {
      logger.warn("Could not remove reward catalog media object", {
        path,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("Exception removing reward catalog media object", {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Delete owned Storage objects that are no longer referenced by path
 * (ignores cache-bust query differences on the same object).
 */
export async function cleanupUnreferencedRewardCatalogMedia(
  rewardId: string,
  previousUrls: string[],
  nextUrls: string[],
): Promise<void> {
  const orphans = unreferencedOwnedRewardCatalogPaths(
    rewardId,
    previousUrls,
    nextUrls,
  );
  for (const path of orphans) {
    await deleteRewardCatalogImage(path);
  }
}
