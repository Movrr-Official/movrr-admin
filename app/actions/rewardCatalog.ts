"use server";

import { revalidatePath } from "next/cache";

import { requireCapability } from "@/lib/admin";
import { shouldUseMockData } from "@/lib/dataSource";
import { logger } from "@/lib/logger";
import {
  enforceApprovalSod,
  recordEntityInitiator,
} from "@/features/authorization/sodEnforcement";
import {
  cleanupUnreferencedRewardCatalogMedia,
  deleteRewardCatalogImage,
  nextRewardCatalogGallerySlot,
  parseOwnedRewardCatalogMediaPath,
  REWARD_CATALOG_GALLERY_MAX_ITEMS,
  resolveRewardCatalogGalleryReplaceSlot,
  resolveRewardCatalogUploadMime,
  sameRewardCatalogMediaSet,
  uploadRewardCatalogGalleryImage as putGalleryObject,
  uploadRewardCatalogThumbnail as putThumbnailObject,
} from "@/lib/rewardCatalogImage";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  RewardCatalogFilters,
  RewardCatalogItem,
  upsertRewardCatalogSchema,
} from "@/schemas";
import { z } from "zod";

const publishRewardSchema = z.object({
  id: z.string(),
  status: z.enum(["active", "paused", "archived"]),
});

const toggleFeaturedSchema = z.object({
  id: z.string(),
  isFeatured: z.boolean(),
  featuredRank: z.number().int().optional(),
});

