import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseRateLimitStore } from "@/features/fraud/infrastructure/supabaseRateLimitStore";
import type { PartnerLocationPort } from "@/features/partners/application/partnerLocationService";
import { PublicLocationSchema, publicLogoUrl } from "@/features/partners/domain/PartnerLocation";
import type { PartnerLocation, PublicPartnerLocation, } from "@/features/partners/domain/PartnerLocation";
type Row = {
    id: string;
    organisation_id: string;
    partner_id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    status: PartnerLocation["status"];
    verified_at: string | null;
    updated_at: string;
};
function map(row: Row, rewardIds: string[] = []): PartnerLocation {
    return {
        id: row.id,
        organisationId: row.organisation_id,
        partnerId: row.partner_id,
        name: row.name,
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
        status: row.status,
        coordinatesVerified: Boolean(row.verified_at),
        rewardIds,
        updatedAt: row.updated_at,
    };
}
const fields = "id,organisation_id,partner_id,name,address,latitude,longitude,status,verified_at,updated_at";
export function createSupabasePartnerLocationPort(): PartnerLocationPort {
    const limits = createSupabaseRateLimitStore({ max: 30, windowMs: 60000, requireAtomic: true });
    return {
        hit: (userId) => limits.hit("partner-discovery:" + userId),
        async list(organisationId, page = { limit: 100 }) {
            let query = createSupabaseAdminClient()
                .from("reward_partner_location")
                .select(fields)
                .eq("organisation_id", organisationId)
                .order("id")
                .limit(page.limit + 1);
            if (page.cursor)
                query = query.gt("id", page.cursor);
            const { data, error } = await query;
            if (error)
                throw new Error(error.message);
            const db = createSupabaseAdminClient();
            const ids = (data ?? []).map((row) => (row as Row).id);
            if (!ids.length)
                return [];
            const { data: links, error: linkError } = await db
                .from("reward_catalog_location")
                .select("location_id,catalog_item_id")
                .in("location_id", ids);
            if (linkError)
                throw new Error(linkError.message);
            return (data ?? []).map((row) => map(row as Row, (links ?? [])
                .filter((link) => link.location_id === (row as Row).id)
                .map((link) => link.catalog_item_id)));
        },
        async save(organisationId, input, actor, correlationId) {
            const client = createSupabaseAdminClient();
            const { data, error } = input.id
              ? await client.rpc("save_partner_location", {
                p_org: organisationId,
                p_input: input,
                p_actor: actor,
                p_correlation: correlationId,
            }) : await client.rpc("admin_create", {
                p_actor: actor, p_operation: input.operationId ?? randomUUID(), p_kind: "partner_location",
                p_input: { organisationId, location: input },
            });
            if (error)
                throw new Error(error.message);
            return map(data as Row, input.rewardIds);
        },
        async discover(bounds) {
            const db = createSupabaseAdminClient();
            let query = db
                .from("reward_partner_location")
                .select(fields +
                ",partner:reward_partner!inner(id,name,logo_url,status,business_category),organisation:organisation!inner(id,type,status)")
                .eq("status", "published")
                .not("verified_at", "is", null)
                .eq("partner.status", "active")
                .eq("organisation.status", "active")
                .eq("organisation.type", "reward_partner")
                .gte("latitude", bounds.south)
                .lte("latitude", bounds.north)
                .gte("longitude", bounds.west)
                .lte("longitude", bounds.east)
                .order("id")
                .limit(bounds.limit + 1);
            if (bounds.cursor)
                query = query.gt("id", bounds.cursor);
            const { data, error } = await query;
            if (error)
                throw new Error(error.message);
            const rows = (data ?? []) as unknown as (Row & {
                partner: {
                    name: string;
                    logo_url: string | null;
                    business_category: string | null;
                };
            })[];
            if (!rows.length)
                return [];
            const { data: links, error: linksError } = await db
                .from("reward_catalog_location")
                .select("location_id,item:reward_catalog!inner(id,title,points_price,status,partner_id)")
                .in("location_id", rows.map((row) => row.id))
                .eq("item.status", "active");
            if (linksError)
                throw new Error(linksError.message);
            return rows.flatMap((raw) => {
                const row = raw as unknown as Row & {
                    partner: {
                        name: string;
                        logo_url: string | null;
                    business_category: string | null;
                    };
                };
                if (row.latitude == null ||
                    row.longitude == null ||
                    !Number.isFinite(row.latitude) ||
                    !Number.isFinite(row.longitude))
                    return [];
                const rewards = (links ?? []).flatMap((link) => {
                    const item = link.item as unknown as {
                        id: string;
                        title: string;
                        points_price: number;
                        partner_id: string;
                    };
                    return link.location_id === row.id &&
                        item.partner_id === row.partner_id
                        ? [
                            {
                                id: item.id,
                                title: item.title,
                                pointsPrice: Number(item.points_price),
                            },
                        ]
                        : [];
                });
                return [
                    PublicLocationSchema.parse({
                        id: row.id,
                        organisationId: row.organisation_id,
                        partnerId: row.partner_id,
                        partnerName: row.partner.name,
                        businessCategory: row.partner.business_category ?? null,
                        logoUrl: publicLogoUrl(row.partner.logo_url),
                        name: row.name,
                        address: row.address,
                        latitude: row.latitude,
                        longitude: row.longitude,
                        updatedAt: row.updated_at,
                        rewards: rewards.slice(0, 30),
                    } satisfies PublicPartnerLocation),
                ];
            });
        },
    };
}
