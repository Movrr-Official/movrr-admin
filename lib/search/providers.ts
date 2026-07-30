import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SearchProviderHit,
  SearchableEntityType,
} from "@/lib/search/types";

type AdminClient = SupabaseClient;

export type SearchProvider = (
  client: AdminClient,
  query: string,
  limit: number,
) => Promise<SearchProviderHit[]>;

function scoreIncludes(
  haystack: string | null | undefined,
  needle: string,
): number {
  if (!haystack) return 0;
  return haystack.toLowerCase().includes(needle.toLowerCase()) ? 1 : 0;
}

/** Strip PostgREST/LIKE metacharacters from user input before building patterns. */
function sanitizeQueryFragment(value: string): string {
  return value.replace(/[%_,.()]/g, " ").replace(/\s+/g, " ").trim();
}

function ilikePattern(query: string): string | null {
  const fragment = sanitizeQueryFragment(query);
  if (!fragment) return null;
  return `%${fragment}%`;
}

/**
 * Per-entity search providers. Add a provider here and set `searchable: true`
 * on the registry entry — SearchDialog does not need changes.
 *
 * No dedicated search index: Admin-scale live queries are sufficient. Replace
 * a provider body with an RPC/index call if a table grows past acceptable
 * `.ilike` performance — keep the same `SearchProviderHit` contract.
 */
export const SEARCH_PROVIDERS: Partial<
  Record<SearchableEntityType, SearchProvider>
