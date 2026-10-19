import "server-only";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";

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
): Promise<ApplicationResult<unknown>> {
  const org = requirePartnerOrg(ctx);
  if (!org.ok) return org;
  const parsed = partnerCatalogCreateSchema.safeParse(body);
  if (!parsed.success) return fail("validation", "An explicit nonnegative points price and valid catalog fields are required");
  const input = parsed.data;

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
  return ok(data);
}

export async function updatePartnerCatalogItem(
  ctx: RequestContext,
  catalogItemId: string,
  body: unknown,
): Promise<ApplicationResult<unknown>> {
  const org = requirePartnerOrg(ctx);
  if (!org.ok) return org;
  const parsed = partnerCatalogUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("validation", "Valid fields and the viewed catalog version are required");
  const input = parsed.data;

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

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.pointsCost !== undefined) update.points_price = input.pointsCost;
  if (input.status !== undefined) update.status = input.status;
  if (input.sku !== undefined) update.sku = input.sku;
  if (input.category !== undefined) update.category = input.category;
  if (input.stockAvailable !== undefined) update.inventory_count = input.stockAvailable;

  const { data, error } = await supabase.rpc("shop_save_catalog", { p_actor: ctx.principal.userId, p_id: catalogItemId, p_payload: update, p_expected: input.expectedUpdatedAt });

  if (error) return fail(error.code === "40001" ? "ConcurrencyConflict" : error.code === "42501" ? "permission_denied" : "BusinessFailure", error.message);
  return ok(data);
}
