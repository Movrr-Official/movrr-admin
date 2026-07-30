import { hasCapability } from "@/lib/authPermissions";
import { getSearchEntityCapability } from "@/features/authorization/dashboardRegistry";
import type { SearchableEntityDefinition } from "@/lib/search/types";

/**
 * Whether the caller may see/search this entity type.
 * Capability-first: derives from Dashboard Capability Registry.
 */
export function canAccessSearchableEntity(
  entity: SearchableEntityDefinition,
  role: string | null | undefined,
): boolean {
  const capability =
    entity.access.capability ??
    getSearchEntityCapability(entity.type) ??
    (entity.access.permission?.includes(".")
      ? entity.access.permission
      : undefined);

  if (capability) {
    return hasCapability(role, capability);
  }

  // Legacy fallback during migration
  if (entity.access.roles?.length) {
    const normalized = role?.replace(/-/g, "_");
    if (!normalized || !entity.access.roles.includes(normalized as never)) {
      return false;
    }
  }

  return false;
}
