/**
 * Community ride cover images — admin side.
 *
 * The rider app writes cover images to the same bucket, so the PATH CONTRACT here is not
 * an admin implementation detail: it must match the mobile app's exactly, or the two will
 * write different objects for the same ride and the last one to save wins silently.
 *
 * The contract, defined by the mobile app in lib/utils/communityRideImageUpload.ts:
 *
 *   bucket : community-rides       (public read, owner-scoped write)
 *   path   : {organizerUserId}/{rideId}/cover.{ext}
 *
 * The first segment is the ORGANISER's user id, not the admin's. That is what makes the
 * bucket's owner-scoped write policy work for riders, and it means a rider can later
 * replace a cover an admin set for them from their own phone. The path is deterministic
 * so a re-upload upserts over the previous object rather than accumulating orphans.
 *
 * Admin writes through the service-role client, which bypasses RLS and Storage policies —
 * so an admin can set a cover on a ride they do not organise. That is the point of an
 * admin tool, but it is also why the path must still be the organiser's: the object has
 * to remain reachable and replaceable by the rider who owns the ride.
 */

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";

export const COMMUNITY_RIDE_IMAGE_BUCKET = "community-rides";

/** 5 MB — matches the bucket's server-side file_size_limit and the mobile app's cap. */
export const COMMUNITY_RIDE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** GIF is intentionally excluded, matching mobile. */
export const COMMUNITY_RIDE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type CommunityRideAllowedMimeType =
  (typeof COMMUNITY_RIDE_ALLOWED_MIME_TYPES)[number];

export type CommunityRideImageValidation =
  | { valid: true; mimeType: CommunityRideAllowedMimeType }
  | { valid: false; error: string };

function extensionFor(mimeType: CommunityRideAllowedMimeType): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

export function buildCommunityRideImagePath(
  organizerUserId: string,
  rideId: string,
  mimeType: CommunityRideAllowedMimeType,
): string {
  return `${organizerUserId}/${rideId}/cover.${extensionFor(mimeType)}`;
}

/**
 * Validate a candidate cover before it is uploaded.
 *
 * The browser's reported type and size are the only things available here, and both come
 * from the client — so this is a usability check, not a security boundary. The bucket
 * enforces its own size limit server-side regardless of what we send.
 */
export function validateCommunityRideImage(
  mimeType: string,
  fileSizeBytes: number,
): CommunityRideImageValidation {
  const normalised = mimeType.toLowerCase();

  if (
    !COMMUNITY_RIDE_ALLOWED_MIME_TYPES.includes(
      normalised as CommunityRideAllowedMimeType,
    )
  ) {
    return {
      valid: false,
      error: `Unsupported file type "${mimeType}". Choose a JPEG, PNG, or WebP image.`,
    };
  }

  if (fileSizeBytes > COMMUNITY_RIDE_IMAGE_MAX_BYTES) {
    const maxMb = (COMMUNITY_RIDE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    const actualMb = (fileSizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Image is too large (${actualMb} MB). The maximum is ${maxMb} MB.`,
    };
  }

  return {
    valid: true,
    mimeType: normalised as CommunityRideAllowedMimeType,
  };
}

export interface CommunityRideImageUploadResult {
  path: string;
  publicUrl: string;
}

/**
 * Upload a cover image and return the storage path and public URL.
 *
 * Takes the file's bytes rather than a stream: this runs in a Next server action, where
 * the uploaded `File` has already been buffered, so there is nothing to gain from
 * streaming and an ArrayBuffer is what supabase-js wants anyway.
 */
export async function uploadCommunityRideImage(
  bytes: ArrayBuffer,
  mimeType: CommunityRideAllowedMimeType,
  organizerUserId: string,
  rideId: string,
): Promise<CommunityRideImageUploadResult> {
  const supabase = createSupabaseAdminClient();
  const path = buildCommunityRideImagePath(organizerUserId, rideId, mimeType);

  const { error } = await supabase.storage
    .from(COMMUNITY_RIDE_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (error) {
    logger.error("Community ride cover upload failed", error, {
      rideId,
      organizerUserId,
      path,
    });
    throw new Error(`Cover image could not be uploaded: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(COMMUNITY_RIDE_IMAGE_BUCKET)
    .getPublicUrl(path);

  return { path, publicUrl: data.publicUrl };
}

/**
 * Remove a cover object.
 *
 * Fails soft: a storage cleanup that fails must not shadow the caller's real error, and
 * must not leave the ride record wrong. Callers clear the DB columns regardless — an
 * orphaned object is a tidiness problem; a ride pointing at an image that no longer
 * exists is a broken page.
 */
export async function deleteCommunityRideImage(path: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage
      .from(COMMUNITY_RIDE_IMAGE_BUCKET)
      .remove([path]);

    if (error) {
      logger.warn("Could not remove community ride cover object", {
        path,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("Exception removing community ride cover object", {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
