"use server";


import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canAccessSearchableEntity } from "@/lib/search/access";
import { listActiveSearchableEntities } from "@/lib/search/registry";
import { SEARCH_PROVIDERS } from "@/lib/search/providers";
import type { SearchResult } from "@/lib/search/types";

export type { SearchResult } from "@/lib/search/types";

const GLOBAL_RESULT_LIMIT = 12;

/**
 * Cross-entity Admin search.
 * Providers + destinations come from the Searchable Entity Registry.
 * This action must not hardcode module routes.
 */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  if (!query.trim() || query.length < 2) {
    return [];
  }

  try {
    const user = await requireCapability("dashboard.read");
    const role = user.adminUser.role;
    const supabase = createSupabaseAdminClient();
    const q = query.trim();

    const allowedEntities = listActiveSearchableEntities().filter((entity) =>
      canAccessSearchableEntity(entity, role),
    );

    if (allowedEntities.length === 0) {
      return [];
    }

    const settled = await Promise.all(
      allowedEntities.map(async (entity) => {
        const provider = SEARCH_PROVIDERS[entity.type];
        if (!provider) return [] as SearchResult[];

        const hits = await provider(supabase, q, entity.searchLimit);
        return hits.map(
          (hit): SearchResult => ({
            id: hit.id,
            type: entity.type,
            title: hit.title,
            subtitle: hit.subtitle,
            status: hit.status,
            avatarUrl: hit.avatarUrl,
            relevance: hit.relevance,
            href: entity.navigation.href(hit.id),
            navigationStrategy: entity.navigation.strategy,
            label: entity.label,
            icon: entity.icon,
            badgeClassName: entity.badgeClassName,
          }),
        );
      }),
    );

    return settled
      .flat()
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, GLOBAL_RESULT_LIMIT);
  } catch (error) {
    console.error("Global search error:", error);
    return [];
  }
}