const mapCatalogRow = (row: any): RewardCatalogItem => {
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    status: row.status,
    pointsPrice: Number(row.points_price ?? 0),
    partnerId: row.partner_id ?? undefined,
    partnerName: row.partner?.name ?? undefined,
    partnerUrl: row.partner_url ?? row.partner?.website ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    galleryUrls: (row.gallery_urls ?? []) as string[],
    inventoryType: row.inventory_type ?? "unlimited",
    inventoryCount:
      row.inventory_count !== null ? Number(row.inventory_count) : undefined,
    maxPerRider: row.max_per_rider ?? undefined,
    featuredRank:
      row.featured_rank !== null ? Number(row.featured_rank) : undefined,
    isFeatured: Boolean(row.is_featured ?? false),
    visibilityRules: row.visibility_rules ?? {},
    tags: row.tags ?? [],
    fulfilmentType: row.fulfilment_type ?? null,
    resourceId: row.resource_id ?? null,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Catalog partner upsert + reverse sync to Platform `organisation`.
 * Ensures reward_partner.organisation_id is linked (045 dual-write reverse).
 */
const upsertPartner = async (name?: string, website?: string) => {
  if (!name) return undefined;
  const supabaseAdmin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const ensureOrganisationLink = async (
    partnerId: string,
    organisationId: string | null,
  ): Promise<string> => {
    if (organisationId) return partnerId;

    const { data: existingOrg } = await supabaseAdmin
      .from("organisation")
      .select("id")
      .eq("type", "reward_partner")
      .ilike("name", name)
      .maybeSingle();

    let orgId = existingOrg?.id as string | undefined;
    if (!orgId) {
      const { data: createdOrg, error: orgError } = await supabaseAdmin
        .from("organisation")
        .insert({
          name,
          type: "reward_partner",
          status: "active",
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();
      if (orgError) throw orgError;
      orgId = createdOrg.id as string;
    }

    const { error: linkError } = await supabaseAdmin
      .from("reward_partner")
      .update({ organisation_id: orgId, updated_at: now })
      .eq("id", partnerId);
    if (linkError) throw linkError;
    return partnerId;
  };

  const { data: existing } = await supabaseAdmin
    .from("reward_partner")
    .select("id, organisation_id")
    .ilike("name", name)
    .maybeSingle();

  if (existing?.id) {
    if (website) {
      await supabaseAdmin
        .from("reward_partner")
        .update({ website, updated_at: now })
        .eq("id", existing.id);
    }
    return ensureOrganisationLink(
      existing.id as string,
      (existing.organisation_id as string | null) ?? null,
    );
  }

  const { data: createdOrg, error: orgError } = await supabaseAdmin
    .from("organisation")
    .insert({
      name,
      type: "reward_partner",
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (orgError) throw orgError;

  const { data: created, error } = await supabaseAdmin
    .from("reward_partner")
    .insert({
      name,
      website: website ?? null,
      status: "active",
      organisation_id: createdOrg.id,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) throw error;
  return created.id as string;
};

export async function getRewardCatalog(
  filters?: RewardCatalogFilters,
): Promise<{ success: boolean; data?: RewardCatalogItem[]; error?: string }> {
  try {
    await requireCapability("rewards.catalog.read");
    const supabaseAdmin = createSupabaseAdminClient();
    let query = supabaseAdmin
      .from("reward_catalog")
      .select(
        "id, sku, title, description, category, status, points_price, partner_id, partner_url, thumbnail_url, gallery_urls, inventory_type, inventory_count, max_per_rider, featured_rank, is_featured, visibility_rules, tags, fulfilment_type, resource_id, published_at, created_at, updated_at, partner:partner_id (id, name, website)",
      )
      .order("updated_at", { ascending: false });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.category) {
      query = query.eq("category", filters.category);
    }
    if (filters?.featured !== undefined) {
      query = query.eq("is_featured", filters.featured);
    }
    if (filters?.searchQuery?.trim()) {
      const q = filters.searchQuery.trim();
      query = query.or(
        `title.ilike.%${q}%,sku.ilike.%${q}%,category.ilike.%${q}%`,
      );
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map(mapCatalogRow),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load reward catalog",
    };
  }
}

export async function upsertRewardCatalog(
  data: z.infer<typeof upsertRewardCatalogSchema>,
): Promise<{ success: boolean; data?: RewardCatalogItem; error?: string }> {
  try {
    const auth = await requireCapability("rewards.manage", { mutation: true });
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = upsertRewardCatalogSchema.parse(data);

    const partnerId = await upsertPartner(
      validatedData.partnerName,
      validatedData.partnerUrl,
    );

    const payload = {
      sku: validatedData.sku,
      title: validatedData.title,
      description: validatedData.description ?? null,
      category: validatedData.category,
      status: validatedData.status ?? "draft",
      points_price: validatedData.pointsPrice,
      partner_id: partnerId ?? null,
      partner_url: validatedData.partnerUrl ?? null,
      thumbnail_url: validatedData.thumbnailUrl ?? null,
      gallery_urls: validatedData.galleryUrls ?? [],
      inventory_type: validatedData.inventoryType ?? "unlimited",
      inventory_count:
        validatedData.inventoryType === "limited"
          ? (validatedData.inventoryCount ?? 0)
          : null,
      max_per_rider: validatedData.maxPerRider ?? null,
      featured_rank: validatedData.featuredRank ?? null,
      is_featured: validatedData.isFeatured ?? false,
      visibility_rules: validatedData.visibilityRules ?? {},
      tags: validatedData.tags ?? [],
      fulfilment_type: validatedData.fulfilmentType ?? null,
      resource_id: validatedData.resourceId ?? null,
      updated_at: new Date().toISOString(),
    };

    const selectColumns =
      "id, sku, title, description, category, status, points_price, partner_id, partner_url, thumbnail_url, gallery_urls, inventory_type, inventory_count, max_per_rider, featured_rank, is_featured, visibility_rules, tags, fulfilment_type, resource_id, published_at, created_at, updated_at, partner:partner_id (id, name, website)";

    let previousMediaUrls: string[] = [];
    if (validatedData.id) {
      const { data: existing } = await supabaseAdmin
        .from("reward_catalog")
        .select("thumbnail_url, gallery_urls")
        .eq("id", validatedData.id)
        .maybeSingle();
      if (existing) {
        previousMediaUrls = [
          existing.thumbnail_url ? String(existing.thumbnail_url) : "",
          ...(((existing.gallery_urls ?? []) as string[]) ?? []),
        ].filter(Boolean);
      }
    }

    const response = validatedData.id
      ? await supabaseAdmin
          .from("reward_catalog")
          .update(payload)
          .eq("id", validatedData.id)
          .select(selectColumns)
          .single()
      : await supabaseAdmin
          .from("reward_catalog")
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          })
          .select(selectColumns)
          .single();

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    const saved = mapCatalogRow(response.data);
    if (!validatedData.id && saved.id) {
      await recordEntityInitiator(supabaseAdmin, {
        adminId: auth.authUser.id,
        entityType: "reward_catalog",
        entityId: saved.id,
        action: "reward_catalog.create",
      });
    }
    if (validatedData.id && previousMediaUrls.length > 0) {
      const nextMediaUrls = [
        saved.thumbnailUrl ?? "",
        ...(saved.galleryUrls ?? []),
      ].filter(Boolean);
      await cleanupUnreferencedRewardCatalogMedia(
        validatedData.id,
        previousMediaUrls,
        nextMediaUrls,
      );
    }

    revalidatePath("/rewards");
    return { success: true, data: saved };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save reward catalog item",
    };
  }
}

export async function updateRewardCatalogStatus(
  data: z.infer<typeof publishRewardSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const validatedData = publishRewardSchema.parse(data);
    const auth =
      validatedData.status === "active"
        ? await requireCapability("rewards.approve", { mutation: true })
        : await requireCapability("rewards.manage", { mutation: true });
    const supabaseAdmin = createSupabaseAdminClient();

    if (validatedData.status === "active") {
      const sodError = await enforceApprovalSod({
        supabase: supabaseAdmin,
        workflowId: "reward_approval",
        entityType: "reward_catalog",
        entityId: validatedData.id,
        approverUserId: auth.authUser.id,
      });
      if (sodError) {
        return { success: false, error: sodError };
      }
    }

    const updatePayload: Record<string, any> = {
      status: validatedData.status,
      updated_at: new Date().toISOString(),
    };

    if (validatedData.status === "active") {
      updatePayload.published_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from("reward_catalog")
      .update(updatePayload)
      .eq("id", validatedData.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/rewards");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update reward status",
    };
  }
}

export async function toggleRewardFeatured(
  data: z.infer<typeof toggleFeaturedSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireCapability("rewards.manage", { mutation: true });
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = toggleFeaturedSchema.parse(data);

    const { error } = await supabaseAdmin
      .from("reward_catalog")
      .update({
        is_featured: validatedData.isFeatured,
        featured_rank: validatedData.featuredRank ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", validatedData.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/rewards");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update featured status",
    };
  }
}

const CATALOG_MEDIA_SELECT = "id, thumbnail_url, gallery_urls, title";

/**
 * Upload or replace the product thumbnail via service-role Storage.
 * Persists the durable public URL into `thumbnail_url`.
 */
export async function uploadRewardCatalogThumbnail(
  rewardId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string; thumbnailUrl?: string }> {
  await requireCapability("rewards.manage", { mutation: true });

  if (shouldUseMockData()) {
    revalidatePath("/rewards");
    return { success: true, thumbnailUrl: "https://example.com/mock-thumb.jpg" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "No image was provided." };
  }

  const bytes = await file.arrayBuffer();
  const validation = resolveRewardCatalogUploadMime(file.type, bytes);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: row, error: loadError } = await supabase
      .from("reward_catalog")
      .select(CATALOG_MEDIA_SELECT)
      .eq("id", rewardId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!row) return { success: false, error: "Reward product not found." };

    const previousUrl = row.thumbnail_url
      ? String(row.thumbnail_url)
      : null;
    const previousPath = previousUrl
      ? parseOwnedRewardCatalogMediaPath(previousUrl)
      : null;

    const { path, publicUrl } = await putThumbnailObject(
      bytes,
      validation.mimeType,
      rewardId,
    );

    const { error: updateError } = await supabase
      .from("reward_catalog")
      .update({
        thumbnail_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rewardId);

    if (updateError) {
      await deleteRewardCatalogImage(path);
      throw updateError;
    }

    if (previousPath && previousPath !== path) {
      await deleteRewardCatalogImage(previousPath);
    }

    revalidatePath("/rewards");
    return { success: true, thumbnailUrl: publicUrl };
  } catch (err) {
    logger.error("Failed to upload reward catalog thumbnail", err, {
      rewardId,
    });
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to upload thumbnail",
    };
  }
}

