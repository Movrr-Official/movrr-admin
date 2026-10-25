import "server-only";
import { z } from "zod";
import { uploadRewardCatalogThumbnail, deleteRewardCatalogImage } from "@/lib/rewardCatalogImage";
import { resolveRewardCatalogUploadMime } from "@/lib/rewardCatalogImageShared";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";

export type PartnerCatalogMedia = { file?: File; remove?: boolean };
// Stay below the existing production function request limit, including multipart overhead.
export const PARTNER_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

async function validateMedia(media?: PartnerCatalogMedia): Promise<string | null> {
  if (media?.file && media.remove) return "Choose an image or remove it, not both";
  if (!media?.file) return null;
  if (media.file.size > PARTNER_IMAGE_MAX_BYTES) return "Choose a valid JPEG, PNG or WebP image up to 3 MB.";
  const result = resolveRewardCatalogUploadMime(media.file.type, await media.file.arrayBuffer());
  return result.valid ? null : "Choose a valid JPEG, PNG or WebP image up to 3 MB.";
}

/** Parsing runs inside platformRoute, after authentication and capability checks. */
export async function readPartnerCatalogRequest(request: Request): Promise<{ body: unknown; media?: PartnerCatalogMedia }> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return { body: await request.json().catch(() => null) };
  }
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024) return { body: null };
  try {
    const form = await request.formData();
    const file = form.get("imageFile");
    return { body: JSON.parse(String(form.get("payload"))), media: {
      ...(file instanceof File && file.size > 0 ? { file } : {}), remove: form.get("removeImage") === "true",
    } };
  } catch { return { body: null }; }
}


export const partnerCatalogCreateSchema = z.object({
  title: z.string().trim().min(3).max(300), description: z.string().max(10000).optional(),
  pointsCost: z.number().int().nonnegative(), status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  sku: z.string().min(3).max(200).optional(), category: z.string().min(1).max(100).optional(), stockAvailable: z.number().int().nonnegative().optional(),
}).strict();
export const partnerCatalogUpdateSchema = partnerCatalogCreateSchema.partial().extend({ expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict();
export type PartnerCatalogWriteInput = z.infer<typeof partnerCatalogCreateSchema>;

function requirePartnerOrg(ctx: RequestContext): ApplicationResult<{ organisationId: string }> {
  if (ctx.principal.type !== "organisation") {
    return fail("permission_denied", "Partner organisation required");
  }
  if (ctx.principal.organisationType && ctx.principal.organisationType !== "reward_partner") {
    return fail("permission_denied", "Reward partner organisation required");
  }
  return ok({ organisationId: ctx.principal.organisationId });
}

async function resolvePartnerId(organisationId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("reward_partner")
    .select("id")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function createPartnerCatalogItem(
  ctx: RequestContext,
  body: unknown,
  media?: PartnerCatalogMedia,
): Promise<ApplicationResult<unknown>> {
  const org = requirePartnerOrg(ctx);
  if (!org.ok) return org;
  const parsed = partnerCatalogCreateSchema.safeParse(body);
  if (!parsed.success) return fail("validation", "An explicit nonnegative points price and valid catalog fields are required");
  const input = parsed.data;
  const mediaError = await validateMedia(media);
  if (mediaError) return fail("validation", mediaError);

  const partnerId = await resolvePartnerId(org.value.organisationId);
  if (!partnerId) return fail("BusinessFailure", "Partner profile not found");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("shop_save_catalog", { p_actor: ctx.principal.userId, p_id: null, p_payload: {
    title: input.title, description: input.description ?? "", points_price: input.pointsCost,
    status: input.status ?? "draft", sku: input.sku ?? `PARTNER-${crypto.randomUUID()}`,
    category: input.category ?? "voucher", partner_id: partnerId,
    inventory_type: input.stockAvailable === undefined ? "unlimited" : "limited",
    inventory_count: input.stockAvailable ?? null,
  }});

  if (error) return fail(error.code === "40001" ? "ConcurrencyConflict" : error.code === "42501" ? "permission_denied" : "BusinessFailure", error.message);
  if (media?.file && data && typeof data === "object" && "id" in data && "updated_at" in data) {
    try {
      const attached = await updatePartnerCatalogItem(ctx, String(data.id), { expectedUpdatedAt: data.updated_at }, media);
      if (attached.ok) return attached;
    } catch { /* The saved draft remains available for a safe retry. */ }
    return ok({ ...data, imageUploadFailed: true });
  }
  return ok(data);
}

export async function updatePartnerCatalogItem(
  ctx: RequestContext,
  catalogItemId: string,
  body: unknown,
  media?: PartnerCatalogMedia,
): Promise<ApplicationResult<unknown>> {
  const org = requirePartnerOrg(ctx);
  if (!org.ok) return org;
  const parsed = partnerCatalogUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("validation", "Valid fields and the viewed catalog version are required");
  const input = parsed.data;
  const mediaError = await validateMedia(media);
  if (mediaError) return fail("validation", mediaError);

  const partnerId = await resolvePartnerId(org.value.organisationId);
  if (!partnerId) return fail("BusinessFailure", "Partner profile not found");

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase
    .from("reward_catalog")
    .select("partner_id, updated_at")
    .eq("id", catalogItemId)
    .maybeSingle();

  if (!existing || existing.partner_id !== partnerId) {
    return fail("permission_denied", "Catalog item not owned by partner");
  }

  if (existing.updated_at !== input.expectedUpdatedAt) return fail("ConcurrencyConflict", "Catalog changed. Refresh before saving.");
  let uploaded: { path: string; publicUrl: string } | undefined;
  if (media?.file) {
    try { uploaded = await uploadRewardCatalogThumbnail(await media.file.arrayBuffer(), media.file.type as "image/jpeg" | "image/png" | "image/webp", catalogItemId); }
    catch { return fail("InfrastructureFailure", "Image could not be uploaded. Please try again."); }
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (uploaded) update.thumbnail_url = uploaded.publicUrl;
  else if (media?.remove) update.thumbnail_url = null;
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.pointsCost !== undefined) update.points_price = input.pointsCost;
  if (input.status !== undefined) update.status = input.status;
  if (input.sku !== undefined) update.sku = input.sku;
  if (input.category !== undefined) update.category = input.category;
  if (input.stockAvailable !== undefined) update.inventory_count = input.stockAvailable;

  const { data, error } = await supabase.rpc("shop_save_catalog", { p_actor: ctx.principal.userId, p_id: catalogItemId, p_payload: update, p_expected: input.expectedUpdatedAt });

  if (error) {
    if (uploaded) await deleteRewardCatalogImage(uploaded.path);
    return fail(error.code === "40001" ? "ConcurrencyConflict" : error.code === "42501" ? "permission_denied" : "BusinessFailure", error.message);
  }
  // Existing assets may also be gallery references: never delete them during replacement.
  return ok(data);
}
