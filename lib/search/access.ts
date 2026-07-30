import {
  hasAdminPermission,
  normalizeAdminRole,
} from "@/lib/authPermissions";
import type { SearchableEntityDefinition } from "@/lib/search/types";
import type { UserRole } from "@/schemas";

/**
 * Whether the caller may see/search this entity type.
 * Combines sidebar-aligned roles with optional ROLE_PERMISSIONS checks.
 */
export function canAccessSearchableEntity(
  entity: SearchableEntityDefinition,
  role: string | null | undefined,
): boolean {
  const normalized = normalizeAdminRole(role);
  if (!normalized) return false;

  if (!entity.access.roles.includes(normalized as UserRole)) {
    return false;
  }

  if (
    entity.access.permission &&
    !hasAdminPermission(normalized, entity.access.permission)
  ) {
    return false;
  }

  return true;
}
