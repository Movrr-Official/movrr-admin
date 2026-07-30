export type {
  SearchEntityIconKey,
  SearchNavigationStrategy,
  SearchProviderHit,
  SearchResult,
  SearchableEntityAccess,
  SearchableEntityDefinition,
  SearchableEntityNavigation,
  SearchableEntityType,
} from "@/lib/search/types";

export {
  SEARCHABLE_ENTITY_REGISTRY,
  getSearchableEntity,
  listActiveSearchableEntities,
  listSearchableEntityDefinitions,
} from "@/lib/search/registry";

export { canAccessSearchableEntity } from "@/lib/search/access";

export {
  clearRecentSearches,
  getRecentSearches,
  pushRecentSearch,
  type RecentSearchItem,
} from "@/lib/search/recentSearches";
