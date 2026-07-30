import type { UserRole } from "@/schemas";

/**
 * How an entity detail is opened in Admin.
 * Extensible: add strategies without changing SearchDialog.
 */
export type SearchNavigationStrategy =
  | "drawer-query"
  | "detail-page"
  | "section-query";

/** Stable searchable entity keys. */
export type SearchableEntityType =
  | "user"
  | "campaign"
  | "rider"
  | "advertiser"
  | "partner"
  | "organisation"
  | "reward_catalog"
  | "route"
  | "fulfilment_item";

/** Lucide icon keys resolved on the client. */
export type SearchEntityIconKey =
  | "user"
  | "megaphone"
  | "bike"
  | "building"
  | "handshake"
  | "landmark"
  | "gift"
  | "route"
  | "package"
  | "search";

export interface SearchableEntityNavigation {
  strategy: SearchNavigationStrategy;
  /** Canonical Admin destination for this entity id. */
  href: (id: string) => string;
  /** List / hub URL for browse shortcuts in the search idle state. */
  listHref: string;
}

export interface SearchableEntityAccess {
  /**
   * Preferred: capability from the Dashboard Capability Registry.
   */
  capability?: string;
  /**
   * @deprecated Prefer `capability`. Legacy role allow-list fallback.
   */
  roles?: readonly UserRole[];
  /**
   * @deprecated Prefer `capability`. Legacy permission string bridge.
   */
  permission?: string;
}

export interface SearchableEntityDefinition {
  type: SearchableEntityType;
  label: string;
  pluralLabel: string;
  icon: SearchEntityIconKey;
  badgeClassName: string;
  access: SearchableEntityAccess;
  navigation: SearchableEntityNavigation;
  /**
   * When true, a search provider must be registered and will run in globalSearch.
   * When false, entity is registry-ready for future enablement only.
   */
  searchable: boolean;
  /** Per-entity fetch cap before global merge. */
  searchLimit: number;
}

/**
 * Wire-format search hit returned to the client.
 * Destination lives on the result — SearchDialog must not invent routes.
 */
export interface SearchResult {
  id: string;
  type: SearchableEntityType;
  title: string;
  subtitle?: string;
  status?: string;
  avatarUrl?: string;
  relevance: number;
  /** Canonical navigation target from the registry. */
  href: string;
  navigationStrategy: SearchNavigationStrategy;
  label: string;
  icon: SearchEntityIconKey;
  badgeClassName: string;
}

/** Intermediate hit produced by a provider before registry enrichment. */
export interface SearchProviderHit {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  avatarUrl?: string;
  relevance: number;
}