> = {
  user: async (supabase, query, limit) => {
    const searchTerm = ilikePattern(query);
    if (!searchTerm) return [];

    const { data, error } = await supabase
      .from("user")
      .select("id, name, email, avatar_url, role, status")
      .or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`)
      .limit(limit);

    if (error || !data) return [];

    return data.map((user) => {
      const relevance =
        scoreIncludes(user.name, query) * 3 +
        scoreIncludes(user.email, query) * 2;
      return {
        id: user.id,
        title: user.name || "User",
        subtitle: user.email ?? undefined,
        status: user.status ?? user.role ?? undefined,
        avatarUrl: user.avatar_url ?? undefined,
        relevance,
      };
    });
  },

  campaign: async (supabase, query, limit) => {
    const searchTerm = ilikePattern(query);
    if (!searchTerm) return [];

    const { data, error } = await supabase
      .from("campaign")
      .select("id, name, description, lifecycle_status")
      .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
      .limit(limit);

    if (error || !data) return [];

    return data.map((campaign) => {
      const relevance =
        scoreIncludes(campaign.name, query) * 3 +
        scoreIncludes(campaign.description, query) * 2;
      return {
        id: campaign.id,
        title: campaign.name || "Campaign",
        subtitle: campaign.description ?? undefined,
        status: campaign.lifecycle_status ?? undefined,
        relevance,
      };
    });
  },

  rider: async (supabase, query, limit) => {
    const trimmed = query.trim();
    const searchTerm = ilikePattern(trimmed);
    if (!searchTerm) return [];
    const qLower = trimmed.toLowerCase();

    const [{ data: cityMatches }, { data: matchingUsers }] = await Promise.all([
      supabase
        .from("rider")
        .select(
          "id, status, city, user_id, user:user_id (name, email, avatar_url)",
        )
        .ilike("city", searchTerm)
        .limit(limit),
      supabase
        .from("user")
        .select("id")
        .or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .limit(Math.max(limit * 2, 16)),
    ]);

    const userIds = (matchingUsers ?? []).map((u) => u.id);
    let identityMatches: typeof cityMatches = [];

    if (userIds.length > 0) {
      const { data } = await supabase
        .from("rider")
        .select(
          "id, status, city, user_id, user:user_id (name, email, avatar_url)",
        )
        .in("user_id", userIds)
        .limit(limit);
      identityMatches = data ?? [];
    }

    const byId = new Map<string, NonNullable<typeof cityMatches>[number]>();
    for (const row of [...(cityMatches ?? []), ...identityMatches]) {
      byId.set(row.id, row);
    }

    return Array.from(byId.values())
      .map((rider) => {
        const riderUser = Array.isArray(rider.user) ? rider.user[0] : rider.user;
        const name = riderUser?.name ?? "";
        const email = riderUser?.email ?? "";
        const city = rider.city ?? "";
        const relevance =
          (name.toLowerCase().includes(qLower) ? 3 : 0) +
          (email.toLowerCase().includes(qLower) ? 2 : 0) +
          (city.toLowerCase().includes(qLower) ? 1 : 0);

        const subtitleParts = [email, city ? `City: ${city}` : null].filter(
          Boolean,
        ) as string[];

        return {
          id: rider.id,
          title: name || "Rider",
          subtitle: subtitleParts.join(" · ") || undefined,
          status: rider.status ?? undefined,
          avatarUrl: riderUser?.avatar_url ?? undefined,
          relevance,
        };
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  },

  advertiser: async (supabase, query, limit) => {
    const searchTerm = ilikePattern(query);
    if (!searchTerm) return [];

    const { data, error } = await supabase
      .from("advertiser")
      .select("id, company_name, company_email, industry, verified")
      .or(
        `company_name.ilike.${searchTerm},company_email.ilike.${searchTerm},industry.ilike.${searchTerm}`,
      )
      .limit(limit);

    if (error || !data) return [];

    return data.map((advertiser) => {
      const relevance =
        scoreIncludes(advertiser.company_name, query) * 3 +
        scoreIncludes(advertiser.company_email, query) * 2 +
        scoreIncludes(advertiser.industry, query);
      return {
        id: advertiser.id,
        title: advertiser.company_name || "Advertiser",
        subtitle: advertiser.company_email ?? advertiser.industry ?? undefined,
        status: advertiser.verified ? "verified" : undefined,
        relevance,
      };
    });
  },

  partner: async (supabase, query, limit) => {
    const searchTerm = ilikePattern(query);
    if (!searchTerm) return [];

    const { data, error } = await supabase
      .from("organisation")
      .select("id, name, status, type")
      .eq("type", "reward_partner")
      .ilike("name", searchTerm)
      .limit(limit);

    if (error || !data) return [];

    return data.map((org) => ({
      id: org.id,
      title: org.name || "Partner",
      subtitle: "Reward partner",
      status: org.status ?? undefined,
      relevance: scoreIncludes(org.name, query) * 3,
    }));
  },

  organisation: async (supabase, query, limit) => {
    const searchTerm = ilikePattern(query);
    if (!searchTerm) return [];

    // Partners are searched via the dedicated `partner` provider to avoid
    // duplicate Jump/search hits with different destinations.
    const { data, error } = await supabase
      .from("organisation")
      .select("id, name, status, type")
      .neq("type", "reward_partner")
      .ilike("name", searchTerm)
      .limit(limit);

    if (error || !data) return [];

    return data.map((org) => {
      const typeLabel = org.type
        ? String(org.type).replace(/_/g, " ")
        : undefined;
      return {
        id: org.id,
        title: org.name || "Organisation",
        subtitle: typeLabel,
        status: org.status ?? undefined,
        relevance: scoreIncludes(org.name, query) * 3,
      };
    });
  },

  reward_catalog: async (supabase, query, limit) => {
    const searchTerm = ilikePattern(query);
    if (!searchTerm) return [];

    const { data, error } = await supabase
      .from("reward_catalog")
      .select("id, title, description, status, sku, category")
      .or(
        `title.ilike.${searchTerm},description.ilike.${searchTerm},sku.ilike.${searchTerm},category.ilike.${searchTerm}`,
      )
      .limit(limit);

    if (error || !data) return [];

    return data.map((item) => {
      const relevance =
        scoreIncludes(item.title, query) * 3 +
        scoreIncludes(item.sku, query) * 2 +
        scoreIncludes(item.category, query) +
        scoreIncludes(item.description, query);
      return {
        id: item.id,
        title: item.title || "Reward",
        subtitle:
          [item.sku, item.category].filter(Boolean).join(" · ") ||
          item.description ||
          undefined,
        status: item.status ?? undefined,
        relevance,
      };
    });
  },
};
