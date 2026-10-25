import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
function throwOnError(error: { message: string } | null, action: string) { if(error) throw new Error(`${action}: ${error.message}`); }
export async function listFulfilmentResources(filter?: {
  partnerOrgId?: string | null;
}): Promise<
  Array<{
    id: string;
    name: string;
    resourceKind: string;
    status: string;
    partnerOrgId: string | null;
    availableCount: number;
    thumbnailUrl: string | null;
  }>
> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("fulfilment_resource")
    .select("id, name, resource_kind, status, partner_org_id, catalog:reward_catalog!catalog_item_id(thumbnail_url, partner:reward_partner!partner_id(organisation_id))")
    .order("created_at", { ascending: false });
  if (filter?.partnerOrgId) {
    query = query.eq("partner_org_id", filter.partnerOrgId);
  }
  const { data, error } = await query;
  throwOnError(error, "listResources");

  const resources = data ?? [];
  const result = [];
  for (const resource of resources) {
    const { data: count, error: countError } = await supabase.rpc("shop_resource_available_count", { p_resource: resource.id });
    throwOnError(countError, "listResources.availableCount");
    const catalog = Array.isArray(resource.catalog) ? resource.catalog[0] : resource.catalog;
    // Never disclose an image linked to a different merchant's catalog item.
    const partner = Array.isArray(catalog?.partner) ? catalog.partner[0] : catalog?.partner;
    const thumbnailUrl = resource.partner_org_id && partner?.organisation_id === resource.partner_org_id
      && typeof catalog.thumbnail_url === "string" ? catalog.thumbnail_url : null;
    result.push({
      thumbnailUrl,
      id: String(resource.id),
      name: String(resource.name),
      resourceKind: String(resource.resource_kind),
      status: String(resource.status),
      partnerOrgId: (resource.partner_org_id as string | null) ?? null,
      availableCount: count ?? 0,
    });
  }
  return result;
}
