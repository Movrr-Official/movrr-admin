"use server";

import { revalidatePath } from "next/cache";
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
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const upsertPartner = async (name?: string, website?: string) => {
  if (!name) return undefined;
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: existing } = await supabaseAdmin
    .from("reward_partner")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("reward_partner")
    .insert({
      name,
      website: website ?? null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
    const supabaseAdmin = createSupabaseAdminClient();
    let query = supabaseAdmin
      .from("reward_catalog")
      .select(
        "id, sku, title, description, category, status, points_price, partner_id, partner_url, thumbnail_url, gallery_urls, inventory_type, inventory_count, max_per_rider, featured_rank, is_featured, visibility_rules, tags, published_at, created_at, updated_at, partner:partner_id (id, name, website)",
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
      updated_at: new Date().toISOString(),
    };

    const response = validatedData.id
      ? await supabaseAdmin
          .from("reward_catalog")
          .update(payload)
          .eq("id", validatedData.id)
          .select(
            "id, sku, title, description, category, status, points_price, partner_id, partner_url, thumbnail_url, gallery_urls, inventory_type, inventory_count, max_per_rider, featured_rank, is_featured, visibility_rules, tags, published_at, created_at, updated_at, partner:partner_id (id, name, website)",
          )
          .single()
      : await supabaseAdmin
          .from("reward_catalog")
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          })
          .select(
            "id, sku, title, description, category, status, points_price, partner_id, partner_url, thumbnail_url, gallery_urls, inventory_type, inventory_count, max_per_rider, featured_rank, is_featured, visibility_rules, tags, published_at, created_at, updated_at, partner:partner_id (id, name, website)",
          )
          .single();

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    revalidatePath("/rewards");
    return { success: true, data: mapCatalogRow(response.data) };
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
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = publishRewardSchema.parse(data);

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