/**
 * Clear thumbnail_url, then delete owned Storage object if applicable.
 * Record is cleared first so a failed Storage delete cannot break the product page.
 */
export async function removeRewardCatalogThumbnail(
  rewardId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireCapability("rewards.manage", { mutation: true });

  if (shouldUseMockData()) {
    revalidatePath("/rewards");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: row, error: loadError } = await supabase
      .from("reward_catalog")
      .select(CATALOG_MEDIA_SELECT)
      .eq("id", rewardId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!row) return { success: false, error: "Reward product not found." };

    const previousUrl = row.thumbnail_url
      ? String(row.thumbnail_url)
      : null;
    const previousPath = previousUrl
      ? parseOwnedRewardCatalogMediaPath(previousUrl)
      : null;

    const { error: updateError } = await supabase
      .from("reward_catalog")
      .update({
        thumbnail_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rewardId);

    if (updateError) throw updateError;

    if (previousPath) await deleteRewardCatalogImage(previousPath);

    revalidatePath("/rewards");
    return { success: true };
  } catch (err) {
    logger.error("Failed to remove reward catalog thumbnail", err, {
      rewardId,
    });
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to remove thumbnail",
    };
  }
}

/**
 * Append a gallery image, or replace the image at `replaceIndex` (0-based).
 * Slot paths are 1-based (`gallery/1.webp`) matching the audit contract.
 */
