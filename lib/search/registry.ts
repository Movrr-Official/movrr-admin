import { ADMIN_ENTITY_ROUTES } from "@/lib/adminEntityRoutes";
import { FULFILMENT_ROUTES, REWARDS_ROUTES } from "@/lib/adminIaRoutes";
import type {
  SearchableEntityDefinition,
  SearchableEntityType,
} from "@/lib/search/types";

/**
 * Single source of truth for searchable Admin entities.
 * Global Search consumes this registry — it must not hardcode destinations.
 *
 * Paths follow existing Admin IA (drawer `?id=` or dedicated detail pages).
 * Hypothesized aliases like `/partner-operations` are intentionally not used.
 *
 * ## Extending Global Search
 *
 * 1. Add a `SearchableEntityType` in `lib/search/types.ts`.
 * 2. Register the entity here with label, icon, access, navigation.href,
 *    navigation.listHref, and `searchable: true` when ready to query.
 * 3. Implement a provider in `lib/search/providers.ts` (table/RPC + mapping).
 * 4. Add an icon key in `lib/search/icons.ts` if needed.
 *
 * SearchDialog does not require changes for new entity types — it navigates
 * via `result.href` and renders registry metadata only.
 *
 * ## Search index
 *
 * Live Supabase `.ilike` with per-entity caps (8) and a global cap (12) is
 * intentional at current Admin scale. Providers are the swap point for a
 * dedicated index/RPC if latency or cardinality later require it.
 */
export const SEARCHABLE_ENTITY_REGISTRY: Record<
  SearchableEntityType,
  SearchableEntityDefinition
> = {
  user: {
    type: "user",
    label: "User",
    pluralLabel: "users",
    icon: "user",
    badgeClassName: "text-warning bg-warning/15 border-warning/20",
    access: {
      roles: ["admin", "super_admin"],
      permission: "users:read",
    },
    navigation: {
      strategy: "drawer-query",
      href: ADMIN_ENTITY_ROUTES.userDetail,
      listHref: ADMIN_ENTITY_ROUTES.users,
    },
    searchable: true,
    searchLimit: 8,
  },
  campaign: {
    type: "campaign",
    label: "Campaign",
    pluralLabel: "campaigns",
    icon: "megaphone",
    badgeClassName: "text-success bg-success/12 border-success/20",
    access: {
      roles: ["admin", "super_admin"],
      permission: "campaigns:read",
    },
    navigation: {
      strategy: "drawer-query",
      href: ADMIN_ENTITY_ROUTES.campaignDetail,
      listHref: ADMIN_ENTITY_ROUTES.campaigns,
    },
    searchable: true,
    searchLimit: 8,
  },
  rider: {
    type: "rider",
    label: "Rider",
    pluralLabel: "riders",
    icon: "bike",
    badgeClassName: "text-primary bg-primary/10 border-primary/20",
    access: {
      roles: ["admin", "super_admin"],
      permission: "users:read",
    },
    navigation: {
      strategy: "drawer-query",
      href: ADMIN_ENTITY_ROUTES.riderDetail,
      listHref: ADMIN_ENTITY_ROUTES.riders,
    },
    searchable: true,
    searchLimit: 8,
  },
  advertiser: {
    type: "advertiser",
    label: "Advertiser",
    pluralLabel: "advertisers",
    icon: "building",
    badgeClassName: "text-secondary-foreground bg-secondary border-border",
    access: {
      roles: ["admin", "super_admin"],
      permission: "campaigns:read",
    },
    navigation: {
      strategy: "drawer-query",
      href: ADMIN_ENTITY_ROUTES.advertiserDetail,
      listHref: ADMIN_ENTITY_ROUTES.advertisers,
    },
    searchable: true,
    searchLimit: 8,
  },
  partner: {
    type: "partner",
    label: "Partner",
    pluralLabel: "partners",
    icon: "handshake",
    badgeClassName: "text-primary bg-primary/10 border-primary/20",
    access: {
      roles: ["admin", "super_admin"],
      permission: "rewards:read",
    },
    navigation: {
      strategy: "drawer-query",
      href: ADMIN_ENTITY_ROUTES.partnerDetail,
      listHref: ADMIN_ENTITY_ROUTES.partners,
    },
    searchable: true,
    searchLimit: 8,
  },
  organisation: {
    type: "organisation",
    label: "Organisation",
    pluralLabel: "organisations",
    icon: "landmark",
    badgeClassName: "text-muted-foreground bg-muted border-border",
    access: {
      roles: ["admin", "super_admin"],
      permission: "rewards:read",
    },
    navigation: {
      strategy: "drawer-query",
      href: ADMIN_ENTITY_ROUTES.organisationDetail,
      listHref: ADMIN_ENTITY_ROUTES.organisations,
    },
    searchable: true,
    searchLimit: 8,
  },
  reward_catalog: {
    type: "reward_catalog",
    label: "Reward",
    pluralLabel: "rewards",
    icon: "gift",
    badgeClassName: "text-warning bg-warning/15 border-warning/20",
    access: {
      roles: ["admin", "super_admin"],
      permission: "rewards:read",
    },
    navigation: {
      strategy: "section-query",
      href: ADMIN_ENTITY_ROUTES.rewardCatalogDetail,
      listHref: REWARDS_ROUTES.section("catalog"),
    },
    searchable: true,
    searchLimit: 8,
  },
  route: {
    type: "route",
    label: "Route",
    pluralLabel: "routes",
    icon: "route",
    badgeClassName: "text-secondary-foreground bg-secondary border-border",
    access: {
      roles: ["admin", "super_admin", "moderator", "compliance_officer", "government"],
      permission: "routes:read",
    },
    navigation: {
      strategy: "drawer-query",
      href: ADMIN_ENTITY_ROUTES.routeDetail,
      listHref: ADMIN_ENTITY_ROUTES.routes,
    },
    /** Enabled for cross-entity operational search. */
    searchable: true,
    searchLimit: 8,
  },
  fulfilment_item: {
    type: "fulfilment_item",
    label: "Fulfilment",
    pluralLabel: "fulfilment items",
    icon: "package",
    badgeClassName: "text-muted-foreground bg-muted border-border",
    access: {
      roles: ["admin", "super_admin", "compliance_officer"],
      permission: "rewards:read",
    },
    navigation: {
      strategy: "detail-page",
      href: ADMIN_ENTITY_ROUTES.fulfilmentQueueDetail,
      listHref: FULFILMENT_ROUTES.queue,
    },
    searchable: true,
    searchLimit: 8,
  },
};

export function getSearchableEntity(
  type: SearchableEntityType,
): SearchableEntityDefinition {
  return SEARCHABLE_ENTITY_REGISTRY[type];
}

export function listSearchableEntityDefinitions(): SearchableEntityDefinition[] {
  return Object.values(SEARCHABLE_ENTITY_REGISTRY);
}

/** Entities that currently run a search provider. */
export function listActiveSearchableEntities(): SearchableEntityDefinition[] {
  return listSearchableEntityDefinitions().filter((e) => e.searchable);
}
