import { ADMIN_ENTITY_ROUTES } from "@/lib/adminEntityRoutes";
import { FULFILMENT_ROUTES, REWARDS_ROUTES } from "@/lib/adminIaRoutes";
import type {
  SearchableEntityDefinition,
  SearchableEntityType,
} from "@/lib/search/types";

/**
 * Single source of truth for searchable Admin entities.
 * Access is capability-first via the Dashboard Capability Registry.
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
    access: { capability: "users.read" },
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
    access: { capability: "campaigns.read" },
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
    access: { capability: "riders.read" },
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
    access: { capability: "advertisers.manage" },
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
    access: { capability: "fulfilment.read" },
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
    access: { capability: "fulfilment.read" },
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
    access: { capability: "rewards.catalog.read" },
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
    access: { capability: "routes.read" },
    navigation: {
      strategy: "drawer-query",
      href: ADMIN_ENTITY_ROUTES.routeDetail,
      listHref: ADMIN_ENTITY_ROUTES.routes,
    },
    searchable: true,
    searchLimit: 8,
  },
  fulfilment_item: {
    type: "fulfilment_item",
    label: "Fulfilment",
    pluralLabel: "fulfilment items",
    icon: "package",
    badgeClassName: "text-muted-foreground bg-muted border-border",
    access: { capability: "fulfilment.read" },
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