export async function uploadRewardCatalogGalleryImage(
  rewardId: string,
  formData: FormData,
  replaceIndex?: number,
): Promise<{ success: boolean; error?: string; galleryUrls?: string[] }> {
  await requireCapability("rewards.manage", { mutation: true });

  if (shouldUseMockData()) {
    revalidatePath("/rewards");
    return { success: true, galleryUrls: [] };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "No image was provided." };
  }

  const bytes = await file.arrayBuffer();
  const validation = resolveRewardCatalogUploadMime(file.type, bytes);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: row, error: loadError } = await supabase
      .from("reward_catalog")
      .select(CATALOG_MEDIA_SELECT)
      .eq("id", rewardId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!row) return { success: false, error: "Reward product not found." };

    const currentGallery = [...((row.gallery_urls ?? []) as string[])];
    const isReplace =
      typeof replaceIndex === "number" &&
      replaceIndex >= 0 &&
      replaceIndex < currentGallery.length;

    if (!isReplace && currentGallery.length >= REWARD_CATALOG_GALLERY_MAX_ITEMS) {
      return {
        success: false,
        error: `Gallery is limited to ${REWARD_CATALOG_GALLERY_MAX_ITEMS} images.`,
      };
    }

    // Slot must come from the object's owned path (or max+1) — never visual index.
    const slot = isReplace
      ? resolveRewardCatalogGalleryReplaceSlot(currentGallery, replaceIndex)
      : nextRewardCatalogGallerySlot(currentGallery);
    const previousUrl = isReplace ? currentGallery[replaceIndex] : null;
    const previousPath = previousUrl
      ? parseOwnedRewardCatalogMediaPath(previousUrl)
      : null;

    const { path, publicUrl } = await putGalleryObject(
      bytes,
      validation.mimeType,
      rewardId,
      slot,
    );

    const nextGallery = isReplace
      ? currentGallery.map((url, index) =>
          index === replaceIndex ? publicUrl : url,
        )
      : [...currentGallery, publicUrl];

    const { error: updateError } = await supabase
      .from("reward_catalog")
      .update({
        gallery_urls: nextGallery,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rewardId);

    if (updateError) {
      await deleteRewardCatalogImage(path);
      throw updateError;
    }

    if (previousPath && previousPath !== path) {
      await deleteRewardCatalogImage(previousPath);
    }

    revalidatePath("/rewards");
    return { success: true, galleryUrls: nextGallery };
  } catch (err) {
    logger.error("Failed to upload reward catalog gallery image", err, {
      rewardId,
      replaceIndex,
    });
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to upload gallery image",
    };
  }
}

export async function removeRewardCatalogGalleryImage(
  rewardId: string,
  index: number,
): Promise<{ success: boolean; error?: string; galleryUrls?: string[] }> {
  await requireCapability("rewards.manage", { mutation: true });

  if (shouldUseMockData()) {
    revalidatePath("/rewards");
    return { success: true, galleryUrls: [] };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: row, error: loadError } = await supabase
      .from("reward_catalog")
      .select(CATALOG_MEDIA_SELECT)
      .eq("id", rewardId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!row) return { success: false, error: "Reward product not found." };

    const currentGallery = [...((row.gallery_urls ?? []) as string[])];
    if (index < 0 || index >= currentGallery.length) {
      return { success: false, error: "Gallery image not found." };
    }

    const removedUrl = currentGallery[index];
    const removedPath = parseOwnedRewardCatalogMediaPath(removedUrl);
    const nextGallery = currentGallery.filter((_, i) => i !== index);

    const { error: updateError } = await supabase
      .from("reward_catalog")
      .update({
        gallery_urls: nextGallery,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rewardId);

    if (updateError) throw updateError;

    if (removedPath) await deleteRewardCatalogImage(removedPath);

    revalidatePath("/rewards");
    return { success: true, galleryUrls: nextGallery };
  } catch (err) {
    logger.error("Failed to remove reward catalog gallery image", err, {
      rewardId,
      index,
    });
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to remove gallery image",
    };
  }
}

/**
 * Persist gallery order only (no Storage moves). Object slots stay stable;
 * `gallery_urls` order is the consumer contract.
 */
export async function reorderRewardCatalogGallery(
  rewardId: string,
  orderedUrls: string[],
): Promise<{ success: boolean; error?: string; galleryUrls?: string[] }> {
  await requireCapability("rewards.manage", { mutation: true });

  if (shouldUseMockData()) {
    revalidatePath("/rewards");
    return { success: true, galleryUrls: orderedUrls };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: row, error: loadError } = await supabase
      .from("reward_catalog")
      .select(CATALOG_MEDIA_SELECT)
      .eq("id", rewardId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!row) return { success: false, error: "Reward product not found." };

    const current = [...((row.gallery_urls ?? []) as string[])];
    if (!sameRewardCatalogMediaSet(orderedUrls, current)) {
      return {
        success: false,
        error: "Gallery reorder must include the same set of images.",
      };
    }

    const { error: updateError } = await supabase
      .from("reward_catalog")
      .update({
        gallery_urls: orderedUrls,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rewardId);

    if (updateError) throw updateError;

    revalidatePath("/rewards");
    return { success: true, galleryUrls: orderedUrls };
  } catch (err) {
    logger.error("Failed to reorder reward catalog gallery", err, {
      rewardId,
    });
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to reorder gallery",
    };
  }
}
