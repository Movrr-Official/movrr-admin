import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  CatalogItem,
  CatalogRepository,
} from "@/features/rewards/application/contracts/RedeemRewardCommand";
import type { CatalogListPort } from "@/features/rewards/application/queries/catalogAndRedemptions";
import type { FulfilmentType } from "@/features/fulfilment/domain/Fulfilment";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

async function mapCatalogRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  data: {
    thumbnail_url?: string | null;
    description?: string;
    category?: string;
    inventory_count?: number | null;
    updated_at?: string;
    id: string;
    sku: string;
    title: string;
    status: string;
    points_price: number | null;
    fulfilment_type: string | null;
    resource_id: string | null;
    partner_id: string | null;
  },
): Promise<CatalogItem> {
  let partnerOrgId: string | null = null;
  if (data.partner_id) {
    const { data: partner } = await supabase
      .from("reward_partner")
      .select("organisation_id")
      .eq("id", data.partner_id)
      .maybeSingle();
    partnerOrgId =
      (partner?.organisation_id as string | null | undefined) ?? null;
  }

  return {
    thumbnailUrl: data.thumbnail_url ?? null,
    description: data.description, category: data.category, inventoryCount: data.inventory_count, updatedAt: data.updated_at,
    id: String(data.id),
    sku: String(data.sku),
    title: String(data.title),
    status: String(data.status),
    fulfilmentType: (data.fulfilment_type as FulfilmentType | null) ?? null,
    pointsPrice: Number(data.points_price ?? 0),
    resourceId: (data.resource_id as string | null) ?? null,
    partnerOrgId,
  };
}

const CATALOG_COLUMNS =
  "id, sku, title, status, points_price, fulfilment_type, resource_id, partner_id, description, category, inventory_count, updated_at, thumbnail_url";

export function createSupabaseCatalogRepository(): CatalogRepository &
  CatalogListPort & { listForPartner: (organisationId: string) => Promise<CatalogItem[]> } {
  return {
    async listForPartner(organisationId) {
      const supabase = createSupabaseAdminClient();
      const { data: partner, error: partnerError } = await supabase.from("reward_partner").select("id").eq("organisation_id", organisationId).maybeSingle();
      throwOnError(partnerError, "catalog.partner");
      if (!partner) return [];
      const { data, error } = await supabase.from("reward_catalog").select(CATALOG_COLUMNS).eq("partner_id", partner.id).order("updated_at", { ascending: false });
      throwOnError(error, "catalog.partnerList");
      return Promise.all((data ?? []).map(row => mapCatalogRow(supabase, row)));
    },
    async getById(id) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("reward_catalog")
        .select(CATALOG_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      throwOnError(error, "catalog.getById");
      if (!data) return null;
      return mapCatalogRow(supabase, data);
    },

    async list() {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("reward_catalog")
        .select(CATALOG_COLUMNS)
        .eq("status", "active")
        .order("updated_at", { ascending: false });
      throwOnError(error, "catalog.list");
      const rows = data ?? [];
      const items: CatalogItem[] = [];
      for (const row of rows) {
        items.push(await mapCatalogRow(supabase, row));
      }
      return items;
    },
  };
}
