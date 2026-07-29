import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  CatalogItem,
  CatalogRepository,
} from "@/features/rewards/application/contracts/RedeemRewardCommand";
import type { FulfilmentType } from "@/features/fulfilment/domain/Fulfilment";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createSupabaseCatalogRepository(): CatalogRepository {
  return {
    async getById(id) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("reward_catalog")
        .select(
          "id, sku, title, status, points_price, fulfilment_type, resource_id, partner_id",
        )
        .eq("id", id)
        .maybeSingle();
      throwOnError(error, "catalog.getById");
      if (!data) return null;

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

      const item: CatalogItem = {
        id: String(data.id),
        sku: String(data.sku),
        title: String(data.title),
        status: String(data.status),
        fulfilmentType: (data.fulfilment_type as FulfilmentType | null) ?? null,
        pointsPrice: Number(data.points_price ?? 0),
        resourceId: (data.resource_id as string | null) ?? null,
        partnerOrgId,
      };
      return item;
    },
  };
}
