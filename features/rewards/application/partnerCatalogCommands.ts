import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";

export type PartnerCatalogWriteInput = {
  title: string;
  description?: string;
  pointsCost: number;
  status?: "draft" | "active" | "paused" | "archived";
  sku?: string;
  category?: string;
  stockAvailable?: number;
};

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
  input: PartnerCatalogWriteInput,
): Promise<ApplicationResult<unknown>> {
  const org = requirePartnerOrg(ctx);
  if (!org.ok) return org;

  const partnerId = await resolvePartnerId(org.value.organisationId);
  if (!partnerId) return fail("BusinessFailure", "Partner profile not found");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("reward_catalog")
    .insert({
      title: input.title,
      description: input.description ?? "",
      points_cost: input.pointsCost,
      status: input.status ?? "draft",
      sku: input.sku ?? null,
      category: input.category ?? null,
      partner_id: partnerId,
      stock_available: input.stockAvailable ?? null,
    })
    .select()
    .single();

  if (error) return fail("BusinessFailure", error.message);
  return ok(data);
}

export async function updatePartnerCatalogItem(
  ctx: RequestContext,
  catalogItemId: string,
  input: Partial<PartnerCatalogWriteInput>,
): Promise<ApplicationResult<unknown>> {
  const org = requirePartnerOrg(ctx);
  if (!org.ok) return org;

  const partnerId = await resolvePartnerId(org.value.organisationId);
  if (!partnerId) return fail("BusinessFailure", "Partner profile not found");

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase
    .from("reward_catalog")
    .select("partner_id")
    .eq("id", catalogItemId)
    .maybeSingle();

  if (!existing || existing.partner_id !== partnerId) {
    return fail("permission_denied", "Catalog item not owned by partner");
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.pointsCost !== undefined) update.points_cost = input.pointsCost;
  if (input.status !== undefined) update.status = input.status;
  if (input.sku !== undefined) update.sku = input.sku;
  if (input.category !== undefined) update.category = input.category;
  if (input.stockAvailable !== undefined) update.stock_available = input.stockAvailable;

  const { data, error } = await supabase
    .from("reward_catalog")
    .update(update)
    .eq("id", catalogItemId)
    .select()
    .single();

  if (error) return fail("BusinessFailure", error.message);
  return ok(data);
}
