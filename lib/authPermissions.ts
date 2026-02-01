import type { UserRole } from "@/schemas";

export const normalizeAdminRole = (
  role?: string | null,
): UserRole | undefined => {
  if (!role) return undefined;
  return role.replace("-", "_") as UserRole;
};

export const ADMIN_ONLY_ROLES = [
  "admin",
  "super_admin",
] as const satisfies readonly UserRole[];

export const ADMIN_MODERATOR_ROLES = [
  "admin",
  "super_admin",
  "moderator",
] as const satisfies readonly UserRole[];
